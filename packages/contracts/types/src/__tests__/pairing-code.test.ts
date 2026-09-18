import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BRIDGE_PAIRING_CODE_ALPHABET,
  BRIDGE_PAIRING_CODE_LENGTH,
  PAIRING_CODE_LENGTH,
  isBridgePairingCode,
  isRelayPairingCode,
  normalizePairingCode,
} from '../pairing';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const RUST_BRIDGE_PATH = join(
  REPO_ROOT,
  'apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs',
);

describe('the relay pairing code', () => {
  it('is the twelve characters the relay mints and nothing else', () => {
    expect(PAIRING_CODE_LENGTH).toBe(12);
    expect(isRelayPairingCode('ABCD1234EFGH')).toBe(true);
    expect(isRelayPairingCode('ABCD1234EFG')).toBe(false);
    expect(isRelayPairingCode('ABCD1234EFGHI')).toBe(false);
  });

  // The desktop shell accepted 8 to 32 characters here, a range the relay can
  // never issue, so a code that could not exist reached the relay before it was
  // refused.
  it('refuses the lengths the old per-surface checks let through', () => {
    expect(isRelayPairingCode('ABCD1234')).toBe(false);
    expect(isRelayPairingCode('A'.repeat(32))).toBe(false);
  });

  it('is strict about case and separators, and leaves folding to the caller', () => {
    expect(isRelayPairingCode('abcd1234efgh')).toBe(false);
    expect(isRelayPairingCode('ABCD-1234-EFGH')).toBe(false);
    expect(isRelayPairingCode(normalizePairingCode('abcd 1234 efgh'))).toBe(true);
    expect(isRelayPairingCode(normalizePairingCode('ABCD-1234-EFGH'))).toBe(true);
  });
});

describe('the bridge pairing code', () => {
  it('drops the characters a person retyping from the screen confuses', () => {
    for (const ambiguous of ['I', 'O', '0', '1']) {
      expect(BRIDGE_PAIRING_CODE_ALPHABET).not.toContain(ambiguous);
    }
    expect(isBridgePairingCode('ABCDI345')).toBe(false);
    expect(isBridgePairingCode('ABCD2345')).toBe(true);
  });

  it('is the eight characters the desktop mints and nothing else', () => {
    expect(isBridgePairingCode('ABCD234')).toBe(false);
    expect(isBridgePairingCode('ABCD23456')).toBe(false);
  });

  it('is not interchangeable with a relay code', () => {
    expect(isRelayPairingCode('ABCD2345')).toBe(false);
    expect(isBridgePairingCode('ABCD1234EFGH')).toBe(false);
  });
});

describe('normalizing what a person typed', () => {
  it('drops separators and folds case', () => {
    expect(normalizePairingCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizePairingCode('ABCD 1234 EFGH')).toBe('ABCD1234EFGH');
    expect(normalizePairingCode('')).toBe('');
  });
});

/**
 * The desktop mints the bridge code in Rust and cannot import this package, so
 * it keeps its own copy of the alphabet and the length. Two copies drift, and
 * this one drifts silently: a widened alphabet would make the extension reject
 * codes the desktop had just printed on screen.
 *
 * This reads the Rust source instead of an import, so it belongs to the full
 * suite rather than an affected-files run.
 */
describe('the Rust generator of the bridge pairing code', () => {
  const rust = readFileSync(RUST_BRIDGE_PATH, 'utf8');

  it('mints from the alphabet this contract publishes', () => {
    expect(rust).toContain(`const PAIR_CODE_ALPHABET: &[u8] = b"${BRIDGE_PAIRING_CODE_ALPHABET}"`);
  });

  it('mints the length this contract publishes', () => {
    expect(rust).toContain(`const PAIR_CODE_LEN: usize = ${BRIDGE_PAIRING_CODE_LENGTH};`);
  });
});
