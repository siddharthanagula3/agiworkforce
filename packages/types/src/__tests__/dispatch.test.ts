/**
 * Dispatch contract — type-level + value-level smoke tests.
 *
 * These tests are intentionally light: the wire-format round-trip is
 * exercised by `apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs`
 * (Rust unit tests) and the mobile signer's vitest/jest suites. Here we
 * just verify that the canonical constants are stable and the type aliases
 * round-trip through the public API.
 */

import { describe, expect, it } from 'vitest';
import {
  DISPATCH_HKDF_INFO,
  DISPATCH_HMAC_REQUIRED_AFTER,
  DISPATCH_MAX_MESSAGE_AGE_MS,
  DISPATCH_NONCE_CACHE_TTL_MS,
  DISPATCH_PAIRING_CODE_MIN_LEN,
  DISPATCH_SESSION_KEY_LEN,
  DISPATCH_SIGNATURE_ALGORITHM,
  type DispatchEnvelope,
  type DispatchPayload,
  type DispatchSessionState,
  type DispatchSignatureAlgorithm,
  type DispatchVerifyFailureReason,
  type DispatchVerifyResult,
  type HmacSessionState,
  type SignedEnvelope,
} from '../dispatch';

describe('dispatch — canonical wire-format constants', () => {
  it('locks the HKDF info parameter', () => {
    // Both peers use this exact byte sequence in HKDF-Expand. Changing it
    // breaks the wire format and rotates every session key.
    expect(DISPATCH_HKDF_INFO).toBe('dispatch-hmac-v2');
  });

  it('locks the signature algorithm identifier', () => {
    expect(DISPATCH_SIGNATURE_ALGORITHM).toBe('hmac-sha256-v2');
  });

  it('locks the unsigned-transitional cutoff date', () => {
    expect(DISPATCH_HMAC_REQUIRED_AFTER).toBe('2026-06-05T00:00:00.000Z');
  });

  it('locks the timestamp window at 30 seconds', () => {
    expect(DISPATCH_MAX_MESSAGE_AGE_MS).toBe(30_000);
  });

  it('locks the nonce TTL at 60 seconds (≥ 2× timestamp window)', () => {
    expect(DISPATCH_NONCE_CACHE_TTL_MS).toBe(60_000);
    expect(DISPATCH_NONCE_CACHE_TTL_MS).toBeGreaterThanOrEqual(DISPATCH_MAX_MESSAGE_AGE_MS * 2);
  });

  it('locks the session-key length at 32 bytes', () => {
    expect(DISPATCH_SESSION_KEY_LEN).toBe(32);
  });

  it('locks the pairing-code minimum length at 8', () => {
    expect(DISPATCH_PAIRING_CODE_MIN_LEN).toBe(8);
  });
});

describe('dispatch — envelope shape', () => {
  it('accepts a valid signed envelope', () => {
    const envelope: DispatchEnvelope = {
      hmac: 'a'.repeat(64),
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA==',
      payload: { action: 'ping', value: 42 },
      ts: 1_700_000_000_000,
      type: 'ping',
    };
    expect(envelope.hmac).toHaveLength(64);
    expect(envelope.type).toBe('ping');
  });

  it('SignedEnvelope is structurally identical to DispatchEnvelope', () => {
    const envelope: SignedEnvelope = {
      hmac: 'b'.repeat(64),
      nonce: 'BBBB',
      payload: null,
      ts: 0,
      type: 'noop',
    };
    const asCanonical: DispatchEnvelope = envelope;
    expect(asCanonical.hmac).toBe(envelope.hmac);
  });

  it('payload is unknown by default — caller narrows after verify', () => {
    const payload: DispatchPayload = { foo: 'bar' };
    expect(payload).toBeDefined();
  });
});

describe('dispatch — session state shape', () => {
  it('builds a fresh session with hex secret + empty nonce cache', () => {
    const state: DispatchSessionState = {
      secret: 'c'.repeat(64),
      nonceCache: new Map(),
    };
    expect(state.secret).toHaveLength(64);
    expect(state.nonceCache.size).toBe(0);
  });

  it('HmacSessionState alias is interchangeable with DispatchSessionState', () => {
    const state: HmacSessionState = {
      secret: 'd'.repeat(64),
      nonceCache: new Map([['nonce-a', 1234]]),
    };
    const asCanonical: DispatchSessionState = state;
    expect(asCanonical.nonceCache.get('nonce-a')).toBe(1234);
  });
});

describe('dispatch — verify result discriminants', () => {
  it('accepts the success branch', () => {
    const result: DispatchVerifyResult = { ok: true };
    expect(result.ok).toBe(true);
  });

  it('accepts every documented failure reason', () => {
    const reasons: DispatchVerifyFailureReason[] = [
      'hmac_mismatch',
      'timestamp_expired',
      'nonce_replay',
      'malformed',
      'unsigned_transitional',
    ];
    for (const reason of reasons) {
      const result: DispatchVerifyResult = { ok: false, reason };
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(reason);
    }
  });

  it('locks the algorithm identifier type union', () => {
    const algo: DispatchSignatureAlgorithm = 'hmac-sha256-v2';
    expect(algo).toBe(DISPATCH_SIGNATURE_ALGORITHM);
  });
});
