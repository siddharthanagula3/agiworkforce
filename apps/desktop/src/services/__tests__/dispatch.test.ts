import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

import {
  initDispatchSession,
  verifyInbound,
  signOutbound,
  resetDispatchSession,
  rotateDispatchKey,
  extractDispatchSalt,
  isDispatchSessionActive,
  setDispatchCallbacks,
} from '../dispatch';

function makeRawEnvelope(overrides?: Partial<Record<string, unknown>>): string {
  return JSON.stringify({
    hmac: 'a'.repeat(64),
    nonce: 'AAAA==',
    payload: { action: 'ping' },
    ts: Date.now(),
    type: 'ping',
    ...overrides,
  });
}

const PAIRING_SECRET = '9f'.repeat(32);

function makeRawEnvelopeWithoutVersion(): string {
  return JSON.stringify({
    hmac: 'a'.repeat(64),
    nonce: 'AAAA==',
    payload: { action: 'ping' },
    ts: Date.now(),
    type: 'ping',
  });
}

async function setupSession(): Promise<void> {
  mockInvoke.mockResolvedValueOnce('a'.repeat(64));
  await initDispatchSession('ABCD1234', 'deadbeef01234567', PAIRING_SECRET);
}

describe('extractDispatchSalt', () => {
  it('returns null for null metadata', () => {
    expect(extractDispatchSalt(null)).toBeNull();
  });

  it('returns null for undefined metadata', () => {
    expect(extractDispatchSalt(undefined)).toBeNull();
  });

  it('returns null when dispatchSalt is absent', () => {
    expect(extractDispatchSalt({ version: '1.3.0' })).toBeNull();
  });

  it('returns null when dispatchSalt is empty string', () => {
    expect(extractDispatchSalt({ dispatchSalt: '' })).toBeNull();
  });

  it('returns null when dispatchSalt is not a string', () => {
    expect(extractDispatchSalt({ dispatchSalt: 42 })).toBeNull();
  });

  it('extracts salt without version', () => {
    const result = extractDispatchSalt({ dispatchSalt: 'abc123' });
    expect(result).toEqual({ salt: 'abc123', version: undefined });
  });

  it('extracts salt with version', () => {
    const result = extractDispatchSalt({ dispatchSalt: 'abc123', version: '1.3.0' });
    expect(result).toEqual({ salt: 'abc123', version: '1.3.0' });
  });
});

describe('initDispatchSession', () => {
  beforeEach(async () => {
    await resetDispatchSession();
    mockInvoke.mockReset();
  });

  it('keys the native session on the out-of-band pairing secret, not just relay-visible inputs', async () => {
    mockInvoke.mockResolvedValueOnce('key_hex');
    const result = await initDispatchSession('ABCD1234', 'salthex', PAIRING_SECRET);
    expect(mockInvoke).toHaveBeenCalledWith('dispatch_hmac_init', {
      pairingCode: 'ABCD1234',
      sessionSalt: 'salthex',
      pairingSecret: PAIRING_SECRET,
    });
    expect(result).toBe('key_hex');
  });

  it('marks session as active after init', async () => {
    mockInvoke.mockResolvedValueOnce('key_hex');
    expect(isDispatchSessionActive()).toBe(false);
    await initDispatchSession('ABCD1234', 'salthex', PAIRING_SECRET);
    expect(isDispatchSessionActive()).toBe(true);
  });

  it('fires onVersionMismatch callback when mobile version is too old', async () => {
    mockInvoke.mockResolvedValueOnce('key_hex');
    const onVersionMismatch = vi.fn();
    setDispatchCallbacks({ onVersionMismatch });
    await initDispatchSession('ABCD1234', 'salthex', PAIRING_SECRET, '1.2.9');
    expect(onVersionMismatch).toHaveBeenCalledWith('1.2.9', '1.3.0');
    setDispatchCallbacks({ onVersionMismatch: undefined });
  });

  it('does not fire onVersionMismatch when mobile version is sufficient', async () => {
    mockInvoke.mockResolvedValueOnce('key_hex');
    const onVersionMismatch = vi.fn();
    setDispatchCallbacks({ onVersionMismatch });
    await initDispatchSession('ABCD1234', 'salthex', PAIRING_SECRET, '1.3.0');
    expect(onVersionMismatch).not.toHaveBeenCalled();
    setDispatchCallbacks({ onVersionMismatch: undefined });
  });
});

