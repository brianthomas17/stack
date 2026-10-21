import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  dailyCost, shouldShare,
  type FriendMember, type FriendsState, type Profile, type SharedItem,
} from '../shared/types.ts';
import * as store from './store.ts';

// Your membership key lives next to the app (gitignored), not in the data
// folder, so it never lands in a git repo.
const CONFIG_FILE = path.resolve(process.env.STACK_FRIENDS_FILE ?? '.friends.json');
const PUBLISH_QUIET_MS = 15000;

interface Config {
  server: string;
  groupId: string;
  memberId: string;
  key: string;
  inviteCode: string;
  autoPublish: boolean;
  lastPublishedAt?: string;
  lastError?: string;
}

async function loadConfig(): Promise<Config | undefined> {
  if (!existsSync(CONFIG_FILE)) return undefined;
  return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
}

async function saveConfig(config: Config) {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

function defaultServer() {
  return process.env.STACK_FRIENDS_URL?.replace(/\/+$/, '');
}

async function call<T>(server: string, method: string, pathname: string, key?: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${server}${pathname}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(key && { authorization: `Bearer ${key}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the friends server at ${server}`);
  }
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
    throw new Error(msg ?? `Friends server error (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Exactly what friends will see: shared items only, and never your private notes. */
export async function buildProfile(): Promise<Profile> {
  const [settings, items] = await Promise.all([store.getSettings(), store.listItems()]);
  const shared = items.filter((i) => shouldShare(i, settings));
  const out: SharedItem[] = await Promise.all(shared.map(async (i) => {
    const chat = await store.getChat(i.id);
    return {
      id: i.id,
      name: i.name,
      kind: i.kind,
      brand: i.brand,
      product: i.product,
      dose: i.dose,
      timing: i.timing,
      why: i.why,
      url: i.url,
      store: i.store,
      costPerDay: dailyCost(i),
      testing: { status: i.testing.status, certifications: i.testing.certifications },
      verdict: i.research?.verdict,
      redFlags: (i.research?.redFlags ?? []).map((f) => ({ title: f.title, severity: f.severity })),
      takeaways: chat.learnings?.takeaways ?? [],
      status: i.status,
      stopReason: i.stopReason,
      startedAt: i.startedAt,
    };
  }));
  return { name: settings.displayName || 'Someone', publishedAt: new Date().toISOString(), items: out };
}

export async function publish() {
  const config = await loadConfig();
  if (!config) throw new Error('Not in a friends group');
  try {
    await call(config.server, 'PUT', '/v1/profile', config.key, await buildProfile());
    config.lastPublishedAt = new Date().toISOString();
    delete config.lastError;
  } catch (e) {
    config.lastError = e instanceof Error ? e.message : String(e);
    await saveConfig(config);
    throw e;
  }
  await saveConfig(config);
}

interface Joined {
  groupId: string;
  groupName: string;
  inviteCode: string;
  memberId: string;
  key: string;
}

async function connect(server: string, joined: Joined) {
  await saveConfig({
    server,
    groupId: joined.groupId,
    memberId: joined.memberId,
    key: joined.key,
    inviteCode: joined.inviteCode,
    autoPublish: true,
  });
  await publish().catch(() => {});
}

async function memberName() {
  const name = (await store.getSettings()).displayName.trim();
  if (!name) throw new Error('Set your name first so friends know who you are');
  return name;
}

export async function createGroup(groupName: string) {
  const server = defaultServer();
  if (!server) throw new Error('No friends server configured. Set STACK_FRIENDS_URL in .env.');
  const joined = await call<Joined>(server, 'POST', '/v1/groups', undefined, { groupName, memberName: await memberName() });
  await connect(server, joined);
}

/** Accepts the full invite link (https://server/join/CODE). */
export async function joinGroup(invite: string) {
  let url: URL;
  try {
    url = new URL(invite.trim());
  } catch {
    throw new Error('Paste the whole invite link, starting with https://');
  }
  const code = url.pathname.match(/\/join\/([^/]+)/)?.[1];
  if (!code) throw new Error("That doesn't look like a Stack invite link");
  const joined = await call<Joined>(url.origin, 'POST', '/v1/join', undefined, { inviteCode: code, memberName: await memberName() });
  await connect(url.origin, joined);
}

export async function leaveGroup() {
  const config = await loadConfig();
  if (!config) return;
  await call(config.server, 'DELETE', '/v1/membership', config.key).catch(() => {});
  await rm(CONFIG_FILE, { force: true });
}

export async function setAutoPublish(on: boolean) {
  const config = await loadConfig();
  if (!config) throw new Error('Not in a friends group');
  config.autoPublish = on;
  await saveConfig(config);
}

export async function friendsState(): Promise<FriendsState> {
  const config = await loadConfig();
  if (!config) return { connected: false, canCreate: Boolean(defaultServer()) };
  const base = {
    connected: true as const,
    inviteLink: `${config.server}/join/${config.inviteCode}`,
    me: config.memberId,
    autoPublish: config.autoPublish,
    lastPublishedAt: config.lastPublishedAt,
  };
  try {
    const g = await call<{ groupName: string; members: FriendMember[] }>(config.server, 'GET', '/v1/group', config.key);
    return { ...base, groupName: g.groupName, members: g.members, error: config.lastError };
  } catch (e) {
    return { ...base, groupName: '', members: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// Republish a little while after your stack changes, so friends stay current.
let timer: NodeJS.Timeout | undefined;
export function initAutoPublish() {
  store.onChange((file) => {
    if (file.includes(`${path.sep}reports${path.sep}`)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const config = await loadConfig();
      if (config?.autoPublish) await publish().catch((e) => console.error('Auto-publish failed:', e.message));
    }, PUBLISH_QUIET_MS);
  });
}
