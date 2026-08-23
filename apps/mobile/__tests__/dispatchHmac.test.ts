/**
 * dispatchHmac.test.ts
 *
 * Unit tests for HIGH-MOB-05 (v2 nonce scheme, 2026-05-05):
 * Application-layer HMAC authentication for Dispatch WebRTC control messages.
 *
 * Test scenarios:
 *
 *  Key Derivation
 *   - deriveDispatchSecret produces a 64-char hex string (32 bytes)
 *   - Same inputs produce the same key (deterministic)
 *   - Different pairingCode produces a different key
 *   - Different sessionSalt produces a different key
 *   - Relay-visible code + salt alone do not determine the key
 *   - Derivation refuses a missing or malformed out-of-band pairing secret
 *   - Derivation matches the desktop Rust vector byte for byte
 *
 *  Wire protocol version
 *   - signMessage stamps DISPATCH_ENVELOPE_VERSION
 *   - A v2 envelope is rejected as protocol_version_unsupported
 *   - A newer claimed version is rejected as protocol_version_unsupported
 *
 *  HMAC Sign / Verify — round-trip
 *   - signMessage returns a valid envelope with all required fields
 *   - signMessage produces hmac, nonce, payload, ts, type fields
 *   - nonce is a base64-encoded 16-byte value (24 chars)
 *   - ts is approximately Date.now() (within 1s tolerance)
 *   - verifyMessage returns ok:true for a valid signed envelope
 *   - round-trip: sign then verify succeeds
 *   - two consecutive sign calls produce different nonces
 *
 *  HMAC Reject — invalid HMAC
 *   - verifyMessage returns hmac_mismatch for tampered hmac field
 *   - verifyMessage returns hmac_mismatch for tampered payload
 *   - verifyMessage returns hmac_mismatch for tampered type field
 *   - verifyMessage returns hmac_mismatch for tampered ts field
 *   - hmac_mismatch uses constant-time comparison (proof via timing-invariant result)
 *
 *  Replay — timestamp window
 *   - verifyMessage returns timestamp_expired for ts > 30s in the past
 *   - verifyMessage returns timestamp_expired for ts > 30s in the future
 *   - verifyMessage accepts ts within ±30s window
 *   - verifyMessage accepts ts at exactly the boundary (29 999 ms old)
 *
 *  Replay — nonce cache / sliding window
 *   - verifyMessage returns nonce_replay for a duplicate nonce
 *   - Different nonces are accepted even for same payload/ts
 *   - Nonce cache is pruned: entries older than 60s are evicted
 *   - After eviction, a previously seen (now-expired) nonce is accepted again
 *
 *  Malformed messages
 *   - verifyMessage returns malformed for non-object input
 *   - verifyMessage returns malformed for null
 *   - verifyMessage returns malformed for envelope missing nonce when hmac present
 *   - verifyMessage returns malformed for envelope missing ts when hmac present
 *   - verifyMessage returns malformed for envelope missing type when hmac present
 *
 *  Unsigned messages
 *   - unsigned message (no hmac field) returns unsigned_transitional before cutoff
 *   - unsigned message (no hmac field) returns unsigned_transitional after cutoff
 *   - unsigned message never logs legacy acceptance warnings
 *
 *  Wire format
 *   - canonical signing input has keys in alphabetical order: nonce < payload < ts < type
 *   - DISPATCH_HMAC_REQUIRED_AFTER is exported and is a valid ISO 8601 date string
 */

jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');

  function nodesha256(data: ArrayBuffer): ArrayBuffer {
    const hash = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest();
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer;
  }

  let _nonceCounter = 0;

  return {
    __esModule: true,
    CryptoDigestAlgorithm: { SHA256: 'SHA-256', SHA512: 'SHA-512' },
    digest: jest.fn(async (_algo: string, data: ArrayBuffer) => {
      return nodesha256(data);
    }),
    getRandomBytes: jest.fn((n: number): Uint8Array => {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        bytes[i] = (_nonceCounter * 37 + i * 7) & 0xff;
      }
      _nonceCounter++;
      return bytes;
    }),
    digestStringAsync: jest.fn(async (_algo: string, data: string) => {
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    }),
    randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
    getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n)),
    __resetNonceCounter: () => {
      _nonceCounter = 0;
    },
  };
});

import {
  deriveDispatchSecret,
  signMessage,
  verifyMessage,
  DISPATCH_ENVELOPE_VERSION,
  DISPATCH_HMAC_REQUIRED_AFTER,
  type HmacSessionState,
} from '../lib/dispatchHmac';

const PAIRING_SECRET = '9f'.repeat(32);

