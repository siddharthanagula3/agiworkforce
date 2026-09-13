import { app } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  EMPTY_SHELL_POLICY,
  normalizeShellPolicy,
  type ShellPolicy,
} from '@agiworkforce/local-runtime-contract';

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
  policy = normalizeShellPolicy(next);
  try {
    writeFileSync(storePath(), `${JSON.stringify(policy, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[shell-policy] could not persist the command policy:', error);
  }
  return readShellPolicy();
}
