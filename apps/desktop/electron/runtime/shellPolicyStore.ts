import { app } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EMPTY_SHELL_POLICY,
  normalizeShellPolicy,
  type ShellPolicy,
} from '@agiworkforce/local-runtime-contract';
import { replaceStoreFile, StoreWriteError } from './atomicStoreFile';

let policy: ShellPolicy = { ...EMPTY_SHELL_POLICY };
let loaded = false;

function storePath(): string {
  return path.join(app.getPath('userData'), 'desktop-shell-policy.json');
}

function isPolicyShape(value: unknown): value is ShellPolicy {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ShellPolicy>;
  return (
    Array.isArray(candidate.allow) &&
    Array.isArray(candidate.deny) &&
    candidate.allow.every((entry) => typeof entry === 'string') &&
    candidate.deny.every((entry) => typeof entry === 'string')
  );
}

function load(): void {
  if (loaded) return;
  loaded = true;
  let raw: string;
  try {
    raw = readFileSync(storePath(), 'utf8');
  } catch {
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    // A corrupt store is an empty one: every program falls back to prompting.
    if (isPolicyShape(parsed)) policy = normalizeShellPolicy(parsed);
  } catch {
    policy = { ...EMPTY_SHELL_POLICY };
  }
}

export function readShellPolicy(): ShellPolicy {
  load();
  return { allow: [...policy.allow], deny: [...policy.deny] };
}

export function writeShellPolicy(next: ShellPolicy): ShellPolicy {
  load();
  const normalized = normalizeShellPolicy(next);
  try {
    replaceStoreFile(storePath(), `${JSON.stringify(normalized, null, 2)}\n`);
  } catch (error) {
    throw new StoreWriteError('Could not save command permissions. Try again.', { cause: error });
  }
  policy = normalized;
  return readShellPolicy();
}