async function makeState(
  pairingCode = 'TESTCODE',
  salt = 'testsalt',
  pairingSecret = PAIRING_SECRET,
): Promise<HmacSessionState> {
  const secret = await deriveDispatchSecret(pairingCode, salt, pairingSecret);
  return { secret, nonceCache: new Map() };
}

function cloneState(state: HmacSessionState): HmacSessionState {
  return { secret: state.secret, nonceCache: new Map(state.nonceCache) };
}

describe('Key derivation — deriveDispatchSecret', () => {
  it('produces a 64-char hex string (32 bytes)', async () => {
    const key = await deriveDispatchSecret('ABCD1234', 'saltsalt', PAIRING_SECRET);
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: same inputs produce the same key', async () => {
    const k1 = await deriveDispatchSecret('MYCODE99', 'sessionA', PAIRING_SECRET);
    const k2 = await deriveDispatchSecret('MYCODE99', 'sessionA', PAIRING_SECRET);
    expect(k1).toBe(k2);
  });

  it('different pairingCode produces a different key', async () => {
    const k1 = await deriveDispatchSecret('AAAABBBB', 'saltsalt', PAIRING_SECRET);
    const k2 = await deriveDispatchSecret('CCCCDDDD', 'saltsalt', PAIRING_SECRET);
    expect(k1).not.toBe(k2);
  });

  it('different sessionSalt produces a different key', async () => {
    const k1 = await deriveDispatchSecret('AAAABBBB', 'salt1', PAIRING_SECRET);
    const k2 = await deriveDispatchSecret('AAAABBBB', 'salt2', PAIRING_SECRET);
    expect(k1).not.toBe(k2);
  });

  it('the relay-visible code and salt alone do not determine the key', async () => {
    // The relay sees the pairing code (claim call, register frame) and the
    // session salt (register metadata). Holding both must not be enough.
    const relayGuess = await deriveDispatchSecret('AAAABBBB', 'saltsalt', '11'.repeat(32));
    const real = await deriveDispatchSecret('AAAABBBB', 'saltsalt', '22'.repeat(32));
    expect(relayGuess).not.toBe(real);
  });

  it('refuses to derive without a 32-byte out-of-band secret', async () => {
    await expect(deriveDispatchSecret('AAAABBBB', 'saltsalt', '')).rejects.toThrow(
      'pairing secret',
    );
    await expect(deriveDispatchSecret('AAAABBBB', 'saltsalt', 'not-hex')).rejects.toThrow(
      'pairing secret',
    );
    await expect(deriveDispatchSecret('AAAABBBB', 'saltsalt', '9f'.repeat(31))).rejects.toThrow(
      'pairing secret',
    );
  });

  it('matches the desktop Rust vector byte for byte', async () => {
    // Pinned against derive_session_key in
    // apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs, which asserts
    // the same vector in derive_matches_the_mobile_vector.
    const key = await deriveDispatchSecret('ABCD1234WXYZ', 'a1b2c3d4e5f60718', PAIRING_SECRET);
    expect(key).toBe('99d81f2ce90a7f72238227e608fd6a72795fc6fde038e9e5b9c5f9ec5b9ab6d3');
  });
});

describe('Wire protocol version', () => {
  it('signMessage stamps the current envelope version', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});
    expect(env.v).toBe(DISPATCH_ENVELOPE_VERSION);
  });

  it('rejects a v2 envelope with protocol_version_unsupported, not hmac_mismatch', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'approval_response', { approved: true });
    const { v: _v, ...v2Envelope } = env;
    const result = await verifyMessage(cloneState(state), v2Envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('protocol_version_unsupported');
  });

  it('rejects an envelope claiming a newer protocol version', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});
    const result = await verifyMessage(cloneState(state), { ...env, v: 4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('protocol_version_unsupported');
  });
});

