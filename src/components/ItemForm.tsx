import { useState, type FormEvent } from 'react';
import type { Item, Kind, Settings, Timing } from '../../shared/types.ts';

interface Props {
  item?: Item;
  settings: Settings;
  onSave: (draft: Partial<Item>) => void;
  onDelete?: () => void;
}

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function ItemForm({ item, settings, onSave, onDelete }: Props) {
  const [d, setD] = useState<Partial<Item>>(
    item ?? { kind: 'supplement', timing: ['am'], servingsPerDay: 1, status: 'active' },
  );
  const set = <K extends keyof Item>(k: K, v: Item[K] | undefined) => setD((p) => ({ ...p, [k]: v }));

  const toggleTiming = (t: Timing) => {
    const cur = d.timing ?? [];
    set('timing', cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  };

  const shareDefault = d.kind === 'supplement' || settings.shareMedsByDefault;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(d);
  };

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Name
        <input required autoFocus value={d.name ?? ''} onChange={(e) => set('name', e.target.value)}
          placeholder="Magnesium taurate" />
      </label>

      <div className="grid2">
        <label>
          Type
          <select value={d.kind} onChange={(e) => set('kind', e.target.value as Kind)}>
            <option value="supplement">Supplement</option>
            <option value="prescription">Prescription</option>
            <option value="otc">OTC medication</option>
          </select>
        </label>
        <fieldset>
          <legend>When</legend>
          <label className="check"><input type="checkbox" checked={d.timing?.includes('am') ?? false}
            onChange={() => toggleTiming('am')} /> AM</label>
          <label className="check"><input type="checkbox" checked={d.timing?.includes('pm') ?? false}
            onChange={() => toggleTiming('pm')} /> PM</label>
        </fieldset>
      </div>

      <div className="grid2">
        <label>Brand<input value={d.brand ?? ''} onChange={(e) => set('brand', e.target.value)} placeholder="NOW" /></label>
        <label>Product<input value={d.product ?? ''} onChange={(e) => set('product', e.target.value)} /></label>
      </div>

      <div className="grid2">
        <label>Dose<input value={d.dose ?? ''} onChange={(e) => set('dose', e.target.value)} placeholder="2 capsules (1000mg)" /></label>
        <label>Servings per day
          <input type="number" min="0" step="0.25" value={d.servingsPerDay ?? 1}
            onChange={(e) => set('servingsPerDay', num(e.target.value) ?? 1)} />
        </label>
      </div>

      <label>Link<input type="url" value={d.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></label>

      <div className="grid3">
        <label>Store<input value={d.store ?? ''} onChange={(e) => set('store', e.target.value)} placeholder="Amazon" /></label>
        <label>Price ($)<input type="number" min="0" step="0.01" value={d.price ?? ''}
          onChange={(e) => set('price', num(e.target.value))} /></label>
        <label>Servings / container<input type="number" min="0" value={d.servingsPerContainer ?? ''}
          onChange={(e) => set('servingsPerContainer', num(e.target.value))} /></label>
      </div>

      <label>Why I take it
        <textarea rows={3} value={d.why ?? ''} onChange={(e) => set('why', e.target.value)} />
      </label>
      <label>Notes
        <textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </label>

      <label>Share with friends
        <select
          value={d.share === undefined ? 'default' : d.share ? 'yes' : 'no'}
          onChange={(e) => set('share', e.target.value === 'default' ? undefined : e.target.value === 'yes')}
        >
          <option value="default">Default ({shareDefault ? 'shared' : 'private'})</option>
          <option value="yes">Shared</option>
          <option value="no">Private</option>
        </select>
      </label>

      <div className="toolbar">
        <button className="primary" type="submit">Save</button>
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}
