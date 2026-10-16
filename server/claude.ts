import { spawn, type SpawnOptions } from 'node:child_process';
import { tmpdir } from 'node:os';

// Research must run on the user's Claude subscription, never pay-per-use API
// billing. An API key in the environment would take priority over the
// subscription login, so strip those before every `claude` call.
export function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.CLAUDE_CODE_USE_VERTEX;
  return env;
}

export function spawnClaude(args: string[], opts: SpawnOptions = {}) {
  // Run from a neutral directory so no project CLAUDE.md leaks in.
  return spawn('claude', args, { cwd: tmpdir(), env: claudeEnv(), ...opts });
}

export interface ClaudeStatus {
  installed: boolean;
  loggedIn: boolean;
  /** True only when signed in with a Claude subscription (not Console/API billing). */
  subscription: boolean;
  method?: string;
  loginInProgress: boolean;
  loginUrl?: string;
  error?: string;
}

const API_METHOD = /api|console/i;

let login: { url?: string; error?: string; running: boolean } | null = null;

export function claudeStatus(): Promise<ClaudeStatus> {
  return new Promise((resolve) => {
    let out = '';
    const child = spawnClaude(['auth', 'status', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', (d) => (out += d));
    child.on('error', () =>
      resolve({ installed: false, loggedIn: false, subscription: false, loginInProgress: false }));
    child.on('close', () => {
      const base = {
        installed: true,
        loginInProgress: login?.running ?? false,
        loginUrl: login?.url,
        error: login?.error,
      };
      try {
        const j = JSON.parse(out);
        const method = String(j.authMethod ?? 'none');
        const loggedIn = Boolean(j.loggedIn);
        resolve({ ...base, loggedIn, method, subscription: loggedIn && !API_METHOD.test(method) });
      } catch {
        resolve({ ...base, loggedIn: false, subscription: false, error: 'Could not read Claude login status' });
      }
    });
  });
}

/**
 * Starts `claude auth login --claudeai`, which opens the claude.ai sign-in page
 * in the default browser and finishes on its own once you approve. The UI polls
 * claudeStatus() to see when it's done.
 */
export function startLogin() {
  if (login?.running) return;
  login = { running: true };
  const state = login;
  const child = spawnClaude(['auth', 'login', '--claudeai'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const onData = (d: Buffer) => {
    // Surface the sign-in link in case the browser didn't open by itself.
    const url = d.toString().match(/https:\/\/\S+/)?.[0];
    if (url && !state.url) state.url = url;
  };
  child.stdout!.on('data', onData);
  child.stderr!.on('data', onData);
  child.on('error', (e) => {
    state.running = false;
    state.error = e.message;
  });
  child.on('close', (code) => {
    state.running = false;
    if (code !== 0 && !state.error) state.error = `Login ended without finishing (exit ${code}). Try again.`;
  });
  // Don't leave a login waiting forever if the tab is closed.
  setTimeout(() => state.running && child.kill(), 10 * 60 * 1000);
}