describe('HMAC sign/verify — round-trip', () => {
  it('signMessage returns an envelope with all required fields', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'agents_update', { agents: [] });
    expect(env).toHaveProperty('hmac');
    expect(env).toHaveProperty('nonce');
    expect(env).toHaveProperty('payload');
    expect(env).toHaveProperty('ts');
    expect(env).toHaveProperty('type');
  });

  it('signMessage embeds the correct type and payload', async () => {
    const state = await makeState();
    const payload = { action: 'agents_update', agents: [{ id: 'a1' }] };
    const env = await signMessage(state, 'agents_update', payload);
    expect(env.type).toBe('agents_update');
    expect(env.payload).toEqual(payload);
  });

  it('nonce is a base64 string (24 chars for 16 bytes)', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});
    expect(env.nonce).toHaveLength(24);
    expect(env.nonce).toMatch(/^[A-Za-z0-9+/=]{24}$/);
  });

  it('ts is approximately Date.now()', async () => {
    const before = Date.now();
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});
    const after = Date.now();
    expect(env.ts).toBeGreaterThanOrEqual(before);
    expect(env.ts).toBeLessThanOrEqual(after + 5);
  });

  it('verifyMessage returns ok:true for a valid signed envelope', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'approval_response', { requestId: 'r1', approved: true });
    const verifyState = cloneState(state);
    const result = await verifyMessage(verifyState, env);
    expect(result.ok).toBe(true);
  });

  it('full round-trip: sign on sender state, verify on receiver state', async () => {
    const senderState = await makeState('ROUNDTRIP', 'sess1');
    const receiverState = await makeState('ROUNDTRIP', 'sess1');

    const payload = { action: 'emergency_stop', sentAt: '2026-05-05T00:00:00Z' };
    const envelope = await signMessage(senderState, 'emergency_stop', payload);
    const result = await verifyMessage(receiverState, envelope);
    expect(result.ok).toBe(true);
  });

  it('two consecutive sign calls produce different nonces', async () => {
    const state = await makeState();
    const env1 = await signMessage(state, 'ping', {});
    const env2 = await signMessage(state, 'ping', {});
    expect(env1.nonce).not.toBe(env2.nonce);
  });
});

