import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockSignalingClient {
    static instances: MockSignalingClient[] = [];

    readonly close = vi.fn();
    readonly sendSignal = vi.fn();

    constructor(
      readonly options: {
        code: string;
        pairToken: string;
        metadata: Record<string, unknown>;
        onEvent: (event: unknown) => void;
      },
    ) {
      MockSignalingClient.instances.push(this);
    }

    emit(event: unknown): void {
      this.options.onEvent(event);
    }
  }

  class MockPeerConnection {
    static instances: MockPeerConnection[] = [];

    connectionState: RTCPeerConnectionState = 'new';
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    readonly close = vi.fn();
    readonly addTrack = vi.fn();
    readonly addIceCandidate = vi.fn().mockResolvedValue(undefined);
    readonly setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    readonly createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'desktop-offer' });
    readonly setLocalDescription = vi.fn().mockResolvedValue(undefined);

    constructor() {
      MockPeerConnection.instances.push(this);
    }

    createDataChannel() {
      return { readyState: 'open', close: vi.fn(), send: vi.fn(), onmessage: null };
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
import { MOBILE_DISPATCH_UPDATE_REQUIRED, useConnectionStore } from '../connectionStore';

const RELAY_QR_DATA = 'agi://pair/PAIRCODEA123';

function pairingResponse(code: string): Response {
  return new Response(
    JSON.stringify({
      code,
      expiresAt: Date.now() + 300_000,
      expiresIn: 300,
      qrData: RELAY_QR_DATA,
      signaling: {
        httpUrl: 'https://signal.example.test',
        wsUrl: 'wss://signal.example.test/ws',
      },
      pairTokens: { desktop: `desktop-${code}`, mobile: `mobile-${code}` },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

async function requestPairing(code: string): Promise<void> {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      getUserMedia: vi.fn(),
    },
  });
  mocks.accountBoundCloudFetch.mockResolvedValueOnce(pairingResponse(code));
  await useConnectionStore.getState().requestPairingCode();
}

// The phone caps its manual-entry field at this many characters
// (apps/mobile/src/features/companion/components/QRScanner.tsx), so a longer
// pairing link is silently truncated when a camera-less user pastes it.
const MOBILE_MANUAL_ENTRY_MAX_LENGTH = 96;

function pairingSecretFrom(qrData: string): string {
  const segments = qrData.split(':');
  expect(segments).toHaveLength(3);
  expect(segments[0]).toBe('agiw3');
  return segments[2] as string;
}

describe('desktop pairing keeps the dispatch key material off the signaling relay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.MockSignalingClient.instances.length = 0;
    mocks.MockPeerConnection.instances.length = 0;
    vi.stubGlobal('RTCPeerConnection', mocks.MockPeerConnection);
    useConnectionStore.getState().stopSession();
    useAppModeStore.setState({ mode: 'cloud' });
    useAuthStore.setState({
      user: { id: 'account-1', email: 'account-1@example.test' },
      isAuthenticated: true,
      isLocalDeviceAccount: false,
      accessToken: 'token-account-1',
      cloudSessionEpoch: 1,
    });
    mocks.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer token-account-1' });
  });

  it('publishes a locally generated 32-byte secret in the QR payload instead of the relay one', async () => {
    await requestPairing('PAIRCODEA123');

    const qrData = useConnectionStore.getState().qrData;
    expect(qrData).not.toBe(RELAY_QR_DATA);
    expect(qrData).toMatch(/^agiw3:PAIRCODEA123:[0-9a-f]{64}$/);
  });

  it('keeps the payload short enough for the phone to accept it pasted, not truncated', async () => {
    await requestPairing('PAIRCODEA123');

    const qrData = useConnectionStore.getState().qrData as string;
    expect(qrData.length).toBeLessThanOrEqual(MOBILE_MANUAL_ENTRY_MAX_LENGTH);
  });

  it('leaves the relay-issued mobile pair token out of the optical payload', async () => {
    await requestPairing('PAIRCODEA123');

    expect(useConnectionStore.getState().qrData).not.toContain('mobile-PAIRCODEA123');
  });

  it('never sends the secret to the relay in the pairing request or the register frame', async () => {
    await requestPairing('PAIRCODEA123');

    const secret = pairingSecretFrom(useConnectionStore.getState().qrData as string);
    const [, init] = mocks.accountBoundCloudFetch.mock.calls[0] as [unknown, RequestInit];
    expect(String(init.body)).not.toContain(secret);

    const client = mocks.MockSignalingClient.instances[0];
    expect(client).toBeDefined();
    expect(JSON.stringify(client?.options.metadata)).not.toContain(secret);
    expect(client?.options.code).not.toContain(secret);
    expect(client?.options.pairToken).not.toContain(secret);
  });

  it('keys the dispatch session on that secret when the phone reports its salt', async () => {
    await requestPairing('PAIRCODEA123');
    const secret = pairingSecretFrom(useConnectionStore.getState().qrData as string);

    mocks.MockSignalingClient.instances[0]?.emit({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: 'salt-a', version: '1.3.0' },
    });

    await vi.waitFor(() => {
      expect(mocks.initDispatchSession).toHaveBeenCalledWith(
        'PAIRCODEA123',
        'salt-a',
        secret,
        '1.3.0',
      );
    });
  });

  it('mints a fresh secret for every pairing code', async () => {
    await requestPairing('PAIRCODEA123');
    const first = pairingSecretFrom(useConnectionStore.getState().qrData as string);

    await requestPairing('PAIRCODEB456');
    const second = pairingSecretFrom(useConnectionStore.getState().qrData as string);

    expect(second).not.toBe(first);
  });

  it('tells the user their phone is stale instead of dropping its frames in silence', async () => {
    await requestPairing('PAIRCODEA123');
    const client = mocks.MockSignalingClient.instances[0];
    client?.emit({
      type: 'peer_ready',
      role: 'mobile',
      metadata: { dispatchSalt: 'salt-a', version: '1.3.0' },
    });
    await vi.waitFor(() => {
      expect(mocks.MockPeerConnection.instances.length).toBeGreaterThan(0);
    });

    mocks.verifyInbound.mockResolvedValueOnce({ ok: false, reason: 'update_required' });
    client?.emit({
      type: 'signal',
      kind: 'control',
      payload: { action: 'heartbeat', payload: {}, ts: Date.now() },
    });

    await vi.waitFor(() => {
      expect(useConnectionStore.getState().error).toBe(MOBILE_DISPATCH_UPDATE_REQUIRED);
    });
  });
});
