import { useCallback, useEffect, useMemo, useState } from 'react';
import { dailyCost, type Item, type StackReport, type Timing } from '../shared/types.ts';
import { api, type State } from './api.ts';
import { money } from './format.ts';
import { ItemRow } from './components/ItemRow.tsx';
import { ItemPanel } from './components/ItemPanel.tsx';
import { StackPanel } from './components/StackPanel.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { ClaudeConnect } from './components/ClaudeConnect.tsx';
import { FriendsView } from './components/FriendsView.tsx';

type Panel = { kind: 'item'; id: string } | { kind: 'new' } | { kind: 'stack' } | { kind: 'settings' } | null;

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [showStopped, setShowStopped] = useState(false);
  const [view, setView] = useState<'stack' | 'friends'>(() => (location.hash === '#friends' ? 'friends' : 'stack'));
  useEffect(() => {
    history.replaceState(null, '', view === 'friends' ? '#friends' : location.pathname);
  }, [view]);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  const running = state?.reports.some((r) => r.status === 'running') ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const active = useMemo(() => state?.items.filter((i) => i.status === 'active') ?? [], [state]);
  const stopped = useMemo(() => state?.items.filter((i) => i.status === 'stopped') ?? [], [state]);

  const totals = useMemo(() => {
    const costs = active.map(dailyCost);
    const known = costs.filter((c): c is number => c !== undefined);
    const day = known.reduce((a, b) => a + b, 0);
    return { day, month: day * 30.4, missing: costs.length - known.length };
  }, [active]);

  const latestByItem = useMemo(() => {
    const map = new Map<string, State['reports'][number]>();
    for (const r of state?.reports ?? []) if (r.type === 'item' && !map.has(r.itemId)) map.set(r.itemId, r);
    return map;
  }, [state]);

  const latestStack = state?.reports.find((r): r is StackReport => r.type === 'stack');
  const toReview = state?.reports.filter((r) => r.type === 'item' && r.status === 'ready').length ?? 0;
  const researching = state?.reports.filter((r) => r.type === 'item' && r.status === 'running').length ?? 0;

  const acceptAll = async () => {
    if (!confirm(`Accept all ${toReview} research reports? Each item gets its new research, testing status and red flags, and empty price, dose and brand fields are filled in. Your own "why" notes are kept.`)) return;
    try {
      const { failed } = await api.acceptAll();
      setError(failed.length ? `Some reports couldn't be accepted: ${failed.join('; ')}` : null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const researchAll = async () => {
    const n = active.length;
    if (!confirm(`Research all ${n} active items? Claude runs 3 at a time on your subscription, so this takes a while. Items already running or waiting for review are skipped.`)) return;
    try {
      const { queued } = await api.researchAll();
      if (!queued) setError('Everything is already researching or waiting for your review.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!state) {
    return <div className="boot">{error ? `Can't reach the API: ${error}` : 'Loading…'}</div>;
  }

  const section = (timing: Timing, label: string) => {
    const items = active.filter((i) => i.timing.includes(timing));
    return (
      <section className="section">
        <h2>
          {label} <span className="count">{items.length}</span>
          <span className="section-cost">{money(items.reduce((a, i) => a + (dailyCost(i) ?? 0), 0))}/day</span>
        </h2>
        {items.length === 0 && <p className="empty">Nothing here yet.</p>}
        <ul className="rows">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              settings={state.settings}
              report={latestByItem.get(item.id)}
              onOpen={() => setPanel({ kind: 'item', id: item.id })}
            />
          ))}
        </ul>
      </section>
    );
  };

  const unscheduled = active.filter((i) => i.timing.length === 0);
  const openItem: Item | undefined = panel?.kind === 'item' ? state.items.find((i) => i.id === panel.id) : undefined;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Stack</h1>
          <div className="switch" role="tablist">
            <button role="tab" aria-selected={view === 'stack'} className={view === 'stack' ? 'active' : ''}
              onClick={() => setView('stack')}>My stack</button>
            <button role="tab" aria-selected={view === 'friends'} className={view === 'friends' ? 'active' : ''}
              onClick={() => setView('friends')}>Friends</button>
          </div>
        </div>
        <div className="totals">
          <div className="stat">
            <span className="stat-value">{money(totals.day)}</span>
            <span className="stat-label">per day</span>
          </div>
          <div className="stat">
            <span className="stat-value">{money(totals.month, 0)}</span>
            <span className="stat-label">per month</span>
          </div>
          <div className="stat">
            <span className="stat-value">{active.length}</span>
            <span className="stat-label">active</span>
          </div>
        </div>
        <div className="actions">
          <button onClick={researchAll}>
            Research everything
            {researching > 0 && <span className="running-count"><span className="dot running" /> {researching}</span>}
          </button>
          <button onClick={() => setPanel({ kind: 'stack' })}>
            Interactions
            {latestStack?.status === 'running' && <span className="dot running" />}
          </button>
          <button onClick={() => setPanel({ kind: 'settings' })}>Settings</button>
          <button className="primary" onClick={() => setPanel({ kind: 'new' })}>Add item</button>
        </div>
      </header>

      <ClaudeConnect />
      {error && <div className="banner error">{error}</div>}
      {view === 'friends' ? (
        <FriendsView settings={state.settings} myItems={state.items} onSettingsChanged={refresh} />
      ) : <>
      {totals.missing > 0 && (
        <div className="banner">
          {totals.missing} active item{totals.missing === 1 ? ' has' : 's have'} no price yet, so the totals are incomplete.
          Running research fills in prices when it can find them.
        </div>
      )}
      {toReview > 0 && (
        <div className="banner info banner-action">
          <span>
            {toReview} research report{toReview === 1 ? ' is' : 's are'} ready to review. Open an item with a
            "Review" badge, or accept them all at once.
          </span>
          <button className="primary" onClick={acceptAll}>Accept all</button>
        </div>
      )}

      <main className="columns">
        {section('am', 'Morning')}
        {section('pm', 'Evening')}
      </main>

      {unscheduled.length > 0 && (
        <section className="section">
          <h2>No time set <span className="count">{unscheduled.length}</span></h2>
          <ul className="rows">
            {unscheduled.map((item) => (
              <ItemRow key={item.id} item={item} settings={state.settings} report={latestByItem.get(item.id)}
                onOpen={() => setPanel({ kind: 'item', id: item.id })} />
            ))}
          </ul>
        </section>
      )}

      {stopped.length > 0 && (
        <section className="section">
          <button className="link" onClick={() => setShowStopped((s) => !s)}>
            {showStopped ? 'Hide' : 'Show'} stopped ({stopped.length})
          </button>
          {showStopped && (
            <ul className="rows">
              {stopped.map((item) => (
                <ItemRow key={item.id} item={item} settings={state.settings} report={latestByItem.get(item.id)}
                  onOpen={() => setPanel({ kind: 'item', id: item.id })} />
              ))}
            </ul>
          )}
        </section>
      )}

      </>}

      <footer className="foot muted">
        Data: <code>{state.dataDir}</code> · Research is informational, not medical advice.
      </footer>

      {panel && (
        <div className="scrim" onClick={() => setPanel(null)}>
          <aside className="panel" onClick={(e) => e.stopPropagation()}>
            {panel.kind === 'new' && (
              <ItemPanel
                settings={state.settings}
                reports={[]}
                onClose={() => setPanel(null)}
                onChanged={async (saved) => {
                  await refresh();
                  if (saved) setPanel({ kind: 'item', id: saved.id });
                }}
              />
            )}
            {panel.kind === 'item' && openItem && (
              <ItemPanel
                key={openItem.id}
                item={openItem}
                settings={state.settings}
                reports={state.reports.filter((r) => r.type === 'item' && r.itemId === openItem.id)}
                onClose={() => setPanel(null)}
                onChanged={async (saved) => {
                  await refresh();
                  if (!saved) setPanel(null);
                }}
              />
            )}
            {panel.kind === 'stack' && (
              <StackPanel
                reports={state.reports.filter((r): r is StackReport => r.type === 'stack')}
                onClose={() => setPanel(null)}
                onChanged={refresh}
              />
            )}
            {panel.kind === 'settings' && (
              <SettingsPanel settings={state.settings} onClose={() => setPanel(null)} onChanged={refresh} />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
