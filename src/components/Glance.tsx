import { dailyCost, type Chat, type Item } from '../../shared/types.ts';
import { date, money } from '../format.ts';
import { TestingBadge } from './Badges.tsx';

interface Props {
  item: Item;
  chat?: Chat;
  onAsk: () => void;
}

/** The short version: verdict, the numbers that matter, and what you've learned. */
export function Glance({ item, chat, onAsk }: Props) {
  const r = item.research;
  const flags = r?.redFlags.filter((f) => f.severity !== 'low') ?? [];
  const learned = chat?.learnings;
  return (
    <section className="glance">
      <div className="glance-row">
        {item.kind === 'supplement' && <TestingBadge status={item.testing.status} />}
        {flags.length > 0 && <span className="pill bad">{flags.length} red flag{flags.length === 1 ? '' : 's'}</span>}
        <span className="glance-stat glance-dose" title={item.dose}>{item.dose || 'Dose not set'}</span>
        <span className="glance-stat">{money(dailyCost(item))}/day</span>
      </div>

      {r ? (
        <>
          <p className="verdict">{r.verdict}</p>
          <p className="glance-summary">{r.summary}</p>
        </>
      ) : <p className="muted">Not researched yet.</p>}
      {flags.length > 0 && (
        <ul className="glance-flags">
          {flags.map((f, i) => <li key={i}>{f.title}</li>)}
        </ul>
      )}

      <div className="glance-learned">
        <div className="glance-learned-head">
          <h3>What I've learned</h3>
          {learned && <span className="muted small">updated {date(learned.updatedAt)}</span>}
        </div>
        {learned ? (
          <>
            <p>{learned.summary}</p>
            {learned.takeaways.length > 0 && (
              <ul className="list">{learned.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>
            )}
            {learned.openQuestions.length > 0 && (
              <p className="muted small">Still open: {learned.openQuestions.join(' · ')}</p>
            )}
          </>
        ) : (
          <p className="muted">
            Nothing yet. <button className="link" onClick={onAsk}>Ask Claude about {item.name}</button> and the key points collect here.
          </p>
        )}
        {chat?.summarizing && <p className="muted small">Updating…</p>}
      </div>
    </section>
  );
}
