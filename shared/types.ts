export type Kind = 'supplement' | 'prescription' | 'otc';
export type Timing = 'am' | 'pm';
export type TestingStatus = 'certified' | 'brand-tested' | 'none' | 'unknown';
export type Strength = 'strong' | 'moderate' | 'weak' | 'mixed';
export type Severity = 'high' | 'medium' | 'low';

export interface Source {
  title: string;
  url: string;
}

export interface Testing {
  status: TestingStatus;
  /** e.g. "NSF Certified for Sport", "USP Verified", "Informed Choice", "Labdoor A" */
  certifications: string[];
  notes?: string;
  sources?: Source[];
  checkedAt?: string;
}

export interface Evidence {
  claim: string;
  strength: Strength;
  sources: Source[];
}

export interface RedFlag {
  title: string;
  detail: string;
  severity: Severity;
  url?: string;
}

export interface Alternative {
  brand: string;
  product: string;
  url?: string;
  pricePerServing?: number;
  certifications: string[];
  reason: string;
}

export interface Research {
  summary: string;
  verdict: string;
  typicalDose: string;
  doseAssessment: string;
  evidence: Evidence[];
  redFlags: RedFlag[];
  alternatives: Alternative[];
  updatedAt: string;
}

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  brand?: string;
  product?: string;
  timing: Timing[];
  /** Free text, e.g. "2 capsules (1000mg)" */
  dose?: string;
  /** Label servings taken per day. Drives daily cost. */
  servingsPerDay: number;
  url?: string;
  store?: string;
  price?: number;
  servingsPerContainer?: number;
  why?: string;
  notes?: string;
  testing: Testing;
  research?: Research;
  status: 'active' | 'stopped';
  startedAt?: string;
  stoppedAt?: string;
  stopReason?: string;
  /** Visible to friends when published. Unset = use the default for its kind. */
  share?: boolean;
}

export interface Settings {
  displayName: string;
  /** Share prescriptions and OTC meds by default. Each item can still override. */
  shareMedsByDefault: boolean;
}

/** What a research run proposes. Nothing is applied until you accept it. */
export interface ItemFindings {
  summary: string;
  verdict: string;
  why: string;
  typicalDose: string;
  doseAssessment: string;
  evidence: Evidence[];
  testing: Omit<Testing, 'checkedAt'>;
  redFlags: RedFlag[];
  alternatives: Alternative[];
  productDetails: {
    brand?: string;
    product?: string;
    price?: number;
    servingsPerContainer?: number;
    servingSize?: string;
  };
}

export interface Interaction {
  items: string[];
  severity: Severity;
  detail: string;
  recommendation: string;
  sources: Source[];
}

export interface StackFindings {
  summary: string;
  interactions: Interaction[];
  timingSuggestions: string[];
  redundancies: string[];
}

export type ReportStatus = 'running' | 'ready' | 'failed' | 'accepted' | 'dismissed';

interface ReportBase {
  id: string;
  createdAt: string;
  finishedAt?: string;
  status: ReportStatus;
  error?: string;
}

export interface ItemReport extends ReportBase {
  type: 'item';
  itemId: string;
  findings?: ItemFindings;
}

export interface StackReport extends ReportBase {
  type: 'stack';
  findings?: StackFindings;
}

export type Report = ItemReport | StackReport;

export function shouldShare(item: Item, settings: Settings): boolean {
  if (item.share !== undefined) return item.share;
  return item.kind === 'supplement' ? true : settings.shareMedsByDefault;
}

export function costPerServing(item: Item): number | undefined {
  if (!item.price || !item.servingsPerContainer) return undefined;
  return item.price / item.servingsPerContainer;
}

export function dailyCost(item: Item): number | undefined {
  const cps = costPerServing(item);
  return cps === undefined ? undefined : cps * item.servingsPerDay;
}
