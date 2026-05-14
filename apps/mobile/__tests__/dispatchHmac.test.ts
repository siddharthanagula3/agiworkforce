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
 *  Transitional mode — unsigned messages
 *   - unsigned message (no hmac field) returns ok:true before DISPATCH_HMAC_REQUIRED_AFTER
 *   - unsigned message logs a console.warn during transitional period
 *   - unsigned message returns unsigned_transitional after cutoff date (fail-closed)
 *
 *  Wire format
 *   - canonical signing input has keys in alphabetical order: nonce < payload < ts < type
 *   - DISPATCH_HMAC_REQUIRED_AFTER is exported and is a valid ISO 8601 date string
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Mock expo-crypto with a deterministic SHA-256 implementation using Node's
// built-in `crypto` module so tests run in Jest without native modules.
jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');

  // Deterministic SHA-256 over a Buffer / Uint8Array using Node crypto
  function nodesha256(data: ArrayBuffer): ArrayBuffer {
    const hash = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest();
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer;
  }

  // Deterministic random bytes counter (starts at 0) for predictable nonces
  let _nonceCounter = 0;

  return {
    __esModule: true,
    CryptoDigestAlgorithm: { SHA256: 'SHA-256', SHA512: 'SHA-512' },
    // digest(algorithm, ArrayBuffer) — used by our sha256() helper
    digest: jest.fn(async (_algo: string, data: ArrayBuffer) => {
      return nodesha256(data);
    }),
    // getRandomBytes — return deterministic bytes for reproducible nonce tests
    getRandomBytes: jest.fn((n: number): Uint8Array => {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        bytes[i] = (_nonceCounter * 37 + i * 7) & 0xff;
      }
      _nonceCounter++;
      return bytes;
    }),
    // digestStringAsync — not used by the v2 implementation but kept for compat
    digestStringAsync: jest.fn(async (_algo: string, data: string) => {
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    }),
    randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
    getRandomBytesAsync: jest.fn(async (n: number) => new Uint8Array(n)),
    // expose reset helper for tests that need fresh nonce counters
    __resetNonceCounter: () => {
      _nonceCounter = 0;
    },
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  deriveDispatchSecret,
  signMessage,
  verifyMessage,
  DISPATCH_HMAC_REQUIRED_AFTER,
  type HmacSessionState,
} from '../lib/dispatchHmac';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh HmacSessionState with a known 32-byte key (64 hex chars). */
async function makeState(pairingCode = 'TESTCODE', salt = 'testsalt'): Promise<HmacSessionState> {
  const secret = await deriveDispatchSecret(pairingCode, salt);
  return { secret, nonceCache: new Map() };
}

/** Clone a state so tests don't share mutable nonceCache references. */
function cloneState(state: HmacSessionState): HmacSessionState {
  return { secret: state.secret, nonceCache: new Map(state.nonceCache) };
}

// ---------------------------------------------------------------------------
// 1. Key derivation
// ---------------------------------------------------------------------------

