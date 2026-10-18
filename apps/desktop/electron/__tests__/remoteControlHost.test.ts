import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingClientOptions } from '@agiworkforce/types';
import type { RemoteControlState } from '@agiworkforce/local-runtime-contract';
import {
  createDispatchSession,
  createRemoteControlHost,
  deriveDispatchKey,
  signDispatchEnvelope,
  verifyDispatchEnvelope,
  type RemoteApprovalOutcome,
  type RemotePairingDisplay,
  type RemotePhoneToConfirm,
} from '@agiworkforce/utils/remote-control';
import { isAllowedRelayUrl } from '../config';

const CODE = 'ABCD1234WXYZ';
const SALT = 'a1b2c3d4e5f60718';
const RELAY = 'wss://agiworkforce-signaling.fly.dev/ws';

let states: RemoteControlState[];
let clientOptions: SignalingClientOptions | null;
let signals: Array<{ kind: string; payload: Record<string, unknown> }>;
const close = vi.fn();
let pairings: Array<RemotePairingDisplay | null>;
const confirmPhone = vi.fn<(phone: RemotePhoneToConfirm) => Promise<boolean>>();

const code = {
  listSessions: vi.fn(async () => ({ groups: [] })),
  readActivity: vi.fn(),
  startTurn: vi.fn(async () => ({ turnId: 'turn-1' })),
  interruptTurn: vi.fn(async () => true),
  answerApproval: vi.fn(async (): Promise<RemoteApprovalOutcome> => ({ status: 'applied' })),
  readDiff: vi.fn(async () => null),
};

