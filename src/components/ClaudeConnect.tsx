import { useCallback, useEffect, useState } from 'react';
import { api, type ClaudeStatus } from '../api.ts';

/** Shows nothing once Claude is connected on a subscription; otherwise a one-click connect banner. */
export function ClaudeConnect() {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      setStatus(await api.claudeStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => void check(), [check]);

  // While the sign-in page is open, poll until it completes.
  const waiting = status?.loginInProgress ?? false;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(check, 2500);
    return () => clearInterval(t);
  }, [waiting, check]);

  if (!status || status.subscription) return null;

  const connect = async () => {
    setError(null);
    try {
      setStatus(await api.claudeLogin());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!status.installed) {
    return (
      <div className="banner error">
        Research needs Claude Code installed on this computer.{' '}
        <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Install it</a>, then reload this page.
      </div>
    );
  }

  return (
    <div className="banner connect">
      <div>
        <strong>
          {status.loggedIn ? 'Claude is signed in with API billing' : 'Connect Claude to run research'}
        </strong>
        <div className="small">
          {waiting
            ? 'Finish signing in on the claude.ai page that just opened. This updates by itself.'
            : status.loggedIn
              ? 'Research only runs on your Claude subscription, never pay-per-use API. Connect your Claude account to switch.'
              : 'Sign in once with your Claude account. It stays connected on this computer.'}
        </div>
        {waiting && status.loginUrl && (
          <div className="small">
            Didn't open? <a href={status.loginUrl} target="_blank" rel="noreferrer">Open the sign-in page</a>
          </div>
        )}
        {(error || (!waiting && status.error)) && <div className="small error">{error || status.error}</div>}
      </div>
      <button className="primary" disabled={waiting} onClick={connect}>
        {waiting ? 'Waiting for sign-in…' : 'Connect Claude'}
      </button>
    </div>
  );
}