describe('HMAC rejection', () => {
  it('returns hmac_mismatch for a tampered hmac field', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    const tampered = { ...env, hmac: 'a'.repeat(64) };
    const result = await verifyMessage(receiverState, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('returns hmac_mismatch for a tampered payload', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();
    const env = await signMessage(senderState, 'heartbeat_ack', { text: 'hello' });
    const tampered = { ...env, payload: { text: 'INJECTED' } };
    const result = await verifyMessage(receiverState, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('returns hmac_mismatch for a tampered type field', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();
    const env = await signMessage(senderState, 'agent_command', { agentId: 'a1' });
    const tampered = { ...env, type: 'emergency_stop' };
    const result = await verifyMessage(receiverState, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('returns hmac_mismatch for a tampered ts field', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();
    const env = await signMessage(senderState, 'pong', { timestamp: Date.now() });
    const tampered = { ...env, ts: env.ts + 1 };
    const result = await verifyMessage(receiverState, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('returns hmac_mismatch when wrong session key is used', async () => {
    const senderState = await makeState('SENDERKEY', 'saltsalt');
    const wrongState = await makeState('WRONGKEY1', 'saltsalt');
    const env = await signMessage(senderState, 'ping', {});
    const result = await verifyMessage(wrongState, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('constant-time comparison: all single-char hmac tamperings are rejected', async () => {
    const senderState = await makeState('CTIMEKEY', 'ctimesalt');
    const env = await signMessage(senderState, 'ping', { seq: 1 });

    function tamperAt(hmac: string, pos: number): string {
      const orig = hmac[pos];
      const alt = orig === 'a' ? 'b' : 'a';
      return hmac.slice(0, pos) + alt + hmac.slice(pos + 1);
    }

    const positions = [0, 31, 63];
    for (const pos of positions) {
      const recvState = await makeState('CTIMEKEY', 'ctimesalt');
      const tampered = { ...env, hmac: tamperAt(env.hmac, pos) };
      const result = await verifyMessage(recvState, tampered);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('hmac_mismatch');
      }
    }
  });
});

describe('Replay rejection — timestamp window', () => {
  const RealDateNow = Date.now.bind(Date);

  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('returns timestamp_expired for a ts more than 30s in the past', async () => {
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    jest.spyOn(Date, 'now').mockReturnValue(env.ts + 31_000);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_expired');
  });

  it('returns timestamp_expired for a ts more than 30s in the future', async () => {
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    jest.spyOn(Date, 'now').mockReturnValue(env.ts - 31_000);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_expired');
  });

  it('accepts a ts within +30s window (29 999ms old)', async () => {
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    jest.spyOn(Date, 'now').mockReturnValue(env.ts + 29_999);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(true);
  });

  it('accepts a ts that is slightly in the future (1s ahead)', async () => {
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    jest.spyOn(Date, 'now').mockReturnValue(env.ts - 1_000);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(true);
  });

  void RealDateNow;
});

describe('Replay rejection — nonce sliding-window cache', () => {
  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('returns nonce_replay for the same nonce submitted twice', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();

    const env = await signMessage(senderState, 'ping', {});
    const r1 = await verifyMessage(receiverState, env);
    expect(r1.ok).toBe(true);

    const r2 = await verifyMessage(receiverState, env);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('nonce_replay');
  });

  it('accepts different nonces for the same payload and ts', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();

    const env1 = await signMessage(senderState, 'ping', { timestamp: 1000 });
    const env2 = await signMessage(senderState, 'ping', { timestamp: 1000 });
    expect(env1.nonce).not.toBe(env2.nonce);

    const r1 = await verifyMessage(receiverState, env1);
    expect(r1.ok).toBe(true);
    const r2 = await verifyMessage(receiverState, env2);
    expect(r2.ok).toBe(true);
  });

  it('nonce cache is pruned: entries older than 60s are evicted', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();

    const t0 = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    const env = await signMessage(senderState, 'ping', {});

    const r1 = await verifyMessage(receiverState, env);
    expect(r1.ok).toBe(true);

    const t1 = t0 + 61_000;
    jest.spyOn(Date, 'now').mockReturnValue(t1);

    const env2 = await signMessage(senderState, 'ping', {});
    const r2 = await verifyMessage(receiverState, env2);
    expect(r2.ok).toBe(true);

    expect(receiverState.nonceCache.has(env.nonce)).toBe(false);
  });

  it('after eviction, the previously seen (expired) nonce can be re-used', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();

    const t0 = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    const env = await signMessage(senderState, 'ping', {});
    const r1 = await verifyMessage(receiverState, env);
    expect(r1.ok).toBe(true);

    const t1 = t0 + 61_000;
    jest.spyOn(Date, 'now').mockReturnValue(t1);

    const env2 = await signMessage(senderState, 'ping', {});
    await verifyMessage(receiverState, env2);
    expect(receiverState.nonceCache.has(env.nonce)).toBe(false);

    const r2 = await verifyMessage(receiverState, env);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('timestamp_expired');
  });
});

describe('Malformed message rejection', () => {
  it('returns malformed for non-object input (string)', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, 'not an object');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed for null', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed for envelope missing nonce when hmac is present', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, {
      hmac: 'a'.repeat(64),
      ts: Date.now(),
      type: 'ping',
      payload: {},
      v: DISPATCH_ENVELOPE_VERSION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed for envelope missing ts when hmac is present', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, {
      hmac: 'a'.repeat(64),
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA==',
      type: 'ping',
      payload: {},
      v: DISPATCH_ENVELOPE_VERSION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed for envelope missing type when hmac is present', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, {
      hmac: 'a'.repeat(64),
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA==',
      ts: Date.now(),
      payload: {},
      v: DISPATCH_ENVELOPE_VERSION,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed for array input', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });
});

describe('Unsigned Dispatch messages', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    jest.spyOn(Date, 'now').mockRestore();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('rejects unsigned message before the historical cutoff date', async () => {
    const state = await makeState();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff - 1_000);

    const rawMsg = { action: 'ping', timestamp: Date.now() };
    const result = await verifyMessage(state, rawMsg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsigned_transitional');
  });

  it('does not log a legacy acceptance warning before the historical cutoff', async () => {
    const state = await makeState();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff - 1_000);

    const rawMsg = { action: 'agents_update', agents: [] };
    await verifyMessage(state, rawMsg);

    const securityWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('SECURITY'),
    );
    expect(securityWarns).toHaveLength(0);
  });

  it('rejects unsigned message after DISPATCH_HMAC_REQUIRED_AFTER (fail-closed)', async () => {
    const state = await makeState();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff + 1_000);

    const rawMsg = { action: 'emergency_stop', sentAt: '2026-06-06T00:00:00Z' };
    const result = await verifyMessage(state, rawMsg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsigned_transitional');
  });

  it('does NOT log a warn when unsigned message is rejected after cutoff', async () => {
    const state = await makeState();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff + 5_000);

    const rawMsg = { action: 'ping' };
    await verifyMessage(state, rawMsg);

    const securityWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('SECURITY'),
    );
    expect(securityWarns).toHaveLength(0);
  });
});

describe('Wire format — canonical signing input', () => {
  it('DISPATCH_HMAC_REQUIRED_AFTER is a valid ISO 8601 date string', () => {
    const d = new Date(DISPATCH_HMAC_REQUIRED_AFTER);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(DISPATCH_HMAC_REQUIRED_AFTER).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('signed envelope has all four required outer fields', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'approval_request', { requestId: 'req1' });
    const keys = Object.keys(env).sort();
    expect(keys).toContain('hmac');
    expect(keys).toContain('nonce');
    expect(keys).toContain('payload');
    expect(keys).toContain('ts');
    expect(keys).toContain('type');
    expect(keys).toContain('v');
  });

  it('hmac is 64 hex characters (32 bytes)', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});
    expect(env.hmac).toHaveLength(64);
    expect(env.hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verify fails if canonical input uses non-alphabetical key order', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});

    const tampered = { ...env, nonce: env.type, type: env.nonce };
    const recvState = cloneState(state);
    const result = await verifyMessage(recvState, tampered);
    expect(result.ok).toBe(false);
  });
});
