import { useState } from 'react';
import type { Settings } from '../../shared/types.ts';
import { api } from '../api.ts';

interface Props {
  settings: Settings;
  onChanged: () => Promise<void> | void;
  onAdd: () => void;
  onFriends: () => void;
}

/** First-run guide for a fresh install with nothing in it yet. */
export function Welcome({ settings, onChanged, onAdd, onFriends }: Props) {
  const [name, setName] = useState(settings.displayName);
  const saved = Boolean(settings.displayName);

  return (
    <section className="card welcome">
      <h2>Welcome to Stack</h2>
      <ol className="steps">
        <li className={saved ? 'done' : ''}>
          <strong>Your name</strong>, so friends know whose stack they're looking at.
          {!saved && (
            <form className="inline-form" onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await api.saveSettings({ ...settings, displayName: name.trim() });
              await onChanged();
            }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              <button className="primary" disabled={!name.trim()}>Save</button>
            </form>
          )}
        </li>
        <li>
          <strong>Connect Claude</strong> with the button above if you see it. Research and chat run on your own
          Claude subscription.
        </li>
        <li>
          <strong>Add what you take.</strong> Name, link and AM/PM is enough; research fills in the rest.{' '}
          <button className="link" onClick={onAdd}>Add your first item</button>
        </li>
        <li>
          <strong>Join your friends</strong> with the invite link someone sent you.{' '}
          <button className="link" onClick={onFriends}>Open Friends</button>
        </li>
      </ol>
    </section>
  );
}
