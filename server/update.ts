import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const APP_DIR = process.cwd();
const win = process.platform === 'win32';

// Only installed copies update themselves. A developer checkout (npm run dev)
// manages its own git state.
export const updatesEnabled = process.env.STACK_INSTALLED === '1' && existsSync(path.join(APP_DIR, '.git'));

const CHECK_EVERY_MS = 60 * 60 * 1000;
let cache: { behind: number; checkedAt: number } | undefined;
let updating = false;

async function git(...args: string[]) {
  return (await run('git', args, { cwd: APP_DIR })).stdout.trim();
}

// npm is npm.cmd on Windows, which Node only runs through a shell.
async function npm(...args: string[]) {
  await run(win ? 'npm.cmd' : 'npm', args, { cwd: APP_DIR, shell: win });
}

export interface UpdateStatus {
  enabled: boolean;
  available: boolean;
  behind: number;
  updating: boolean;
}

export async function updateStatus(force = false): Promise<UpdateStatus> {
  if (!updatesEnabled) return { enabled: false, available: false, behind: 0, updating: false };
  if (force || !cache || Date.now() - cache.checkedAt > CHECK_EVERY_MS) {
    try {
      await git('fetch', '-q', 'origin');
      const behind = Number(await git('rev-list', '--count', 'HEAD..@{u}'));
      cache = { behind, checkedAt: Date.now() };
    } catch {
      cache = { behind: 0, checkedAt: Date.now() };
    }
  }
  return { enabled: true, available: cache.behind > 0, behind: cache.behind, updating };
}

/** Pulls, reinstalls and rebuilds, then exits so the background service restarts us on the new code. */
export async function applyUpdate() {
  if (!updatesEnabled) throw new Error('Updates are only for installed copies');
  if (updating) return;
  updating = true;
  try {
    await git('pull', '--ff-only', '-q');
    await npm('install', '--no-audit', '--no-fund');
    await npm('run', 'build');
  } catch (e) {
    updating = false;
    throw new Error(`Update failed: ${e instanceof Error ? e.message : e}`);
  }
  setTimeout(() => process.exit(0), 300);
}
