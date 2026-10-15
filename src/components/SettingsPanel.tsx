import { useState } from 'react';
import type { Settings } from '../../shared/types.ts';
import { api } from '../api.ts';

interface Props {
  settings: Settings;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function SettingsPanel({ settings, onClose, onChanged }: Props) {
  const [s, setS] = useState(settings);
  return (
    <div className="panel-body">
      <div className="panel-head">
        <h2>Settings</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        await api.saveSettings(s);
        await onChanged();
        onClose();
      }}>
        <label>Your name (shown to friends)
          <input value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.shareMedsByDefault}
            onChange={(e) => setS({ ...s, shareMedsByDefault: e.target.checked })} />
          Share prescriptions and OTC meds with friends by default
        </label>
        <p className="muted small">
          Supplements are shared by default. Any item can override this from its Edit screen.
          Sharing with friends is coming next; nothing leaves your computer yet.
        </p>
        <div className="toolbar"><button className="primary" type="submit">Save</button></div>
      </form>
    </div>
  );
}
