import { useEffect, useState } from 'react';
import { api } from '../api.ts';

/** Installed copies only: offers a one-click update when a new version is pushed. */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<'idle' | 'updating' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    api.updateStatus().then((s) => setAvailable(s.available)).catch(() => {});
  }, []);

  const update = async () => {
    setState('updating');
    try {
      await api.applyUpdate();
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    // The server restarts on the new version; wait for it, then reload.
    await new Promise((r) => setTimeout(r, 2000));
    for (let i = 0; i < 60; i++) {
      try {
        await api.health();
        location.reload();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    setState('error');
    setError('Stack did not come back after updating. Restart your computer, or run the installer again.');
  };

  if (!available) return null;
  return (
    <div className="banner info banner-action">
      <span>
        {state === 'updating' ? 'Updating Stack. This takes a minute, and the page reloads when it\'s done.'
          : state === 'error' ? error
          : 'A new version of Stack is available.'}
      </span>
      {state !== 'updating' && <button className="primary" onClick={update}>Update now</button>}
    </div>
  );
}
