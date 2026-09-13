import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isValidExtensionId } from '@agiworkforce/types';

export interface PairingRecord {
  extensionId: string;
  pairToken: string;
  fingerprint: string;
  pairedAtMs: number;
}

interface StoredState {
  pairing: PairingRecord | null;
  bridgeToken: string;
  hostToken: string;
}

let state: StoredState | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'browser-pairing.json');
}

function isPairingRecord(value: unknown): value is PairingRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PairingRecord>;
  return (
    isValidExtensionId(candidate.extensionId) &&
    typeof candidate.pairToken === 'string' &&
    typeof candidate.fingerprint === 'string' &&
    typeof candidate.pairedAtMs === 'number'
  );
}

function load(): StoredState {
  if (state) return state;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(storePath(), 'utf8'));
  } catch {
    parsed = null;
  }
  const record = parsed as Partial<StoredState> | null;
  state = {
    pairing: isPairingRecord(record?.pairing) ? record.pairing : null,
    bridgeToken: typeof record?.bridgeToken === 'string' ? record.bridgeToken : randomHex(32),
    hostToken: typeof record?.hostToken === 'string' ? record.hostToken : randomHex(32),
  };
  if (!record?.bridgeToken || !record?.hostToken) persist();
  return state;
}

function persist(): void {
  if (!state) return;
  try {
    writeFileSync(storePath(), `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.warn('[browser-bridge] could not persist pairing state:', error);
  }
}

export function randomHex(byteLength: number): string {
  return randomBytes(byteLength).toString('hex');
}

export function readPairing(): PairingRecord | null {
  return load().pairing;
}

export function bridgeToken(): string {
  return load().bridgeToken;
}

export function hostToken(): string {
  return load().hostToken;
}

export function savePairing(extensionId: string): PairingRecord {
  const store = load();
  const pairToken = randomHex(32);
  store.pairing = {
    extensionId,
    pairToken,
    fingerprint: pairToken.slice(0, 8),
    pairedAtMs: Date.now(),
  };
  persist();
  return store.pairing;
}

export function clearPairing(): void {
  const store = load();
  store.pairing = null;
  persist();
}

export function resetPairingCacheForTests(): void {
  state = null;
}
