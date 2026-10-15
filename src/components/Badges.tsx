import type { Severity, Source, Strength, TestingStatus } from '../../shared/types.ts';

const TESTING: Record<TestingStatus, { label: string; cls: string }> = {
  certified: { label: 'Certified', cls: 'good' },
  'brand-tested': { label: 'Brand-tested', cls: 'warn' },
  none: { label: 'Not tested', cls: 'bad' },
  unknown: { label: 'Not checked', cls: 'quiet' },
};

export function TestingBadge({ status }: { status: TestingStatus }) {
  const t = TESTING[status];
  return <span className={`pill ${t.cls}`}>{t.label}</span>;
}

const STRENGTH: Record<Strength, string> = { strong: 'good', moderate: 'good', mixed: 'warn', weak: 'quiet' };

export function StrengthBadge({ strength }: { strength: Strength }) {
  return <span className={`pill ${STRENGTH[strength]}`}>{strength}</span>;
}

const SEVERITY: Record<Severity, string> = { high: 'bad', medium: 'warn', low: 'quiet' };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`pill ${SEVERITY[severity]}`}>{severity}</span>;
}

function host(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <span className="sources">
      {sources.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.url}>
          {s.title || host(s.url)}
        </a>
      ))}
    </span>
  );
}
