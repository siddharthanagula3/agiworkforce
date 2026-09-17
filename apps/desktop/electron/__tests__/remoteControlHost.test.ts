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
});
