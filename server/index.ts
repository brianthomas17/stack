import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Item, ItemReport, Report, Settings, StackReport } from '../shared/types.ts';
import * as store from './store.ts';
import { researchItem, researchStack } from './research.ts';
import { claudeStatus, startLogin } from './claude.ts';
import { clearChat, resetStuckChats, sendMessage } from './chat.ts';
import { initAutoCommit } from './autocommit.ts';
import * as friends from './friends.ts';
import { applyUpdate, updateStatus, updatesEnabled } from './update.ts';

const PORT = Number(process.env.STACK_API_PORT ?? 5174);
const MAX_PARALLEL = 3;

const app = express();

// This server holds health data and can spend your Claude usage, so only this
// computer may talk to it. Checking Host stops DNS-rebinding tricks; checking
// Origin stops other websites from posting to it from your browser.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originHost = origin ? origin.replace(/^https?:\/\//, '') : undefined;
  if (!LOCAL_HOST.test(req.headers.host ?? '') || (originHost !== undefined && !LOCAL_HOST.test(originHost))) {
    return res.status(403).json({ error: 'Stack only accepts requests from this computer' });
  }
  next();
});
app.use(express.json({ limit: '1mb' }));

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Research runs take minutes, so they're queued and the UI polls report status.
let active = 0;
const queue: (() => Promise<void>)[] = [];
function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}
function pump() {
  while (active < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}

async function run<R extends Report>(report: R, work: () => Promise<R['findings']>) {
  try {
    report.findings = await work();
    report.status = 'ready';
  } catch (e) {
    report.status = 'failed';
    report.error = e instanceof Error ? e.message : String(e);
  }
  report.finishedAt = new Date().toISOString();
  await store.saveReport(report);
}

function newReportId(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`;
}

function cleanItem(body: Partial<Item>, existing?: Item): Item {
  const merged = { ...existing, ...body } as Item;
  return {
    ...merged,
    name: (merged.name ?? '').trim(),
    kind: merged.kind ?? 'supplement',
    timing: merged.timing ?? [],
    servingsPerDay: Number(merged.servingsPerDay) || 1,
    testing: merged.testing ?? { status: 'unknown', certifications: [] },
    status: merged.status ?? 'active',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/update', wrap(async (req, res) => {
  res.json(await updateStatus(req.query.check === '1'));
}));

app.post('/api/update', wrap(async (_req, res) => {
  await applyUpdate();
  res.json({ restarting: true });
}));

app.get('/api/claude/status', wrap(async (_req, res) => {
  res.json(await claudeStatus());
}));

app.post('/api/claude/login', wrap(async (_req, res) => {
  startLogin();
  res.status(202).json(await claudeStatus());
}));

// Never start research on API billing: only a Claude subscription login is allowed.
async function requireSubscription(res: Response) {
  const s = await claudeStatus();
  if (s.subscription) return true;
  res.status(409).json({
    error: !s.installed
      ? 'Claude Code is not installed. See the README.'
      : s.loggedIn
        ? 'Claude is signed in with API billing. Click "Connect Claude" to switch to your subscription.'
        : 'Claude is not connected. Click "Connect Claude" at the top of the page.',
  });
  return false;
}

app.get('/api/state', wrap(async (_req, res) => {
  const [settings, items, reports] = await Promise.all([
    store.getSettings(),
    store.listItems(),
    store.listReports(),
  ]);
  res.json({ settings, items, reports, dataDir: store.DATA_DIR });
}));

app.put('/api/settings', wrap(async (req, res) => {
  const settings: Settings = { ...(await store.getSettings()), ...req.body };
  await store.saveSettings(settings);
  res.json(settings);
}));

app.post('/api/items', wrap(async (req, res) => {
  const item = cleanItem(req.body);
  if (!item.name) return res.status(400).json({ error: 'Name is required' });
  item.id = await store.uniqueId(item.name);
  item.startedAt ??= new Date().toISOString().slice(0, 10);
  await store.saveItem(item);
  res.status(201).json(item);
}));

app.put('/api/items/:id', wrap(async (req, res) => {
  const existing = await store.getItem(req.params.id as string);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const item = cleanItem({ ...req.body, id: existing.id }, existing);
  await store.saveItem(item);
  res.json(item);
}));

app.delete('/api/items/:id', wrap(async (req, res) => {
  await store.deleteItem(req.params.id as string);
  res.status(204).end();
}));

async function startItemResearch(item: Item) {
  const report: ItemReport = {
    id: newReportId(item.id),
    type: 'item',
    itemId: item.id,
    createdAt: new Date().toISOString(),
    status: 'running',
  };
  await store.saveReport(report);
  enqueue(() => run(report, () => researchItem(item)));
  return report;
}

app.post('/api/items/:id/research', wrap(async (req, res) => {
  const item = await store.getItem(req.params.id as string);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!(await requireSubscription(res))) return;
  res.status(202).json(await startItemResearch(item));
}));

// Queues every active item, skipping ones already running or waiting for review
// so a second click doesn't duplicate work or bury unreviewed findings.
app.post('/api/research/all', wrap(async (_req, res) => {
  if (!(await requireSubscription(res))) return;
  const [items, reports] = await Promise.all([store.listItems(), store.listReports()]);
  const busy = new Set(
    reports.filter((r) => r.type === 'item' && (r.status === 'running' || r.status === 'ready'))
      .map((r) => (r as ItemReport).itemId),
  );
  const todo = items.filter((i) => i.status === 'active' && !busy.has(i.id));
  for (const item of todo) await startItemResearch(item);
  res.status(202).json({ queued: todo.length, skipped: items.filter((i) => i.status === 'active').length - todo.length });
}));

app.post('/api/stack/research', wrap(async (_req, res) => {
  const items = (await store.listItems()).filter((i) => i.status === 'active');
  if (!items.length) return res.status(400).json({ error: 'No active items to review' });
  if (!(await requireSubscription(res))) return;
  const report: StackReport = {
    id: newReportId('stack'),
    type: 'stack',
    createdAt: new Date().toISOString(),
    status: 'running',
  };
  await store.saveReport(report);
  enqueue(() => run(report, () => researchStack(items)));
  res.status(202).json(report);
}));

app.get('/api/items/:id/chat', wrap(async (req, res) => {
  res.json(await store.getChat(req.params.id as string));
}));

app.post('/api/items/:id/chat', wrap(async (req, res) => {
  const item = await store.getItem(req.params.id as string);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'Message is empty' });
  if (!(await requireSubscription(res))) return;
  try {
    res.status(202).json(await sendMessage(item, text));
  } catch (e) {
    res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
  }
}));

app.delete('/api/items/:id/chat', wrap(async (req, res) => {
  await clearChat(req.params.id as string);
  res.json(await store.getChat(req.params.id as string));
}));

// Accepting copies findings onto the item. Product details only fill blanks,
// and "why" only replaces yours if you ask, so your own notes aren't clobbered.
app.get('/api/friends', wrap(async (_req, res) => {
  res.json(await friends.friendsState());
}));

app.get('/api/friends/preview', wrap(async (_req, res) => {
  res.json(await friends.buildProfile());
}));

const friendsAction = (fn: (body: Record<string, unknown>) => Promise<unknown>) =>
  wrap(async (req, res) => {
    try {
      await fn(req.body ?? {});
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
    res.json(await friends.friendsState());
  });

app.post('/api/friends/create', friendsAction((b) => friends.createGroup(String(b.groupName ?? '').trim())));
app.post('/api/friends/join', friendsAction((b) => friends.joinGroup(String(b.invite ?? ''))));
app.post('/api/friends/publish', friendsAction(() => friends.publish()));
app.post('/api/friends/auto-publish', friendsAction((b) => friends.setAutoPublish(Boolean(b.on))));
app.post('/api/friends/leave', friendsAction(() => friends.leaveGroup()));

/** Applies a ready report to its item. Returns an error message if it can't. */
async function acceptReport(report: Report, replaceWhy: boolean): Promise<string | undefined> {
  if (report.status !== 'ready' || !report.findings) return 'Report is not ready';
  if (report.type === 'item') {
    const item = await store.getItem(report.itemId);
    if (!item) return 'Item no longer exists';
    const f = report.findings;
    const now = new Date().toISOString();
    item.research = {
      summary: f.summary,
      verdict: f.verdict,
      typicalDose: f.typicalDose,
      doseAssessment: f.doseAssessment,
      evidence: f.evidence,
      redFlags: f.redFlags,
      alternatives: f.alternatives,
      updatedAt: now,
    };
    item.testing = { ...f.testing, checkedAt: now };
    if (replaceWhy || !item.why) item.why = f.why;
    const p = f.productDetails ?? {};
    item.brand ||= p.brand;
    item.product ||= p.product;
    item.price ??= p.price;
    item.servingsPerContainer ??= p.servingsPerContainer;
    if (!item.dose && p.servingSize) item.dose = p.servingSize;
    await store.saveItem(item);
  }
  report.status = 'accepted';
  await store.saveReport(report);
}

app.post('/api/reports/:id/accept', wrap(async (req, res) => {
  const report = await store.getReport(req.params.id as string);
  if (!report) return res.status(404).json({ error: 'Not found' });
  const error = await acceptReport(report, Boolean(req.body?.replaceWhy));
  if (error) return res.status(400).json({ error });
  res.json(report);
}));

// Accepts the newest ready report for every item. Your own "why" is kept.
app.post('/api/reports/accept-all', wrap(async (_req, res) => {
  const seen = new Set<string>();
  let accepted = 0;
  const failed: string[] = [];
  for (const r of await store.listReports()) {
    if (r.type !== 'item' || r.status !== 'ready' || seen.has(r.itemId)) continue;
    seen.add(r.itemId);
    const error = await acceptReport(r, false);
    if (error) failed.push(`${r.itemId}: ${error}`);
    else accepted++;
  }
  res.json({ accepted, failed });
}));

app.post('/api/reports/:id/dismiss', wrap(async (req, res) => {
  const report = await store.getReport(req.params.id as string);
  if (!report) return res.status(404).json({ error: 'Not found' });
  report.status = 'dismissed';
  await store.saveReport(report);
  res.json(report);
}));

// Installed copies serve the built page from this same server, on one port.
const DIST = path.resolve('dist');
if (process.env.STACK_INSTALLED === '1' && existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

await store.ensureDataDir();
initAutoCommit(store.DATA_DIR);
friends.initAutoPublish();
// A run that was in flight when the server stopped will never finish.
for (const r of await store.listReports()) {
  if (r.status === 'running') {
    await store.saveReport({ ...r, status: 'failed', error: 'Server restarted during research. Run it again.' });
  }
}

await resetStuckChats((await store.listItems()).map((i) => i.id));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Stack ${updatesEnabled ? 'app' : 'API'} on http://localhost:${PORT} (data: ${store.DATA_DIR})`);
});
