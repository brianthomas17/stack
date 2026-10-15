import type { Alternative, Evidence, ItemFindings, RedFlag, Research } from '../../shared/types.ts';
import { date, money } from '../format.ts';
import { SeverityBadge, Sources, StrengthBadge, TestingBadge } from './Badges.tsx';

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <section className="block">
      <h3>Evidence</h3>
      <ul className="list">
        {evidence.map((e, i) => (
          <li key={i}>
            <StrengthBadge strength={e.strength} /> {e.claim} <Sources sources={e.sources} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RedFlags({ flags }: { flags: RedFlag[] }) {
  return (
    <section className="block">
      <h3>Red flags</h3>
      {flags.length === 0 ? <p className="muted">None found.</p> : (
        <ul className="list">
          {flags.map((f, i) => (
            <li key={i}>
              <SeverityBadge severity={f.severity} /> <strong>{f.title}</strong>. {f.detail}{' '}
              {f.url && <a href={f.url} target="_blank" rel="noreferrer">source</a>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Alternatives({ alternatives }: { alternatives: Alternative[] }) {
  if (!alternatives.length) return null;
  return (
    <section className="block">
      <h3>Alternatives</h3>
      <ul className="list">
        {alternatives.map((a, i) => (
          <li key={i}>
            <strong>
              {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.brand} {a.product}</a> : `${a.brand} ${a.product}`}
            </strong>
            {a.pricePerServing !== undefined && <span className="muted"> · {money(a.pricePerServing)}/serving</span>}
            {a.certifications.length > 0 && <span className="muted"> · {a.certifications.join(', ')}</span>}
            <div>{a.reason}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dose({ typical, assessment }: { typical: string; assessment: string }) {
  return (
    <section className="block">
      <h3>Dose</h3>
      <p><span className="muted">Typical:</span> {typical}</p>
      <p><span className="muted">Yours:</span> {assessment}</p>
    </section>
  );
}

/** Accepted research saved on the item. */
export function ResearchView({ research: r }: { research: Research }) {
  return (
    <>
      <section className="block">
        <h3>Research <span className="muted small">updated {date(r.updatedAt)}</span></h3>
        <p className="verdict">{r.verdict}</p>
        <p>{r.summary}</p>
      </section>
      <Dose typical={r.typicalDose} assessment={r.doseAssessment} />
      <EvidenceList evidence={r.evidence} />
      <RedFlags flags={r.redFlags} />
      <Alternatives alternatives={r.alternatives} />
    </>
  );
}

/** A pending report's findings, before you accept them. */
export function Findings({ findings: f }: { findings: ItemFindings }) {
  return (
    <>
      <section className="block">
        <p className="verdict">{f.verdict}</p>
        <p>{f.summary}</p>
        <p><span className="muted">Why take it:</span> {f.why}</p>
      </section>
      <section className="block">
        <h3>Third-party testing <TestingBadge status={f.testing.status} /></h3>
        {f.testing.certifications.length > 0 && <p>{f.testing.certifications.join(', ')}</p>}
        {f.testing.notes && <p>{f.testing.notes}</p>}
        <Sources sources={f.testing.sources} />
      </section>
      <Dose typical={f.typicalDose} assessment={f.doseAssessment} />
      <EvidenceList evidence={f.evidence} />
      <RedFlags flags={f.redFlags} />
      <Alternatives alternatives={f.alternatives} />
    </>
  );
}