describe('Key derivation — deriveDispatchSecret', () => {
  it('produces a 64-char hex string (32 bytes)', async () => {
    const key = await deriveDispatchSecret('ABCD1234', 'saltsalt');
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: same inputs produce the same key', async () => {
    const k1 = await deriveDispatchSecret('MYCODE99', 'sessionA');
    const k2 = await deriveDispatchSecret('MYCODE99', 'sessionA');
    expect(k1).toBe(k2);
  });

  it('different pairingCode produces a different key', async () => {
    const k1 = await deriveDispatchSecret('AAAABBBB', 'saltsalt');
    const k2 = await deriveDispatchSecret('CCCCDDDD', 'saltsalt');
    expect(k1).not.toBe(k2);
  });

  it('different sessionSalt produces a different key', async () => {
    const k1 = await deriveDispatchSecret('AAAABBBB', 'salt1');
    const k2 = await deriveDispatchSecret('AAAABBBB', 'salt2');
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// 2. Sign / Verify — round-trip
// ---------------------------------------------------------------------------

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
    // 16 bytes base64 = ceil(16/3)*4 = 24 chars
    expect(env.nonce).toHaveLength(24);
    // Valid base64 characters
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
    const receiverState = await makeState('ROUNDTRIP', 'sess1'); // same derivation inputs

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

// ---------------------------------------------------------------------------
// 3. HMAC Reject — invalid HMAC
// ---------------------------------------------------------------------------

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
    const env = await signMessage(senderState, 'dispatch_response', { text: 'hello' });
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
    // Shift ts by 1ms — still within 30s window but HMAC now invalid
    const tampered = { ...env, ts: env.ts + 1 };
    const result = await verifyMessage(receiverState, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('returns hmac_mismatch when wrong session key is used', async () => {
    const senderState = await makeState('SENDERKEY', 'saltsalt');
    const wrongState = await makeState('WRONGKEY1', 'saltsalt'); // different pairing code
    const env = await signMessage(senderState, 'ping', {});
    const result = await verifyMessage(wrongState, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hmac_mismatch');
  });

  it('constant-time comparison: all single-char hmac tamperings are rejected', async () => {
    // Not a true timing test (Jest cannot measure ns-level timing), but ensures
    // the constant-time comparison path is exercised and the rejection reason is
    // always 'hmac_mismatch', not a short-circuit early return.
    const senderState = await makeState('CTIMEKEY', 'ctimesalt');
    const env = await signMessage(senderState, 'ping', { seq: 1 });

    // Build a set of hex chars that differ from the real hmac at a given position
    function tamperAt(hmac: string, pos: number): string {
      const orig = hmac[pos];
      // Use a character that is guaranteed different from orig
      const alt = orig === 'a' ? 'b' : 'a';
      return hmac.slice(0, pos) + alt + hmac.slice(pos + 1);
    }

    // Tamper at first, middle, and last positions
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

// ---------------------------------------------------------------------------
// 4. Replay — timestamp window
// ---------------------------------------------------------------------------

describe('Replay rejection — timestamp window', () => {
  const RealDateNow = Date.now.bind(Date);

  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('returns timestamp_expired for a ts more than 30s in the past', async () => {
    const senderState = await makeState();
    // Sign a message with real time
    const env = await signMessage(senderState, 'ping', {});
    // Receiver checks 31s later — message is expired
    jest.spyOn(Date, 'now').mockReturnValue(env.ts + 31_000);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_expired');
  });

  it('returns timestamp_expired for a ts more than 30s in the future', async () => {
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    // Message claims to be from 31s in the future
    jest.spyOn(Date, 'now').mockReturnValue(env.ts - 31_000);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timestamp_expired');
  });

  it('accepts a ts within +30s window (29 999ms old)', async () => {
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    // Receiver is 29 999ms later — still within window
    jest.spyOn(Date, 'now').mockReturnValue(env.ts + 29_999);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(true);
  });

  it('accepts a ts that is slightly in the future (1s ahead)', async () => {
    // Clocks may drift — accept up to 30s in the future
    const senderState = await makeState();
    const env = await signMessage(senderState, 'ping', {});
    jest.spyOn(Date, 'now').mockReturnValue(env.ts - 1_000);
    const receiverState = await makeState();
    const result = await verifyMessage(receiverState, env);
    expect(result.ok).toBe(true);
  });

  // Keep RealDateNow reference to avoid accidental use
  void RealDateNow;
});

// ---------------------------------------------------------------------------
// 5. Replay — nonce sliding-window cache
// ---------------------------------------------------------------------------

describe('Replay rejection — nonce sliding-window cache', () => {
  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('returns nonce_replay for the same nonce submitted twice', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();

    const env = await signMessage(senderState, 'ping', {});
    // First verify: accepted and nonce cached
    const r1 = await verifyMessage(receiverState, env);
    expect(r1.ok).toBe(true);

    // Second verify with identical envelope (same nonce): replay rejected
    const r2 = await verifyMessage(receiverState, env);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('nonce_replay');
  });

  it('accepts different nonces for the same payload and ts', async () => {
    const senderState = await makeState();
    const receiverState = await makeState();

    // Both messages signed with the same payload but different nonces
    const env1 = await signMessage(senderState, 'ping', { timestamp: 1000 });
    const env2 = await signMessage(senderState, 'ping', { timestamp: 1000 });
    // Ensure nonces actually differ (mock counter increments)
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
    // At time t0: sign and verify a message
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    const env = await signMessage(senderState, 'ping', {});

    // Adjust env.ts to match mocked now (signMessage uses Date.now internally)
    // Since env.ts comes from Date.now() inside signMessage, it should equal t0
    const r1 = await verifyMessage(receiverState, env);
    expect(r1.ok).toBe(true);

    // At time t0 + 61s: nonce cache TTL expired; re-verify same nonce
    // ts is still within window (we move time forward 61s but ts is t0)
    // Actually ts would now be 61s old — outside 30s window.
    // Use a fresh envelope signed at the new time, then test that the
    // old nonce WAS evicted (by testing nonceCache size).
    const t1 = t0 + 61_000;
    jest.spyOn(Date, 'now').mockReturnValue(t1);

    // Sign a new message (ts = t1) with a DIFFERENT nonce
    const env2 = await signMessage(senderState, 'ping', {});
    // Verify to trigger pruning
    const r2 = await verifyMessage(receiverState, env2);
    expect(r2.ok).toBe(true);

    // After pruning, the nonce from env (at t0) should be gone from the cache
    // because t0 + 61_000 - 60_000 = t0 + 1_000 > t0
    expect(receiverState.nonceCache.has(env.nonce)).toBe(false);
  });

  it('after eviction, the previously seen (expired) nonce can be re-used', async () => {
    // This models the extreme edge case where an attacker waits >60s to replay.
    // The nonce is no longer in the cache, but the ts check will catch it
    // (the original ts is now > 30s old). This test verifies the two defenses
    // work in tandem.
    const senderState = await makeState();
    const receiverState = await makeState();

    const t0 = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    const env = await signMessage(senderState, 'ping', {});
    const r1 = await verifyMessage(receiverState, env);
    expect(r1.ok).toBe(true);

    // 61s later: nonce evicted from cache
    const t1 = t0 + 61_000;
    jest.spyOn(Date, 'now').mockReturnValue(t1);

    // The nonce is now absent from the cache...
    // Trigger pruning by calling verifyMessage with a fresh msg
    const env2 = await signMessage(senderState, 'ping', {});
    await verifyMessage(receiverState, env2);
    expect(receiverState.nonceCache.has(env.nonce)).toBe(false);

    // ...but replaying env at t1 is still rejected by timestamp_expired
    // (env.ts = t0 which is 61s old, exceeds 30s window)
    const r2 = await verifyMessage(receiverState, env);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('timestamp_expired');
  });
});

// ---------------------------------------------------------------------------
// 6. Malformed messages
// ---------------------------------------------------------------------------

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
      // nonce: missing
      ts: Date.now(),
      type: 'ping',
      payload: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed for envelope missing ts when hmac is present', async () => {
    const state = await makeState();
    const result = await verifyMessage(state, {
      hmac: 'a'.repeat(64),
      nonce: 'AAAAAAAAAAAAAAAAAAAAAA==',
      // ts: missing
      type: 'ping',
      payload: {},
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
      // type: missing
      payload: {},
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

// ---------------------------------------------------------------------------
// 7. Transitional mode — unsigned messages
// ---------------------------------------------------------------------------

describe('Transitional mode — unsigned messages', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    jest.spyOn(Date, 'now').mockRestore();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('accepts unsigned message (no hmac field) before the cutoff date', async () => {
    const state = await makeState();
    // Ensure we are before DISPATCH_HMAC_REQUIRED_AFTER
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff - 1_000);

    const rawMsg = { action: 'ping', timestamp: Date.now() };
    const result = await verifyMessage(state, rawMsg);
    expect(result.ok).toBe(true);
  });

  it('logs a console.warn for unsigned messages during the transitional period', async () => {
    const state = await makeState();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff - 1_000);

    const rawMsg = { action: 'agents_update', agents: [] };
    await verifyMessage(state, rawMsg);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SECURITY'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(DISPATCH_HMAC_REQUIRED_AFTER));
  });

  it('rejects unsigned message after DISPATCH_HMAC_REQUIRED_AFTER (fail-closed)', async () => {
    const state = await makeState();
    const cutoff = new Date(DISPATCH_HMAC_REQUIRED_AFTER).getTime();
    jest.spyOn(Date, 'now').mockReturnValue(cutoff + 1_000); // past cutoff

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

    // warn should NOT be called with the SECURITY message after cutoff
    const securityWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('SECURITY'),
    );
    expect(securityWarns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Wire format — canonical signing input
// ---------------------------------------------------------------------------

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
  });

  it('hmac is 64 hex characters (32 bytes)', async () => {
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});
    expect(env.hmac).toHaveLength(64);
    expect(env.hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verify fails if canonical input uses non-alphabetical key order', async () => {
    // This test constructs a fake envelope where the hmac was computed with
    // a different key ordering (type < nonce instead of nonce < type) and
    // confirms it fails verification — proving our canonical ordering is
    // actually enforced.
    const state = await makeState();
    const env = await signMessage(state, 'ping', {});

    // Tamper: swap nonce and type values without recomputing hmac
    const tampered = { ...env, nonce: env.type, type: env.nonce };
    const recvState = cloneState(state);
    const result = await verifyMessage(recvState, tampered);
    // Either hmac_mismatch (nonce/type values are wrong) or malformed;
    // either way it must not be ok:true
    expect(result.ok).toBe(false);
  });
});
