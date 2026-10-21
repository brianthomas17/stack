import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { onChange } from './store.ts';

const run = promisify(execFile);

// If the data folder is a git repo, every change gets committed (and pushed, if
// it has a remote) a few seconds after writes go quiet. Writes in a burst, like
// a chat reply followed by its learnings refresh, land as one commit.
const QUIET_MS = 8000;

let dataDir = '';
let enabled = false;
let timer: NodeJS.Timeout | undefined;
let running: Promise<void> = Promise.resolve();
const changes = new Map<string, Set<string>>();

const LABELS: Record<string, string> = {
  supplements: 'items',
  reports: 'research',
  chats: 'chats',
};

export function initAutoCommit(dir: string) {
  dataDir = dir;
  enabled = process.env.STACK_DATA_AUTOCOMMIT !== 'false' && existsSync(path.join(dir, '.git'));
  if (enabled) onChange(noteChange);
  console.log(enabled ? `Auto-committing changes in ${dir}` : 'Data folder is not a git repo; auto-commit off');
}

/** Record that a file in the data folder changed. */
function noteChange(file: string) {
  if (!enabled) return;
  const [folder, name = ''] = path.relative(dataDir, file).split(path.sep);
  const label = LABELS[folder] ?? folder.replace(/\.json$/, '');
  // Reports are named <item>-<timestamp>; keep just the item for the message.
  const what = name.replace(/\.json$/, '').replace(/-\d{4}-\d{2}-\d{2}t.*$/i, '');
  if (!changes.has(label)) changes.set(label, new Set());
  if (what) changes.get(label)!.add(what);
  clearTimeout(timer);
  timer = setTimeout(() => (running = running.then(commit)), QUIET_MS);
}

function message() {
  const parts = [...changes].map(([label, names]) =>
    names.size ? `${label}: ${[...names].slice(0, 4).join(', ')}${names.size > 4 ? ` +${names.size - 4}` : ''}` : label);
  changes.clear();
  return `Update ${parts.join('; ')}`;
}

async function git(...args: string[]) {
  return run('git', args, { cwd: dataDir });
}

async function commit() {
  const msg = message();
  try {
    await git('add', '-A');
    const { stdout } = await git('status', '--porcelain');
    if (!stdout.trim()) return;
    await git('commit', '-q', '-m', msg);
    const { stdout: remotes } = await git('remote');
    if (remotes.trim()) await git('push', '-q');
  } catch (e) {
    // Never let backup trouble break the app; the next change tries again.
    console.error('Auto-commit failed:', e instanceof Error ? e.message : e);
  }
}