describe('dispatch protocol version', () => {
  beforeEach(async () => {
    await resetDispatchSession();
    mockInvoke.mockReset();
    await setupSession();
  });

  it('surfaces update_required for an envelope from a peer on the old protocol', async () => {
    const onProtocolVersionUnsupported = vi.fn();
    setDispatchCallbacks({ onProtocolVersionUnsupported });
    mockInvoke.mockRejectedValueOnce('update_required');

    const result = await verifyInbound({ rawJson: makeRawEnvelopeWithoutVersion() });

    expect(result).toEqual({ ok: false, reason: 'update_required' });
    expect(onProtocolVersionUnsupported).toHaveBeenCalledOnce();
    setDispatchCallbacks({ onProtocolVersionUnsupported: undefined });
  });
});

describe('verifyInbound', () => {
  beforeEach(async () => {
    await resetDispatchSession();
    mockInvoke.mockReset();
    await setupSession();
  });

  it('returns session_not_initialised error without a session', async () => {
    await resetDispatchSession();
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: false, reason: 'session_not_initialised' });
  });

  it('returns ok:true for a signed message', async () => {
    mockInvoke.mockResolvedValueOnce('signed');
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: true, outcome: 'signed' });
  });

  it('returns ok:true for unsigned_transitional and fires callback', async () => {
    const onUnsignedTransitional = vi.fn();
    setDispatchCallbacks({ onUnsignedTransitional });
    mockInvoke.mockResolvedValueOnce('unsigned_transitional');
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: true, outcome: 'unsigned_transitional' });
    expect(onUnsignedTransitional).toHaveBeenCalledOnce();
    setDispatchCallbacks({ onUnsignedTransitional: undefined });
  });

  it('deduplicates by message ID without calling Rust again', async () => {
    mockInvoke.mockResolvedValueOnce('signed');
    const envelope = { id: 'msg-abc-123', rawJson: makeRawEnvelope() };
    const first = await verifyInbound(envelope);
    expect(first).toEqual({ ok: true, outcome: 'signed' });

    const second = await verifyInbound(envelope);
    expect(second).toEqual({ ok: false, reason: 'duplicate_message_id' });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false for timestamp_expired rejection', async () => {
    mockInvoke.mockRejectedValueOnce('timestamp_expired');
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: false, reason: 'timestamp_expired' });
  });

  it('returns ok:false for nonce_replay rejection', async () => {
    mockInvoke.mockRejectedValueOnce('nonce_replay');
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: false, reason: 'nonce_replay' });
  });

  it('returns ok:false for unsigned_after_cutoff rejection', async () => {
    mockInvoke.mockRejectedValueOnce('unsigned_after_cutoff');
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: false, reason: 'unsigned_after_cutoff' });
  });

  it('returns ok:false for hmac_mismatch rejection', async () => {
    mockInvoke.mockRejectedValueOnce('hmac_mismatch');
    const result = await verifyInbound({ rawJson: makeRawEnvelope() });
    expect(result).toEqual({ ok: false, reason: 'hmac_mismatch' });
  });

  it('returns ok:false for malformed rejection', async () => {
    mockInvoke.mockRejectedValueOnce('malformed');
    const result = await verifyInbound({ rawJson: 'not json' });
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('signOutbound', () => {
  beforeEach(async () => {
    await resetDispatchSession();
    mockInvoke.mockReset();
    await setupSession();
  });

  it('throws when session is not active', async () => {
    await resetDispatchSession();
    await expect(signOutbound({ action: 'ping' }, 'ping')).rejects.toThrow(
      'session not initialised',
    );
  });

  it('calls dispatch_hmac_sign and returns wire JSON', async () => {
    const wireJson =
      '{"hmac":"aaa","nonce":"bbb","payload":{"action":"ping"},"ts":1,"type":"ping"}';
    mockInvoke.mockResolvedValueOnce(wireJson);
    const result = await signOutbound({ action: 'ping' }, 'ping');
    expect(result).toBe(wireJson);
    expect(mockInvoke).toHaveBeenCalledWith('dispatch_hmac_sign', {
      payload: { action: 'ping' },
      msgType: 'ping',
    });
  });
});

describe('rotateDispatchKey', () => {
  beforeEach(async () => {
    await resetDispatchSession();
    mockInvoke.mockReset();
    await setupSession();
  });

  it('calls cloud key rotation and re-initialises session key', async () => {
    const newKeyHex = 'b'.repeat(64);
    mockInvoke.mockResolvedValueOnce(newKeyHex);
    const rotateKeyRequest = vi.fn().mockResolvedValue({ new_salt: 'newsalt' });
    const onKeyRotated = vi.fn();
    setDispatchCallbacks({ onKeyRotated });

    await rotateDispatchKey('ABCD1234', PAIRING_SECRET, rotateKeyRequest);

    expect(rotateKeyRequest).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith('dispatch_hmac_init', {
      pairingCode: 'ABCD1234',
      sessionSalt: 'newsalt',
      pairingSecret: PAIRING_SECRET,
    });
    expect(onKeyRotated).toHaveBeenCalledWith(newKeyHex);
    setDispatchCallbacks({ onKeyRotated: undefined });
  });

  it('retries up to 3 times on failure then throws', async () => {
    vi.useFakeTimers();
    const rotateKeyRequest = vi.fn().mockRejectedValue(new Error('network'));

    const rotatePromise = rotateDispatchKey('ABCD1234', PAIRING_SECRET, rotateKeyRequest).catch(
      (e: unknown) => e,
    );
    await vi.runAllTimersAsync();
    const result = await rotatePromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch('key rotation failed after 3 attempts');
    expect(rotateKeyRequest).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('resetDispatchSession', () => {
  beforeEach(async () => {
    await resetDispatchSession();
    mockInvoke.mockReset();
  });

  it('calls dispatch_hmac_reset and marks session inactive', async () => {
    await setupSession();
    expect(isDispatchSessionActive()).toBe(true);

    mockInvoke.mockResolvedValueOnce(undefined);
    await resetDispatchSession();

    expect(mockInvoke).toHaveBeenCalledWith('dispatch_hmac_reset', undefined);
    expect(isDispatchSessionActive()).toBe(false);
  });

  it('revokes renderer authority before native key cleanup resolves', async () => {
    await setupSession();
    let resolveReset!: () => void;
    mockInvoke.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveReset = resolve;
      }),
    );

    const resetPromise = resetDispatchSession();

    expect(isDispatchSessionActive()).toBe(false);
    await expect(signOutbound({ action: 'ping' }, 'ping')).rejects.toThrow(
      'session not initialised',
    );
    resolveReset();
    await resetPromise;
  });

  it('orders reset after an in-flight setup and never activates the stale key', async () => {
    let resolveSetup!: (key: string) => void;
    const pendingSetup = new Promise<string>((resolve) => {
      resolveSetup = resolve;
    });
    mockInvoke.mockImplementation((command) => {
      if (command === 'dispatch_hmac_init') return pendingSetup;
      if (command === 'dispatch_hmac_reset') return Promise.resolve(undefined);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const setupPromise = initDispatchSession('ABCD1234', 'stale-salt', PAIRING_SECRET);
    await vi.waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('dispatch_hmac_init', {
        pairingCode: 'ABCD1234',
        sessionSalt: 'stale-salt',
        pairingSecret: PAIRING_SECRET,
      }),
    );
    const resetPromise = resetDispatchSession();

    expect(isDispatchSessionActive()).toBe(false);
    resolveSetup('stale-key');
    await expect(setupPromise).rejects.toThrow('session setup superseded');
    await resetPromise;

    expect(isDispatchSessionActive()).toBe(false);
    expect(mockInvoke.mock.calls.map(([command]) => command)).toEqual([
      'dispatch_hmac_init',
      'dispatch_hmac_reset',
    ]);
  });

  it('is a no-op when session is already inactive', async () => {
    await resetDispatchSession();
    expect(isDispatchSessionActive()).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
