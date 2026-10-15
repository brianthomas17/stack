import { useState } from 'react';
import type { StackReport } from '../../shared/types.ts';
import { api } from '../api.ts';
import { ago } from '../format.ts';
import { SeverityBadge, Sources } from './Badges.tsx';

interface Props {
  reports: StackReport[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const ORDER = { high: 0, medium: 1, low: 2 };

export function StackPanel({ reports, onClose, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const latest = reports[0];
  const shown = reports.find((r) => r.findings);
  const running = latest?.status === 'running';

  const start = async () => {
    setError(null);
    try {
      await api.researchStack();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel-body">
      <div className="panel-head">
        <div>
          <h2>Interactions</h2>
          <div className="muted">Every active item, supplements and meds, checked against each other.</div>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="toolbar">
        <button className="primary" disabled={running} onClick={start}>
          {running ? 'Checking…' : shown ? 'Re-check my stack' : 'Check my stack'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {running && <div className="banner info">Claude is checking your whole stack. This takes a few minutes.</div>}
      {latest?.status === 'failed' && <div className="banner error">Last check failed: {latest.error}</div>}

      {shown?.findings ? (
        <>
          <p className="muted small">From {ago(shown.finishedAt ?? shown.createdAt)}</p>
          <section className="block"><p>{shown.findings.summary}</p></section>
          <section className="block">
            <h3>Interactions</h3>
            {shown.findings.interactions.length === 0 ? <p className="muted">None found.</p> : (
              <ul className="list">
                {[...shown.findings.interactions]
                  .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
                  .map((x, i) => (
                    <li key={i}>
                      <SeverityBadge severity={x.severity} /> <strong>{x.items.join(' + ')}</strong>
                      <div>{x.detail}</div>
                      <div><span className="muted">What to do:</span> {x.recommendation}</div>
                      <Sources sources={x.sources} />
                    </li>
                  ))}
              </ul>
            )}
          </section>
          {shown.findings.timingSuggestions.length > 0 && (
            <section className="block">
              <h3>Timing</h3>
              <ul className="list">{shown.findings.timingSuggestions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          )}
          {shown.findings.redundancies.length > 0 && (
            <section className="block">
              <h3>Overlap</h3>
              <ul className="list">{shown.findings.redundancies.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          )}
        </>
      ) : !running && <p className="muted">No check yet.</p>}
    </div>
  );
}
