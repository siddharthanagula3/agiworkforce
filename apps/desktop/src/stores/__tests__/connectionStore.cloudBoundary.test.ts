import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockSignalingClient {
    static instances: MockSignalingClient[] = [];

    readonly close = vi.fn();
    readonly sendSignal = vi.fn();

    constructor(
      readonly options: {
        code: string;
        onEvent: (event: unknown) => void;
      },
    ) {
      MockSignalingClient.instances.push(this);
    }

    emit(event: unknown): void {
      this.options.onEvent(event);
    }
  }

  class MockDataChannel {
    readyState: RTCDataChannelState = 'open';
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    close = vi.fn();
    send = vi.fn();
  }

  class MockPeerConnection {
    static instances: MockPeerConnection[] = [];

    connectionState: RTCPeerConnectionState = 'new';
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    readonly channel = new MockDataChannel();
    readonly close = vi.fn();
    readonly addTrack = vi.fn();
    readonly addIceCandidate = vi.fn().mockResolvedValue(undefined);
    readonly setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    readonly createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'desktop-offer' });
    readonly setLocalDescription = vi.fn().mockResolvedValue(undefined);

    constructor() {
      MockPeerConnection.instances.push(this);
    }

    createDataChannel(): MockDataChannel {
      return this.channel;
    }
  }

  return {
    MockPeerConnection,
    MockSignalingClient,
    accountBoundCloudFetch: vi.fn(),
    getAuthHeaders: vi.fn(),
    initDispatchSession: vi.fn().mockResolvedValue('key'),
    resetDispatchSession: vi.fn().mockResolvedValue(undefined),
    signOutbound: vi.fn().mockResolvedValue('{}'),
    verifyInbound: vi.fn().mockResolvedValue({ ok: true, outcome: 'signed' }),
  };
});

vi.mock('@agiworkforce/utils', () => ({ SignalingClient: mocks.MockSignalingClient }));

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

vi.mock('../../api/cloudApi', () => ({
  accountBoundCloudFetch: mocks.accountBoundCloudFetch,
  getAuthHeaders: mocks.getAuthHeaders,
}));

vi.mock('../../services/dispatch', () => ({
  extractDispatchSalt: (metadata: Record<string, unknown> | null | undefined) =>
    typeof metadata?.['dispatchSalt'] === 'string'
      ? { salt: metadata['dispatchSalt'], version: metadata['version'] }
      : null,
  initDispatchSession: mocks.initDispatchSession,
  isDispatchSessionActive: vi.fn(() => true),
  resetDispatchSession: mocks.resetDispatchSession,
  signOutbound: mocks.signOutbound,
  verifyInbound: mocks.verifyInbound,
}));

import { useAppModeStore } from '../appModeStore';
import { useAuthStore } from '../auth';
import { sendCompanionControl, useConnectionStore } from '../connectionStore';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function pairingResponse(code: string): Response {
  return new Response(
    JSON.stringify({
      code,
      expiresAt: Date.now() + 300_000,
      expiresIn: 300,
      qrData: `agi://pair/${code}`,
      signaling: {
        httpUrl: 'https://signal.example.test',
        wsUrl: 'wss://signal.example.test/ws',
      },
      pairTokens: {
        desktop: `desktop-${code}`,
        mobile: `mobile-${code}`,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function installCloudSession(accountId: string, epoch: number): void {
  useAppModeStore.setState({ mode: 'cloud' });
  useAuthStore.setState({
    user: { id: accountId, email: `${accountId}@example.test` },
    isAuthenticated: true,
    isLocalDeviceAccount: false,
    accessToken: `token-${accountId}`,
    cloudSessionEpoch: epoch,
  });
}

async function waitForPairingClient(index: number) {
  await vi.waitFor(() => {
    expect(mocks.MockSignalingClient.instances).toHaveLength(index + 1);
  });
  return mocks.MockSignalingClient.instances[index]!;
}

async function establishActiveSession(code = 'PAIRCODEA123'): Promise<{
  client: InstanceType<typeof mocks.MockSignalingClient>;
  peer: InstanceType<typeof mocks.MockPeerConnection>;
  track: { stop: ReturnType<typeof vi.fn> };
}> {
  const track = { stop: vi.fn() };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }),
      getUserMedia: vi.fn(),
    },
  });
  mocks.accountBoundCloudFetch.mockResolvedValueOnce(pairingResponse(code));

  await useConnectionStore.getState().requestPairingCode();
  const client = await waitForPairingClient(0);
  client.emit({
    type: 'peer_ready',
    role: 'mobile',
    metadata: { dispatchSalt: 'salt-a', version: '1.3.0' },
  });
  await vi.waitFor(() => expect(mocks.MockPeerConnection.instances).toHaveLength(1));

  return { client, peer: mocks.MockPeerConnection.instances[0]!, track };
}

