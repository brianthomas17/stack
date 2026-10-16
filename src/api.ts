import type { Item, Report, Settings } from '../shared/types.ts';
import type { ClaudeStatus } from '../server/claude.ts';

export type { ClaudeStatus };

export interface State {
  settings: Settings;
  items: Item[];
  reports: Report[];
  dataDir: string;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  claudeStatus: () => call<ClaudeStatus>('GET', '/api/claude/status'),
  claudeLogin: () => call<ClaudeStatus>('POST', '/api/claude/login'),
  state: () => call<State>('GET', '/api/state'),
  saveSettings: (s: Settings) => call<Settings>('PUT', '/api/settings', s),
  createItem: (i: Partial<Item>) => call<Item>('POST', '/api/items', i),
  updateItem: (i: Item) => call<Item>('PUT', `/api/items/${i.id}`, i),
  deleteItem: (id: string) => call<void>('DELETE', `/api/items/${id}`),
  researchItem: (id: string) => call<Report>('POST', `/api/items/${id}/research`),
  researchStack: () => call<Report>('POST', '/api/stack/research'),
  accept: (id: string, replaceWhy: boolean) => call<Report>('POST', `/api/reports/${id}/accept`, { replaceWhy }),
  dismiss: (id: string) => call<Report>('POST', `/api/reports/${id}/dismiss`),
};
