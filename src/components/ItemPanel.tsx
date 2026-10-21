import { useEffect, useRef, useState } from 'react';
import {
  costPerServing, dailyCost, shouldShare,
  type Chat, type Item, type ItemReport, type Report, type Settings,
} from '../../shared/types.ts';
import { api } from '../api.ts';
import { ago, date, money } from '../format.ts';
import { ItemForm } from './ItemForm.tsx';
import { Findings, ResearchView } from './Research.tsx';
import { TestingBadge } from './Badges.tsx';
import { Glance } from './Glance.tsx';
import { ChatDock, type ChatDockHandle } from './ChatDock.tsx';

interface Props {
  item?: Item;
  settings: Settings;
  reports: Report[];
  onClose: () => void;
  /** Called after any change. `saved` is undefined when the item was deleted. */
  onChanged: (saved?: Item) => Promise<void> | void;
}

export function ItemPanel({ item, settings, reports, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState(!item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceWhy, setReplaceWhy] = useState(false);
  const dockRef = useRef<ChatDockHandle>(null);
  const [chat, setChat] = useState<Chat>();

  const itemId = item?.id;
  useEffect(() => {
    if (itemId) api.chat(itemId).then(setChat).catch(() => {});
  }, [itemId]);

  // Poll while Claude is replying or refreshing the learnings digest.
  const chatBusy = Boolean(chat?.pending || chat?.summarizing);
  useEffect(() => {
    if (!itemId || !chatBusy) return;
    const t = setInterval(() => api.chat(itemId).then(setChat).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [itemId, chatBusy]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (editing || !item) {
    return (
      <div className="panel-body">
        <div className="panel-head">
          <h2>{item ? `Edit ${item.name}` : 'Add to your stack'}</h2>
          <button className="ghost" onClick={item ? () => setEditing(false) : onClose}>Cancel</button>
        </div>
        <ItemForm
          item={item}
          settings={settings}
          onSave={(draft) =>
            act(async () => {
              const saved = item ? await api.updateItem({ ...item, ...draft }) : await api.createItem(draft);
              setEditing(false);
              await onChanged(saved);
            })
          }
          onDelete={item && (() =>
            act(async () => {
              if (!confirm(`Delete ${item.name}? Its research history stays in your reports folder.`)) return;
              await api.deleteItem(item.id);
              await onChanged(undefined);
            }))}
        />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const latest = reports[0] as ItemReport | undefined;
  const running = latest?.status === 'running';
  const cps = costPerServing(item);
  const daily = dailyCost(item);

  const stop = () => {
    const reason = prompt(`Why are you stopping ${item.name}?`);
    if (reason === null) return;
    act(async () => {
      const saved = await api.updateItem({
        ...item, status: 'stopped', stopReason: reason, stoppedAt: new Date().toISOString().slice(0, 10),
      });
      await onChanged(saved);
    });
  };

  const restart = () =>
    act(async () => {
      const saved = await api.updateItem({
        ...item, status: 'active', stoppedAt: undefined, stopReason: undefined,
        startedAt: new Date().toISOString().slice(0, 10),
      });
      await onChanged(saved);
    });

  return (
    <div className="panel-body">
      <div className="panel-head">
        <div>
          <h2>{item.name}</h2>
          <div className="muted">
            {[item.brand, item.product].filter(Boolean).join(' · ') || 'No brand set'}
          </div>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="toolbar">
        <button className="primary" disabled={busy || running} onClick={() => act(async () => {
          await api.researchItem(item.id);
          await onChanged(item);
        })}>
          {running ? 'Researching…' : item.research ? 'Re-research with Claude' : 'Research with Claude'}
        </button>
        <button onClick={() => setEditing(true)}>Edit</button>
        {item.status === 'active'
          ? <button onClick={stop}>Stop taking</button>
          : <button onClick={restart}>Start again</button>}
      </div>
      {error && <p className="error">{error}</p>}

      {running && (
        <div className="banner info">
          Claude is searching for evidence, testing certifications, red flags and better-value alternatives.
          This usually takes a few minutes. You can close this panel.
        </div>
      )}
      {latest?.status === 'failed' && <div className="banner error">Last research run failed: {latest.error}</div>}

      {latest?.status === 'ready' && latest.findings && (
        <div className="findings-box">
          <div className="findings-head">
            <h3>New findings · {ago(latest.finishedAt ?? latest.createdAt)}</h3>
            <span className="muted">Nothing changes until you accept.</span>
          </div>
          <Findings findings={latest.findings} />
          <div className="toolbar">
            <button className="primary" disabled={busy} onClick={() => act(async () => {
              await api.accept(latest.id, replaceWhy);
              await onChanged(item);
            })}>Accept findings</button>
            <button disabled={busy} onClick={() => act(async () => {
              await api.dismiss(latest.id);
              await onChanged(item);
            })}>Dismiss</button>
            {item.why && (
              <label className="check">
                <input type="checkbox" checked={replaceWhy} onChange={(e) => setReplaceWhy(e.target.checked)} />
                Replace my "why" with Claude's
              </label>
            )}
          </div>
        </div>
      )}

      {item.status === 'stopped' && (
        <div className="banner">
          Stopped {date(item.stoppedAt)}{item.stopReason ? `: ${item.stopReason}` : ''}
        </div>
      )}

      <Glance item={item} chat={chat} onAsk={() => dockRef.current?.focus()} />

      <dl className="facts">
        <div><dt>Dose</dt><dd>{item.dose || '—'}</dd></div>
        <div><dt>When</dt><dd>{item.timing.map((t) => t.toUpperCase()).join(' + ') || '—'}</dd></div>
        <div><dt>Servings / day</dt><dd>{item.servingsPerDay}</dd></div>
        <div><dt>Per serving</dt><dd>{money(cps)}</dd></div>
        <div><dt>Per day</dt><dd>{money(daily)}</dd></div>
        <div><dt>Per month</dt><dd>{money(daily === undefined ? undefined : daily * 30.4)}</dd></div>
        <div>
          <dt>Bought from</dt>
          <dd>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.store || 'Link'}</a> : item.store || '—'}</dd>
        </div>
        <div><dt>Since</dt><dd>{date(item.startedAt) || '—'}</dd></div>
        <div><dt>Friends see it</dt><dd>{shouldShare(item, settings) ? 'Yes' : 'No'}</dd></div>
      </dl>

      <section className="block">
        <h3>Why I take it</h3>
        <p>{item.why || <span className="muted">Not written yet. Research will draft one, or add your own via Edit.</span>}</p>
        {item.notes && <p className="muted">{item.notes}</p>}
      </section>

      {item.kind === 'supplement' && (
        <section className="block">
          <h3>Third-party testing <TestingBadge status={item.testing.status} /></h3>
          {item.testing.certifications.length > 0 && <p>{item.testing.certifications.join(', ')}</p>}
          {item.testing.notes && <p className="muted">{item.testing.notes}</p>}
          {item.testing.checkedAt && <p className="muted small">Checked {date(item.testing.checkedAt)}</p>}
        </section>
      )}

      {item.research
        ? <ResearchView research={item.research} />
        : <p className="muted">No research yet. Hit "Research with Claude" to pull evidence, testing status and red flags.</p>}

      {reports.length > 1 && (
        <section className="block">
          <h3>History</h3>
          <ul className="history">
            {reports.map((r) => (
              <li key={r.id}>{date(r.createdAt)} · {r.status}</li>
            ))}
          </ul>
        </section>
      )}

      <ChatDock ref={dockRef} item={item} chat={chat} setChat={setChat} />
    </div>
  );
}