describe('Mobile Companion Managed Cloud boundary lifecycle', () => {
  beforeEach(() => {
    useConnectionStore.getState().stopSession();
    vi.clearAllMocks();
    mocks.MockSignalingClient.instances.length = 0;
    mocks.MockPeerConnection.instances.length = 0;
    mocks.getAuthHeaders.mockImplementation(async (accountId: string) => ({
      Authorization: `Bearer refreshed-${accountId}`,
    }));
    vi.stubGlobal('RTCPeerConnection', mocks.MockPeerConnection);
    vi.stubGlobal('RTCSessionDescription', class RTCSessionDescription {});
    vi.stubGlobal('RTCIceCandidate', class RTCIceCandidate {});
    installCloudSession('account-a', 10);
  });

  it('uses one authenticated account-bound request context for pairing initiation', async () => {
    mocks.accountBoundCloudFetch.mockResolvedValueOnce(pairingResponse('PAIRCODEA123'));

    await useConnectionStore.getState().requestPairingCode();

    expect(mocks.getAuthHeaders).toHaveBeenCalledWith('account-a');
    expect(mocks.accountBoundCloudFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/pair\/initiate$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer refreshed-account-a',
        }),
      }),
      'account-a',
      expect.any(Function),
    );
    expect(useConnectionStore.getState().pairingCode).toBe('PAIRCODEA123');
  });

  it.each([
    ['Managed to Local', () => useAppModeStore.setState({ mode: 'local' })],
    [
      'sign-out',
      () =>
        useAuthStore.setState((state) => ({
          isAuthenticated: false,
          accessToken: null,
          cloudSessionEpoch: state.cloudSessionEpoch + 1,
        })),
    ],
    [
      'account switch',
      () =>
        useAuthStore.setState((state) => ({
          user: { id: 'account-b', email: 'b@example.test' },
          isAuthenticated: true,
          isLocalDeviceAccount: false,
          accessToken: 'token-account-b',
          cloudSessionEpoch: state.cloudSessionEpoch + 1,
        })),
    ],
    [
      'same-account session epoch change',
      () =>
        useAuthStore.setState((state) => ({
          cloudSessionEpoch: state.cloudSessionEpoch + 1,
        })),
    ],
  ])('synchronously closes every A-owned resource on %s', async (_label, transition) => {
    const { client, peer, track } = await establishActiveSession();

    transition();

    expect(client.close).toHaveBeenCalledOnce();
    expect(peer.channel.close).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mocks.resetDispatchSession).toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'idle',
      pairingCode: null,
      stream: null,
      peerConnected: false,
    });
  });

  it('keeps the active companion when only the same-account bearer rotates', async () => {
    const { client, peer, track } = await establishActiveSession();
    mocks.resetDispatchSession.mockClear();

    useAuthStore.setState({ accessToken: 'rotated-token-account-a' });

    expect(client.close).not.toHaveBeenCalled();
    expect(peer.channel.close).not.toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(mocks.resetDispatchSession).not.toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'pairing',
      pairingCode: 'PAIRCODEA123',
      peerConnected: true,
    });
  });

  it('ignores a deferred account-A initiate response after account B replaces it', async () => {
    const pendingResponse = deferred<Response>();
    mocks.accountBoundCloudFetch.mockReturnValueOnce(pendingResponse.promise);

    const accountARequest = useConnectionStore.getState().requestPairingCode();
    await vi.waitFor(() => expect(mocks.accountBoundCloudFetch).toHaveBeenCalledOnce());
    const accountARequestInit = mocks.accountBoundCloudFetch.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;

    installCloudSession('account-b', 11);
    expect(accountARequestInit?.signal?.aborted).toBe(true);
    pendingResponse.resolve(pairingResponse('STALECODEA12'));
    await accountARequest;

    expect(mocks.MockSignalingClient.instances).toHaveLength(0);
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'idle',
      pairingCode: null,
      peerConnected: false,
    });
  });

  it('ignores old A signaling events after B has installed its own pairing', async () => {
    mocks.accountBoundCloudFetch.mockResolvedValueOnce(pairingResponse('PAIRCODEA123'));
    await useConnectionStore.getState().requestPairingCode();
    const accountAClient = await waitForPairingClient(0);

    installCloudSession('account-b', 11);
    mocks.accountBoundCloudFetch.mockResolvedValueOnce(pairingResponse('PAIRCODEB123'));
    await useConnectionStore.getState().requestPairingCode();
    await waitForPairingClient(1);

    accountAClient.emit({ type: 'registered', expiresAt: 1, peerConnected: true });
    accountAClient.emit({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: 'stale-salt', version: '1.3.0' },
    });
    await Promise.resolve();

    expect(useConnectionStore.getState()).toMatchObject({
      status: 'waiting',
      pairingCode: 'PAIRCODEB123',
      peerConnected: false,
    });
    expect(mocks.initDispatchSession).not.toHaveBeenCalled();
    expect(mocks.MockPeerConnection.instances).toHaveLength(0);
  });

  it('discards a display stream acquired after A was replaced', async () => {
    let resolveDisplayStream!: (stream: { getTracks: () => Array<{ stop(): void }> }) => void;
    const pendingDisplayStream = new Promise<{
      getTracks: () => Array<{ stop(): void }>;
    }>((resolve) => {
      resolveDisplayStream = resolve;
    });
    const track = { stop: vi.fn() };
    const getDisplayMedia = vi.fn().mockReturnValue(pendingDisplayStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia, getUserMedia: vi.fn() },
    });
    mocks.accountBoundCloudFetch.mockResolvedValueOnce(pairingResponse('PAIRCODEA123'));
    await useConnectionStore.getState().requestPairingCode();
    const accountAClient = await waitForPairingClient(0);

    accountAClient.emit({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: 'salt-a', version: '1.3.0' },
    });
    await vi.waitFor(() => expect(getDisplayMedia).toHaveBeenCalledOnce());

    installCloudSession('account-b', 11);
    resolveDisplayStream({ getTracks: () => [track] });

    await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(mocks.MockPeerConnection.instances).toHaveLength(0);
    expect(useConnectionStore.getState()).toMatchObject({ status: 'idle', stream: null });
  });

  it('does not dispatch a deferred control verified for a peer that has left', async () => {
    const { client, peer } = await establishActiveSession();
    const pendingVerification = deferred<{ ok: true; outcome: 'signed' }>();
    mocks.verifyInbound.mockReturnValueOnce(pendingVerification.promise);
    const onControl = vi.fn();
    window.addEventListener('mobile-companion:control', onControl);

    try {
      peer.channel.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            hmac: 'signed-for-peer-one',
            payload: {
              action: 'dispatch.task.create',
              requestId: 'stale-peer-request',
            },
          }),
        }),
      );
      await vi.waitFor(() => expect(mocks.verifyInbound).toHaveBeenCalledOnce());

      client.emit({ type: 'peer_left', role: 'mobile' });
      expect(peer.channel.close).toHaveBeenCalledOnce();
      expect(peer.close).toHaveBeenCalledOnce();

      client.emit({
        type: 'peer_ready',
        role: 'mobile',
        metadata: { dispatchSalt: 'salt-b', version: '1.3.0' },
      });
      await vi.waitFor(() => expect(mocks.MockPeerConnection.instances).toHaveLength(2));

      pendingVerification.resolve({ ok: true, outcome: 'signed' });
      await pendingVerification.promise;
      await Promise.resolve();

      expect(onControl).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('mobile-companion:control', onControl);
    }
  });

  it('does not send a deferred signature through a replacement peer transport', async () => {
    const { client, peer } = await establishActiveSession();
    const pendingSignature = deferred<string>();
    mocks.signOutbound.mockReturnValueOnce(pendingSignature.promise);

    const staleSend = sendCompanionControl('dispatch.task.status', {
      requestId: 'peer-one-request',
      status: 'running',
    });
    await vi.waitFor(() => expect(mocks.signOutbound).toHaveBeenCalledOnce());

    client.emit({ type: 'peer_left', role: 'mobile' });
    client.emit({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: 'salt-b', version: '1.3.0' },
    });
    await vi.waitFor(() => expect(mocks.MockPeerConnection.instances).toHaveLength(2));
    const replacementPeer = mocks.MockPeerConnection.instances[1]!;

    pendingSignature.resolve('{"hmac":"signed-for-peer-one"}');
    await expect(staleSend).resolves.toBe(false);

    expect(peer.channel.send).not.toHaveBeenCalled();
    expect(replacementPeer.channel.send).not.toHaveBeenCalled();

    await expect(
      sendCompanionControl('dispatch.task.status', {
        requestId: 'peer-two-request',
        status: 'running',
      }),
    ).resolves.toBe(true);
    expect(replacementPeer.channel.send).toHaveBeenCalledOnce();
  });
});
