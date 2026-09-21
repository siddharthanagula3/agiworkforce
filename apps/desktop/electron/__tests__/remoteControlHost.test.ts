import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingClientOptions } from '@agiworkforce/types';
import type { RemoteControlState } from '@agiworkforce/local-runtime-contract';
import { createRemoteControlHost } from '../remote/remoteControlHost';
import {
  createDispatchSession,
  deriveDispatchKey,
  signDispatchEnvelope,
  verifyDispatchEnvelope,
} from '../remote/dispatchEnvelope';

const CODE = 'ABCD1234WXYZ';
const SALT = 'a1b2c3d4e5f60718';

let states: RemoteControlState[];
let clientOptions: SignalingClientOptions | null;
let signals: Array<{ kind: string; payload: Record<string, unknown> }>;
const close = vi.fn();

const code = {
  listSessions: vi.fn(async () => ({ groups: [] })),
  readActivity: vi.fn(),
  startTurn: vi.fn(async () => ({ turnId: 'turn-1' })),
  interruptTurn: vi.fn(async () => true),
  answerApproval: vi.fn(async () => true),
  readDiff: vi.fn(async () => null),
};

function makeHost() {
  return createRemoteControlHost({
    code,
    deviceName: () => 'Studio Mac',
    appVersion: () => '1.8.0',
    createSocket: () => {
      throw new Error('the fake client never opens a socket');
    },
    onStateChanged: (state) => states.push(state),
    createClient: (options) => {
      clientOptions = options;
      return {
        sendSignal: (kind, payload) => {
          signals.push({ kind, payload: payload as Record<string, unknown> });
          return true;
        },
        close,
      };
    },
  });
}

function startRequest() {
  return { code: CODE, wsUrl: 'wss://relay.example/ws', pairToken: 'desktop-token', expiresAt: 1 };
}

