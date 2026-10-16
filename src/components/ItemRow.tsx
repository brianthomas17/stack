import { dailyCost, shouldShare, type Item, type Report, type Settings } from '../../shared/types.ts';
import { money } from '../format.ts';
import { TestingBadge } from './Badges.tsx';

interface Props {
  item: Item;
  settings: Settings;
  report?: Report;
  onOpen: () => void;
}

export function ItemRow({ item, settings, report, onOpen }: Props) {
  const flags = item.research?.redFlags.filter((f) => f.severity !== 'low').length ?? 0;
  const sub = [item.brand, item.dose].filter(Boolean).join(' · ');
  return (
    <li>
      <button className="row" onClick={onOpen} title={[item.name, item.brand, item.dose].filter(Boolean).join(' · ')}>
        <div className="row-main">
          <div className="row-title">
            <span className="row-name">{item.name}</span>
            {item.kind !== 'supplement' && <span className="tag">{item.kind === 'prescription' ? 'Rx' : 'OTC'}</span>}
            {!shouldShare(item, settings) && <span className="tag quiet" title="Not shared with friends">private</span>}
          </div>
          {sub && <div className="row-sub">{sub}</div>}
        </div>
        <div className="row-meta">
          {report?.status === 'running' && <span className="pill running">Researching</span>}
          {report?.status === 'ready' && <span className="pill review">Review</span>}
          {report?.status === 'failed' && <span className="pill bad">Research failed</span>}
          {flags > 0 && <span className="pill bad">{flags} red flag{flags === 1 ? '' : 's'}</span>}
          {item.kind === 'supplement' && <TestingBadge status={item.testing.status} />}
          <span className="row-cost">{money(dailyCost(item))}</span>
        </div>
      </button>
    </li>
  );
}
