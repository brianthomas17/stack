import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FriendMember, FriendsState, Item, Profile, Settings, SharedItem } from '../../shared/types.ts';
import { api } from '../api.ts';
import { ago, money } from '../format.ts';
import { SeverityBadge, TestingBadge } from './Badges.tsx';

interface Props {
  settings: Settings;
  myItems: Item[];
  onSettingsChanged: () => Promise<void> | void;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function FriendsView({ settings, myItems, onSettingsChanged }: Props) {
  const [state, setState] = useState<FriendsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api.friends());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  // Pick up friends' changes while you're looking, and when you come back to the tab.
  useEffect(() => {
    const t = setInterval(load, 60000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const act = async (fn: () => Promise<FriendsState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <p className="muted">{error ?? 'Loading…'}</p>;

  return (
    <div className="friends">
      {error && <div className="banner error">{error}</div>}
      {state.connected
        ? <Group state={state} myItems={myItems} busy={busy} act={act} />
        : <Connect canCreate={state.canCreate} settings={settings} busy={busy} act={act} onSettingsChanged={onSettingsChanged} />}
    </div>
  );
}

function Connect({ canCreate, settings, busy, act, onSettingsChanged }: {
  canCreate: boolean;
  settings: Settings;
  busy: boolean;
  act: (fn: () => Promise<FriendsState>) => Promise<void>;
  onSettingsChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState(settings.displayName);
  const [groupName, setGroupName] = useState('');
  const [invite, setInvite] = useState('');

  // Your name is what friends see; save it before creating or joining.
  const withName = (fn: () => Promise<FriendsState>) => act(async () => {
    if (!name.trim()) throw new Error('Add your name first');
    if (name.trim() !== settings.displayName) {
      await api.saveSettings({ ...settings, displayName: name.trim() });
      await onSettingsChanged();
    }
    return fn();
  });

  return (
    <>
      <section className="card">
        <h2>Share your stack with friends</h2>
        <p className="muted">
          Friends in your group see the items you've marked as shared: what you take, when, why, the research
          verdict, testing status, and what you've learned. Prescriptions and OTC meds stay private unless you
          turn them on. Your stack republishes automatically when it changes.
        </p>
        <label className="field">Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brian" />
        </label>
      </section>

      <div className="connect-grid">
        <section className="card">
          <h3>Join a group</h3>
          <p className="muted small">Paste the invite link a friend sent you.</p>
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault();
            void withName(() => api.joinGroup(invite));
          }}>
            <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="https://…/join/…" />
            <button className="primary" disabled={busy || !invite.trim()}>Join</button>
          </form>
        </section>

        <section className="card">
          <h3>Start a group</h3>
          {canCreate ? (
            <>
              <p className="muted small">You'll get an invite link to send to friends.</p>
              <form className="inline-form" onSubmit={(e) => {
                e.preventDefault();
                void withName(() => api.createGroup(groupName));
              }}>
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" />
                <button className="primary" disabled={busy || !groupName.trim()}>Create</button>
              </form>
            </>
          ) : (
            <p className="muted small">
              Starting a group needs a friends server (<code>STACK_FRIENDS_URL</code> in <code>.env</code>).
              Joining with an invite link works without one.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function Group({ state, myItems, busy, act }: {
  state: Extract<FriendsState, { connected: true }>;
  myItems: Item[];
  busy: boolean;
  act: (fn: () => Promise<FriendsState>) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Profile | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const mine = useMemo(
    () => new Set(myItems.filter((i) => i.status === 'active').map((i) => norm(i.name))),
    [myItems],
  );
  const friends = state.members.filter((m) => m.id !== state.me);

  const copy = async () => {
    await navigator.clipboard.writeText(state.inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const togglePreview = async () => {
    if (!showPreview) setPreview(await api.friendsPreview());
    setShowPreview((s) => !s);
  };

  return (
    <>
      <section className="card group-bar">
        <div className="group-head">
          <div>
            <h2>{state.groupName || 'Your group'}</h2>
            <span className="muted small">
              {state.members.length} member{state.members.length === 1 ? '' : 's'}
              {state.lastPublishedAt && ` · you published ${ago(state.lastPublishedAt)}`}
            </span>
          </div>
          <div className="toolbar">
            <button onClick={() => act(api.publish)} disabled={busy}>Publish now</button>
            <label className="check">
              <input type="checkbox" checked={state.autoPublish}
                onChange={(e) => act(() => api.setAutoPublish(e.target.checked))} />
              Auto-publish
            </label>
          </div>
        </div>
        {state.error && <p className="error small">{state.error}</p>}
        <div className="invite">
          <span className="muted small">Invite link</span>
          <code>{state.inviteLink}</code>
          <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="toolbar">
          <button className="link" onClick={togglePreview}>
            {showPreview ? 'Hide' : 'See'} what friends see of your stack
          </button>
          <button className="link danger" disabled={busy} onClick={() => {
            if (confirm('Leave this group? Your published stack is removed from it.')) void act(api.leaveGroup);
          }}>Leave group</button>
        </div>
        {showPreview && preview && (
          <div className="preview">
            <p className="muted small">
              {preview.items.length} shared item{preview.items.length === 1 ? '' : 's'}. Change what's shared from
              each item's Edit screen, or Settings for prescriptions.
            </p>
            <StackColumns items={preview.items} mine={new Set()} />
          </div>
        )}
      </section>

      {friends.length === 0 && (
        <p className="muted">No one else has joined yet. Send them the invite link above.</p>
      )}
      {friends.map((m) => <FriendCard key={m.id} member={m} mine={mine} />)}
    </>
  );
}

function FriendCard({ member, mine }: { member: FriendMember; mine: Set<string> }) {
  const p = member.profile;
  const active = p?.items.filter((i) => i.status === 'active') ?? [];
  const shared = active.filter((i) => mine.has(norm(i.name)));
  const daily = active.reduce((a, i) => a + (i.costPerDay ?? 0), 0);

  return (
    <section className="card friend">
      <div className="group-head">
        <div>
          <h2>{member.name}</h2>
          <span className="muted small">
            {p ? `${active.length} active · ${money(daily)}/day · updated ${ago(p.publishedAt)}` : "Hasn't published yet"}
          </span>
        </div>
      </div>
      {shared.length > 0 && (
        <p className="small overlap">You both take {shared.map((i) => i.name).join(', ')}</p>
      )}
      {p && <StackColumns items={p.items} mine={mine} />}
    </section>
  );
}

function StackColumns({ items, mine }: { items: SharedItem[]; mine: Set<string> }) {
  const active = items.filter((i) => i.status === 'active');
  const stopped = items.filter((i) => i.status === 'stopped');
  const col = (label: string, list: SharedItem[]) => (
    <div>
      <h3>{label} <span className="count">{list.length}</span></h3>
      <ul className="rows">{list.map((i) => <FriendItem key={i.id} item={i} both={mine.has(norm(i.name))} />)}</ul>
    </div>
  );
  return (
    <>
      <div className="columns">
        {col('Morning', active.filter((i) => i.timing.includes('am')))}
        {col('Evening', active.filter((i) => i.timing.includes('pm')))}
      </div>
      {stopped.length > 0 && (
        <div className="stopped">
          <h3>Stopped</h3>
          <ul className="list small">
            {stopped.map((i) => <li key={i.id}><strong>{i.name}</strong>{i.stopReason ? `: ${i.stopReason}` : ''}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

function FriendItem({ item, both }: { item: SharedItem; both: boolean }) {
  const [open, setOpen] = useState(false);
  const flags = item.redFlags.filter((f) => f.severity !== 'low');
  return (
    <li>
      <button className="row" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="row-main">
          <div className="row-title">
            <span className="row-name">{item.name}</span>
            {item.kind !== 'supplement' && <span className="tag">{item.kind === 'prescription' ? 'Rx' : 'OTC'}</span>}
            {both && <span className="tag both">you too</span>}
          </div>
          <div className="row-sub">{[item.brand, item.dose].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="row-meta">
          {flags.length > 0 && <span className="pill bad">{flags.length} red flag{flags.length === 1 ? '' : 's'}</span>}
          {item.kind === 'supplement' && <TestingBadge status={item.testing.status} />}
        </div>
      </button>
      {open && (
        <div className="friend-detail">
          {item.verdict && <p className="verdict">{item.verdict}</p>}
          {item.why && <p><span className="muted">Why: </span>{item.why}</p>}
          {item.takeaways.length > 0 && (
            <>
              <h4>What they've learned</h4>
              <ul className="list">{item.takeaways.map((t, n) => <li key={n}>{t}</li>)}</ul>
            </>
          )}
          {item.redFlags.length > 0 && (
            <ul className="list">
              {item.redFlags.map((f, n) => <li key={n}><SeverityBadge severity={f.severity} /> {f.title}</li>)}
            </ul>
          )}
          <p className="muted small">
            {[item.product, item.costPerDay !== undefined && `${money(item.costPerDay)}/day`].filter(Boolean).join(' · ')}
            {item.url && <> · <a href={item.url} target="_blank" rel="noreferrer">{item.store || 'Link'}</a></>}
          </p>
        </div>
      )}
    </li>
  );
}