function secretFrom(state: RemoteControlState): string {
  const [, , secret] = (state.qrPayload ?? '').split(':');
  return secret ?? '';
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

beforeEach(() => {
  states = [];
  clientOptions = null;
  signals = [];
  vi.clearAllMocks();
});

describe('remote control host in the desktop main process', () => {
  it('registers as the desktop and publishes a QR payload carrying the out-of-band secret', () => {
    const host = makeHost();
    const state = host.start(startRequest());

    expect(state).toMatchObject({ status: 'waiting', pairingCode: CODE });
    expect(state.qrPayload).toMatch(new RegExp(`^agiw3:${CODE}:[0-9a-f]{64}$`));
    expect(clientOptions).toMatchObject({
      code: CODE,
      role: 'desktop',
      pairToken: 'desktop-token',
      metadata: { deviceName: 'Studio Mac', version: '1.8.0' },
    });
    expect(JSON.stringify(clientOptions?.metadata)).not.toContain(secretFrom(state));
  });

  it('refuses a relay address that is not a WebSocket', () => {
    const host = makeHost();
    expect(() => host.start({ ...startRequest(), wsUrl: 'https://relay.example' })).toThrow();
    expect(clientOptions).toBeNull();
  });

  // This accepted 8 to 32 characters, a shape the relay never mints, so a code
  // that could not exist was carried all the way to the relay before refusal.
  it('refuses a code the relay could not have issued', () => {
    const host = makeHost();
    for (const code of ['ABCD1234', 'ABCD1234WXY', 'ABCD1234WXYZ9', 'abcd1234wxyz']) {
      expect(() => host.start({ ...startRequest(), code })).toThrow();
    }
    expect(clientOptions).toBeNull();
  });

  it('keys the session from the phone salt, acknowledges signed controls and answers over the relay', async () => {
    const host = makeHost();
    const secret = secretFrom(host.start(startRequest()));
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: 'Pixel' },
    });
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'Pixel' });
    await flush();

    const phone = createDispatchSession(deriveDispatchKey(CODE, SALT, secret));
    const envelope = signDispatchEnvelope(phone, 'code.sessions.list', {
      action: 'code.sessions.list',
      version: 1,
      requestId: 'req-list',
      sentAt: new Date().toISOString(),
    });
    signals = [];
    clientOptions?.onEvent({
      type: 'signal',
      from: 'mobile',
      kind: 'control',
      payload: { action: 'code.sessions.list', data: envelope },
    });
    await flush();

    const actions = signals.map((signal) => signal.payload['action']);
    expect(actions).toEqual(['control.receipt', 'code.sessions']);
    for (const signal of signals) {
      expect(verifyDispatchEnvelope(phone, signal.payload['data'])).toMatchObject({ ok: true });
    }
    expect(code.listSessions).toHaveBeenCalled();
  });

  it('drops a control the phone did not sign with the paired key', async () => {
    const host = makeHost();
    host.start(startRequest());
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT },
    });
    await flush();
    code.listSessions.mockClear();
    signals = [];

    const relayForged = signDispatchEnvelope(
      createDispatchSession(deriveDispatchKey(CODE, SALT, '00'.repeat(32))),
      'code.sessions.list',
      {
        action: 'code.sessions.list',
        version: 1,
        requestId: 'r',
        sentAt: new Date().toISOString(),
      },
    );
    clientOptions?.onEvent({
      type: 'signal',
      from: 'mobile',
      kind: 'control',
      payload: { action: 'code.sessions.list', data: relayForged },
    });
    await flush();

    expect(signals).toEqual([]);
    expect(code.listSessions).not.toHaveBeenCalled();
  });

  it('refuses a phone that offers no salt and returns to idle on stop', () => {
    const host = makeHost();
    host.start(startRequest());
    clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: {} });
    expect(states.at(-1)).toMatchObject({ status: 'error' });

    expect(host.stop()).toMatchObject({ status: 'idle', qrPayload: null });
    expect(close).toHaveBeenCalled();
  });
  it('returns to waiting when the phone goes away, and forgets its session', async () => {
    const host = makeHost();
    const started = host.start(startRequest());
    const secret = secretFrom(started);
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: 'A phone' },
    });
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'A phone' });

    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
    expect(states.at(-1)).toMatchObject({
      status: 'waiting',
      phoneName: null,
      attachedSessions: 0,
    });

    const before = signals.length;
    const session = createDispatchSession(deriveDispatchKey(CODE, SALT, secret));
    clientOptions?.onEvent({
      type: 'signal',
      kind: 'control',
      payload: signDispatchEnvelope(session, 'heartbeat', { action: 'heartbeat' }),
    });
    await flush();
    expect(signals.length).toBe(before);
  });

  it('takes the phone back after it reconnects, on a key of its own', async () => {
    const host = makeHost();
    const started = host.start(startRequest());
    const secret = secretFrom(started);
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT },
    });
    await flush();
    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });

    const secondSalt = '0f1e2d3c4b5a6978';
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: secondSalt, deviceName: 'A phone again' },
    });
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'A phone again' });

    const before = signals.length;
    const reconnected = createDispatchSession(deriveDispatchKey(CODE, secondSalt, secret));
    clientOptions?.onEvent({
      type: 'signal',
      kind: 'control',
      payload: signDispatchEnvelope(reconnected, 'heartbeat', {
        action: 'heartbeat',
        timestamp: 5,
      }),
    });
    await flush();
    expect(signals.length).toBeGreaterThan(before);
  });

  it('ignores a control still signed with the key the last session used', async () => {
    const host = makeHost();
    const started = host.start(startRequest());
    const secret = secretFrom(started);
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT },
    });
    await flush();
    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: '0f1e2d3c4b5a6978' },
    });
    await flush();

    const before = signals.length;
    const stale = createDispatchSession(deriveDispatchKey(CODE, SALT, secret));
    clientOptions?.onEvent({
      type: 'signal',
      kind: 'control',
      payload: signDispatchEnvelope(stale, 'heartbeat', { action: 'heartbeat' }),
    });
    await flush();
    expect(signals.length).toBe(before);
  });

  it('ends the session when the relay drops it rather than waiting on a dead socket', () => {
    for (const type of ['session_expired', 'terminated'] as const) {
      states = [];
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({ type, role: 'mobile' });
      expect(states.at(-1), type).toMatchObject({ status: 'idle', qrPayload: null });
      expect(host.state().status).toBe('idle');
    }
  });

  it('says the relay failed only while nothing is connected through it', async () => {
    const host = makeHost();
    host.start(startRequest());
    clientOptions?.onEvent({ type: 'error', role: 'mobile' });
    expect(states.at(-1)).toMatchObject({ status: 'error' });

    const connected = makeHost();
    connected.start(startRequest());
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT },
    });
    await flush();
    clientOptions?.onEvent({ type: 'error', role: 'mobile' });
    expect(connected.state().status).toBe('connected');
  });
});
