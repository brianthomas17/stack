import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Chat, Item, Report, Settings } from '../shared/types.ts';

// Data lives outside the app repo so the public code never carries anyone's stack.
export const DATA_DIR = path.resolve(process.env.STACK_DATA_DIR ?? 'data');

const itemsDir = path.join(DATA_DIR, 'supplements');
const reportsDir = path.join(DATA_DIR, 'reports');
const chatsDir = path.join(DATA_DIR, 'chats');
const settingsFile = path.join(DATA_DIR, 'settings.json');

// Anything that wants to react to saved data (auto-commit, auto-publish) subscribes here.
const listeners: ((file: string) => void)[] = [];
export function onChange(fn: (file: string) => void) {
  listeners.push(fn);
}
function changed(file: string) {
  for (const fn of listeners) fn(file);
}

const DEFAULT_SETTINGS: Settings = { displayName: '', shareMedsByDefault: false };

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

// Write-then-rename so a crash never leaves a half-written file behind.
async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await rename(tmp, file);
  changed(file);
}

async function listJson<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map((f) => readJson<T>(path.join(dir, f))));
}

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export async function ensureDataDir() {
  await mkdir(itemsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
}

export async function getSettings(): Promise<Settings> {
  if (!existsSync(settingsFile)) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(settingsFile)) };
}

export async function saveSettings(settings: Settings) {
  await writeJson(settingsFile, settings);
}

export async function listItems(): Promise<Item[]> {
  return (await listJson<Item>(itemsDir)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getItem(id: string): Promise<Item | undefined> {
  const file = path.join(itemsDir, `${slugify(id)}.json`);
  return existsSync(file) ? readJson<Item>(file) : undefined;
}

export async function saveItem(item: Item) {
  await writeJson(path.join(itemsDir, `${slugify(item.id)}.json`), item);
}

export async function deleteItem(id: string) {
  const file = path.join(itemsDir, `${slugify(id)}.json`);
  await rm(file, { force: true });
  changed(file);
}

export async function uniqueId(name: string) {
  const base = slugify(name);
  let id = base;
  for (let n = 2; existsSync(path.join(itemsDir, `${id}.json`)); n++) id = `${base}-${n}`;
  return id;
}

export async function listReports(): Promise<Report[]> {
  return (await listJson<Report>(reportsDir)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReport(id: string): Promise<Report | undefined> {
  const file = path.join(reportsDir, `${slugify(id)}.json`);
  return existsSync(file) ? readJson<Report>(file) : undefined;
}

export async function saveReport(report: Report) {
  await writeJson(path.join(reportsDir, `${slugify(report.id)}.json`), report);
}

export async function getChat(itemId: string): Promise<Chat> {
  const file = path.join(chatsDir, `${slugify(itemId)}.json`);
  return existsSync(file) ? readJson<Chat>(file) : { itemId, messages: [] };
}

export async function saveChat(chat: Chat) {
  await writeJson(path.join(chatsDir, `${slugify(chat.itemId)}.json`), chat);
}
