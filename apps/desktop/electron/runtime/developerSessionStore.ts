import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MAX_REMEMBERED_SESSIONS = 500;

let started: string[] | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'desktop-developer-sessions.json');
}

function load(): string[] {
  if (started) return started;
  try {
    const parsed: unknown = JSON.parse(readFileSync(storePath(), 'utf8'));
    started = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    started = [];
  }
  return started;
}

function persist(ids: string[]): void {
  try {
    writeFileSync(storePath(), `${JSON.stringify(ids, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[developer-sessions] could not persist the started-here record:', error);
  }
}

export function rememberSessionStartedHere(threadId: string): void {
  const ids = load().filter((id) => id !== threadId);
  ids.unshift(threadId);
  started = ids.slice(0, MAX_REMEMBERED_SESSIONS);
  persist(started);
}

export function wasSessionStartedHere(threadId: string): boolean {
  return load().includes(threadId);
}