function makeHost(allowInsecureLoopback = false, allowRelayUrl?: (wsUrl: string) => boolean) {
  return createRemoteControlHost({
    allowInsecureLoopback,
    allowRelayUrl,
    code,
    deviceName: () => 'Studio Mac',
    appVersion: () => '1.8.0',
    createSocket: () => {
      throw new Error('the fake client never opens a socket');
    },
    onStateChanged: (state) => states.push(state),
    presentPairing: (pairing) => pairings.push(pairing),
    confirmPhone,
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
  return { code: CODE, wsUrl: RELAY, pairToken: 'desktop-token', expiresAt: 1 };
}

function presentedSecret(): string {
  const shown = pairings.filter((pairing) => pairing !== null).at(-1);
  const [, , secret] = (shown?.qrPayload ?? '').split(':');
  return secret ?? '';
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** What only the phone that scanned the code can send: a control signed with the key the secret gives. */
async function signAsPhone(secret: string, salt: string, action = 'heartbeat') {
  const phone = createDispatchSession(deriveDispatchKey(CODE, salt, secret));
  const envelope = signDispatchEnvelope(phone, action, { action, timestamp: 5 });
  clientOptions?.onEvent({ type: 'signal', from: 'mobile', kind: 'control', payload: envelope });
  await flush();
  return { phone, envelope };
}

beforeEach(() => {
  states = [];
  clientOptions = null;
  signals = [];
  pairings = [];
  vi.clearAllMocks();
  confirmPhone.mockResolvedValue(true);
});

describe('remote control host in the desktop main process', () => {
  it('passes an explicitly enabled development loopback connection to the shared client', () => {
    const host = makeHost(true);
    host.start({ ...startRequest(), wsUrl: 'ws://127.0.0.1:4000/ws' });
    expect(clientOptions).toMatchObject({
      wsUrl: 'ws://127.0.0.1:4000/ws',
      allowInsecureLoopback: true,
    });
    host.stop();
  });

  it.each([
    'ws://relay.example/ws',
    'ws://localhost:4000/ws',
    'wss://token@relay.example/ws',
    'wss://relay.example/ws#token',
  ])('refuses unsafe relay %s before starting a client or changing state', (wsUrl) => {
    const host = makeHost();
    expect(() => host.start({ ...startRequest(), wsUrl })).toThrow();
    expect(clientOptions).toBeNull();
    expect(states).toEqual([]);
  });

  it('reconnects with the rotated credential instead of the consumed one', () => {
    vi.useFakeTimers();
    const host = makeHost();
    try {
      host.start(startRequest());
      const first = clientOptions!;
      first.onEvent({
        type: 'registered',
        pairToken: 'b'.repeat(64),
        expiresAt: 1234,
        peerConnected: false,
      });
      first.onEvent({ type: 'close' });
      vi.advanceTimersByTime(1000);
      expect(clientOptions).not.toBe(first);
      expect(clientOptions?.pairToken).toBe('b'.repeat(64));
    } finally {
      host.stop();
      vi.useRealTimers();
    }
  });

  it('registers as the desktop and hands the QR payload to main, never to the page', () => {
    const host = makeHost();
    const state = host.start(startRequest());

    expect(state).toMatchObject({ status: 'waiting', pairingCode: CODE });
    expect(pairings.at(-1)?.qrPayload).toMatch(new RegExp(`^agiw3:${CODE}:[0-9a-f]{64}$`));
    for (const published of states) {
      expect(JSON.stringify(published)).not.toContain(presentedSecret());
    }
    expect(clientOptions).toMatchObject({
      code: CODE,
      role: 'desktop',
      pairToken: 'desktop-token',
      metadata: { deviceName: 'Studio Mac', version: '1.8.0' },
    });
    expect(JSON.stringify(clientOptions?.metadata)).not.toContain(presentedSecret());
  });

  it('publishes the QR payload in state and asks before taking the scanning phone when the surface has no pairing window', async () => {
    const host = createRemoteControlHost({
      code,
      confirmPhone,
      deviceName: () => 'Studio Mac',
      appVersion: () => '1.8.0',
      createSocket: () => {
        throw new Error('the fake client never opens a socket');
      },
      onStateChanged: (state) => states.push(state),
      createClient: (options) => {
        clientOptions = options;
        return { sendSignal: () => true, close };
      },
    });
    const state = host.start(startRequest());
    expect(state.qrPayload).toMatch(new RegExp(`^agiw3:${CODE}:[0-9a-f]{64}$`));

    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: 'Pixel' },
    });
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'Pixel' });
    expect(confirmPhone).toHaveBeenCalledWith({ name: 'Pixel', pairingCode: CODE });

    host.stop();
    expect(states.at(-1)).toMatchObject({ status: 'idle', qrPayload: null });
  });

  it('refuses a relay address that is not a WebSocket', () => {
    const host = makeHost();
    expect(() => host.start({ ...startRequest(), wsUrl: 'https://relay.example' })).toThrow();
    expect(clientOptions).toBeNull();
  });

  // The page chooses nothing about where the phone's half of the session goes.
  it('refuses a relay the product is not configured for, and an unencrypted one', () => {
    const host = makeHost(false, isAllowedRelayUrl);
    for (const wsUrl of [
      'wss://relay.example/ws',
      'wss://agiworkforce-signaling.fly.dev.example/ws',
      'wss://user:pass@agiworkforce-signaling.fly.dev/ws',
      'ws://agiworkforce-signaling.fly.dev/ws',
      'ws://localhost:4000/ws',
    ]) {
      expect(() => host.start({ ...startRequest(), wsUrl }), wsUrl).toThrow(/relay/u);
    }
    expect(clientOptions).toBeNull();
    expect(pairings).toEqual([]);
  });

  it('accepts the configured relay and the first-party domain', () => {
    for (const wsUrl of [RELAY, 'wss://signaling.agiworkforce.com/ws']) {
      clientOptions = null;
      makeHost(false, isAllowedRelayUrl).start({ ...startRequest(), wsUrl });
      expect(clientOptions, wsUrl).toMatchObject({ wsUrl });
    }
  });

  it('asks the user before the phone gets a session, naming it and the code', async () => {
    let answer: (allowed: boolean) => void = () => undefined;
    confirmPhone.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const host = makeHost();
    host.start(startRequest());
    const secret = presentedSecret();
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: '\u202eenohP\u0000 Pixel\n' },
    });
    await flush();

    expect(confirmPhone).toHaveBeenCalledWith({ name: 'enohP Pixel', pairingCode: CODE });
    expect(pairings.at(-1)).toBeNull();
    expect(host.state().status).toBe('waiting');

    const phone = createDispatchSession(deriveDispatchKey(CODE, SALT, secret));
    clientOptions?.onEvent({
      type: 'signal',
      from: 'mobile',
      kind: 'control',
      payload: signDispatchEnvelope(phone, 'code.sessions.list', {
        action: 'code.sessions.list',
        version: 1,
        requestId: 'early',
        sentAt: new Date().toISOString(),
      }),
    });
    await flush();
    expect(signals).toEqual([]);
    expect(code.listSessions).not.toHaveBeenCalled();

    // The phone app signs its first request as it attaches, which is now.
    // It is not answered, but it does show the phone holds the scanned
    // secret, so the list goes out when the user allows it, not a retry later.
    answer(true);
    await flush();
    expect(host.state()).toMatchObject({
      status: 'connected',
      phoneName: 'enohP Pixel',
      reconnectable: true,
    });
    expect(signals.map((signal) => signal.payload['action'])).toEqual(['code.sessions']);
    for (const signal of signals) {
      expect(verifyDispatchEnvelope(phone, signal.payload['data'])).toMatchObject({ ok: true });
    }
  });

  it('serves nothing on being allowed to a peer whose message during the question was not signed with the scanned secret', async () => {
    let answer: (allowed: boolean) => void = () => undefined;
    confirmPhone.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    const host = makeHost();
    host.start(startRequest());
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: 'Pixel' },
    });
    await flush();
    await signAsPhone('00'.repeat(32), SALT, 'code.sessions.list');

    answer(true);
    await flush();

    expect(host.state()).toMatchObject({ status: 'connected', reconnectable: false });
    expect(signals).toEqual([]);
    expect(code.listSessions).not.toHaveBeenCalled();
  });

  it('ends the session when the user does not allow the phone, and serves it nothing', async () => {
    confirmPhone.mockResolvedValueOnce(false);
    const host = makeHost();
    host.start(startRequest());
    const secret = presentedSecret();
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: 'Not mine' },
    });
    await flush();

    expect(host.state().status).toBe('idle');
    expect(close).toHaveBeenCalled();
    expect(states.some((state) => state.status === 'connected')).toBe(false);

    const phone = createDispatchSession(deriveDispatchKey(CODE, SALT, secret));
    clientOptions?.onEvent({
      type: 'signal',
      from: 'mobile',
      kind: 'control',
      payload: signDispatchEnvelope(phone, 'heartbeat', { action: 'heartbeat' }),
    });
    await flush();
    expect(signals).toEqual([]);
    expect(code.listSessions).not.toHaveBeenCalled();
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
    host.start(startRequest());
    const secret = presentedSecret();
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: 'Pixel' },
    });
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'Pixel' });

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

    expect(host.stop()).toMatchObject({ status: 'idle', pairingCode: null });
    expect(pairings.at(-1)).toBeNull();
    expect(close).toHaveBeenCalled();
  });
  it('shows the phone name without control or direction-override characters', async () => {
    const host = makeHost();
    host.start(startRequest());
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: ' Pix\u202eel\u0007\u2066 ' },
    });
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'Pixel' });

    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: SALT, deviceName: '\u202e\u0000' },
    });
    await flush();
    expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: null });
  });
  it('returns to waiting when the phone goes away, and forgets its session', async () => {
    const host = makeHost();
    host.start(startRequest());
    const secret = presentedSecret();
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
    host.start(startRequest());
    const secret = presentedSecret();
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

  it('lets the allowed phone reconnect without asking again, for this session only', async () => {
    const host = makeHost();
    host.start(startRequest());
    const phone = { dispatchSalt: SALT, deviceType: 'mobile', app: 'agiworkforce-mobile' };
    clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ status: 'connected', reconnectable: false });
    await signAsPhone(presentedSecret(), SALT);
    expect(states.at(-1)).toMatchObject({ status: 'connected', reconnectable: true });

    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
    expect(states.at(-1)).toMatchObject({ status: 'waiting', reconnectable: true });
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { ...phone, dispatchSalt: '0f1e2d3c4b5a6978' },
    });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ status: 'connected' });

    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { ...phone, deviceName: 'Another phone' },
    });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(2);

    host.stop();
    expect(states.at(-1)).toMatchObject({ status: 'idle', reconnectable: false });
    host.start(startRequest());
    clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(3);
  });

  // What one phone left queued is its own. The next phone to be allowed on
  // this pairing code must not have it sent as a turn the moment it attaches.
  it('never starts a turn for one phone from a message another phone queued', async () => {
    const running = {
      transcript: {
        session: {
          id: 'thread-1',
          rootId: 'root-1',
          title: 'Fix retry backoff',
          cwd: '/work/api',
          model: null,
          provider: null,
          trustMode: 'unknown',
          status: 'running',
          createdAt: '2026-09-17T12:00:00.000Z',
          updatedAt: '2026-09-17T12:00:00.000Z',
          origin: 'desktop',
        },
        messages: [],
        truncated: false,
        activeTurn: null,
      },
      branch: 'main',
      fileChanges: [],
      activeTurn: { turnId: 'turn-1', partialResponse: '', pendingApprovals: [] },
    };
    const idle = { ...running, activeTurn: null };
    const build = { deviceType: 'mobile', app: 'agiworkforce-mobile' };
    const first = { ...build, dispatchSalt: SALT, installationId: 'a'.repeat(64) };
    const second = { ...build, dispatchSalt: '0f1e2d3c4b5a6978', installationId: 'b'.repeat(64) };
    const host = makeHost();
    host.start(startRequest());
    const secret = presentedSecret();
    let sentRequests = 0;
    const control = async (salt: string, action: string, extra: Record<string, unknown>) => {
      sentRequests += 1;
      const phone = createDispatchSession(deriveDispatchKey(CODE, salt, secret));
      clientOptions?.onEvent({
        type: 'signal',
        from: 'mobile',
        kind: 'control',
        payload: {
          action,
          data: signDispatchEnvelope(phone, action, {
            action,
            version: 1,
            requestId: `req-${sentRequests}`,
            sentAt: new Date().toISOString(),
            rootId: 'root-1',
            threadId: 'thread-1',
            ...extra,
          }),
        },
      });
      await flush();
      await flush();
    };

    code.readActivity.mockResolvedValue(running);
    clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: first });
    await flush();
    await control(first.dispatchSalt, 'code.session.attach', {});
    await control(first.dispatchSalt, 'code.session.steer', { text: 'push to main' });
    expect(code.startTurn).not.toHaveBeenCalled();

    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
    code.readActivity.mockResolvedValue(idle);
    clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: second });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(2);
    await control(second.dispatchSalt, 'code.session.attach', {});

    expect(code.readActivity).toHaveBeenCalledTimes(2);
    expect(code.startTurn).not.toHaveBeenCalled();
  });

  it('tells two phones of the same build apart by their installation ids', async () => {
    const host = makeHost();
    host.start(startRequest());
    const build = { deviceType: 'mobile', app: 'agiworkforce-mobile' };
    const first = { ...build, dispatchSalt: SALT, installationId: 'a'.repeat(64) };
    clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: first });
    await flush();
    await signAsPhone(presentedSecret(), SALT);
    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });

    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { ...first, dispatchSalt: '0f1e2d3c4b5a6978' },
    });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(1);
    clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });

    clientOptions?.onEvent({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { ...first, installationId: 'b'.repeat(64) },
    });
    await flush();
    expect(confirmPhone).toHaveBeenCalledTimes(2);
  });

  // What a peer says it is reaches this app through the relay, unsigned. The
  // relay, or anyone holding only the pairing code, can say anything there;
  // what they cannot do is sign with the secret the phone scanned.
  describe('a peer that has signed nothing', () => {
    const phone = {
      dispatchSalt: SALT,
      deviceType: 'mobile',
      app: 'agiworkforce-mobile',
      installationId: 'a'.repeat(64),
      deviceName: 'Pixel',
    };
    const turnStarted = { type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' } as const;

    it('is sent nothing about this Mac, even once the user has allowed it', async () => {
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
      await flush();
      host.handleSessionEvent('root-1', turnStarted);
      await flush();

      expect(confirmPhone).toHaveBeenCalledTimes(1);
      expect(signals).toEqual([]);
      expect(code.listSessions).not.toHaveBeenCalled();
    });

    it('gets the session list once its first signed message is in, whatever that message was', async () => {
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
      await flush();

      const { phone: signer } = await signAsPhone(presentedSecret(), SALT);

      expect(signals.map((signal) => signal.payload['action'])).toEqual([
        'heartbeat_ack',
        'code.sessions',
      ]);
      for (const signal of signals) {
        expect(verifyDispatchEnvelope(signer, signal.payload['data'])).toMatchObject({ ok: true });
      }
    });

    it('is asked about again when it comes back, because being allowed is not having proved anything', async () => {
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
      await flush();
      expect(states.at(-1)).toMatchObject({ reconnectable: false });
      clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });

      clientOptions?.onEvent({
        type: 'peer_ready',
        role: 'mobile',
        metadata: { ...phone, dispatchSalt: '0f1e2d3c4b5a6978' },
      });
      await flush();

      expect(confirmPhone).toHaveBeenCalledTimes(2);
    });

    it('that names the phone already allowed gets its place and nothing else', async () => {
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
      await flush();
      await signAsPhone(presentedSecret(), SALT);
      clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
      signals = [];
      code.listSessions.mockClear();

      clientOptions?.onEvent({
        type: 'peer_ready',
        role: 'mobile',
        metadata: { ...phone, dispatchSalt: '0f1e2d3c4b5a6978', deviceName: 'Your own iPhone' },
      });
      await flush();
      host.handleSessionEvent('root-1', turnStarted);
      await flush();

      expect(confirmPhone).toHaveBeenCalledTimes(1);
      expect(states.at(-1)).toMatchObject({ status: 'connected', phoneName: 'Pixel' });
      expect(signals).toEqual([]);
      expect(code.listSessions).not.toHaveBeenCalled();
    });

    // A peer picks its salt, and the same salt gives the same key. Coming
    // back on it must not make a message that was taken once good again.
    it('cannot prove itself by sending back what the phone signed before', async () => {
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
      await flush();
      const { envelope } = await signAsPhone(presentedSecret(), SALT);
      clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
      signals = [];
      code.listSessions.mockClear();

      clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
      await flush();
      clientOptions?.onEvent({
        type: 'signal',
        from: 'mobile',
        kind: 'control',
        payload: envelope,
      });
      await flush();

      expect(signals).toEqual([]);
      expect(code.listSessions).not.toHaveBeenCalled();
    });

    it('cannot do so either once the first connection is old, while the message itself is still in date', async () => {
      const clock = vi.spyOn(Date, 'now');
      const startedAt = 1_800_000_000_000;
      try {
        clock.mockReturnValue(startedAt);
        const host = makeHost();
        host.start(startRequest());
        clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
        await flush();
        clock.mockReturnValue(startedAt + 100_000);
        const { envelope } = await signAsPhone(presentedSecret(), SALT);
        clientOptions?.onEvent({ type: 'peer_left', role: 'mobile' });
        signals = [];
        code.listSessions.mockClear();

        clock.mockReturnValue(startedAt + 110_000);
        clientOptions?.onEvent({ type: 'peer_ready', role: 'mobile', metadata: phone });
        await flush();
        clientOptions?.onEvent({
          type: 'signal',
          from: 'mobile',
          kind: 'control',
          payload: envelope,
        });
        await flush();

        expect(signals).toEqual([]);
        expect(code.listSessions).not.toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
    });

    it('is refused a salt longer than a phone sends', () => {
      const host = makeHost();
      host.start(startRequest());
      clientOptions?.onEvent({
        type: 'peer_ready',
        role: 'mobile',
        metadata: { ...phone, dispatchSalt: 'a'.repeat(129) },
      });

      expect(states.at(-1)).toMatchObject({ status: 'error' });
      expect(confirmPhone).not.toHaveBeenCalled();
    });
  });

  it('ignores a control still signed with the key the last session used', async () => {
    const host = makeHost();
    host.start(startRequest());
    const secret = presentedSecret();
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
      expect(states.at(-1), type).toMatchObject({ status: 'idle', pairingCode: null });
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
