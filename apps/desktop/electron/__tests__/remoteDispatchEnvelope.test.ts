import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DISPATCH_ENVELOPE_VERSION,
  createDispatchSession,
  deriveDispatchKey,
  generatePairingSecret,
  signDispatchEnvelope,
  verifyDispatchEnvelope,
} from '../remote/dispatchEnvelope';

const PAIRING_SECRET = '9f'.repeat(32);

describe('dispatch envelope in the desktop main process', () => {
  it('derives the same session key as the phone and the Tauri host', () => {
    expect(
      deriveDispatchKey('ABCD1234WXYZ', 'a1b2c3d4e5f60718', PAIRING_SECRET).toString('hex'),
    ).toBe('99d81f2ce90a7f72238227e608fd6a72795fc6fde038e9e5b9c5f9ec5b9ab6d3');
  });

  it('signs over the canonical input the phone verifies, with every key sorted', () => {
    const key = deriveDispatchKey('ABCD1234WXYZ', 'salt', PAIRING_SECRET);
    const session = createDispatchSession(key);
    const envelope = signDispatchEnvelope(
      session,
      'code.sessions',
      { b: 1, a: { d: 2, c: 3 } },
      1_000,
    );

    const canonical = `{"nonce":${JSON.stringify(envelope.nonce)},"payload":{"a":{"c":3,"d":2},"b":1},"ts":1000,"type":"code.sessions","v":3}`;
    expect(envelope.v).toBe(DISPATCH_ENVELOPE_VERSION);
    expect(envelope.hmac).toBe(createHmac('sha256', key).update(canonical).digest('hex'));
  });

  it('accepts a fresh envelope once and refuses its replay', () => {
    const key = deriveDispatchKey('ABCD1234WXYZ', 'salt', PAIRING_SECRET);
    const phone = createDispatchSession(key);
    const desktop = createDispatchSession(key);
    const envelope = signDispatchEnvelope(phone, 'code.session.attach', { threadId: 't' }, 10_000);

    expect(verifyDispatchEnvelope(desktop, envelope, 10_500)).toMatchObject({ ok: true });
    expect(verifyDispatchEnvelope(desktop, envelope, 10_600)).toEqual({
      ok: false,
      reason: 'nonce_replay',
    });
  });

  it('refuses a tampered payload, a stale timestamp, an unsigned message and an older protocol', () => {
    const key = deriveDispatchKey('ABCD1234WXYZ', 'salt', PAIRING_SECRET);
    const desktop = createDispatchSession(key);
    const envelope = signDispatchEnvelope(
      createDispatchSession(key),
      'code.approval.respond',
      { approved: false },
      50_000,
    );

    expect(
      verifyDispatchEnvelope(desktop, { ...envelope, payload: { approved: true } }, 50_000),
    ).toEqual({ ok: false, reason: 'hmac_mismatch' });
    expect(verifyDispatchEnvelope(desktop, envelope, 50_000 + 31_000)).toEqual({
      ok: false,
      reason: 'timestamp_expired',
    });
    expect(verifyDispatchEnvelope(desktop, { payload: {}, type: 'x' }, 50_000)).toEqual({
      ok: false,
      reason: 'unsigned',
    });
    expect(verifyDispatchEnvelope(desktop, { ...envelope, v: 2 }, 50_000)).toEqual({
      ok: false,
      reason: 'update_required',
    });
  });

  it('refuses a key derived without the out-of-band secret', () => {
    expect(() => deriveDispatchKey('ABCD1234WXYZ', 'salt', 'not-hex')).toThrow();
    expect(generatePairingSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});
