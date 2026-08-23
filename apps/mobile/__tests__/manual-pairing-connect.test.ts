import { waitFor } from '@testing-library/react-native';

const mockClaimManualPairingToken = jest.fn();
const mockSignalingClient = jest.fn().mockImplementation(() => ({
  sendSignal: jest.fn(),
  close: jest.fn(),
}));

jest.mock('@/services/secureFetch', () => ({ secureFetch: jest.fn() }));

jest.mock('@/services/manualPairing', () => ({
  ...jest.requireActual('@/services/manualPairing'),
  claimManualPairingToken: (...args: unknown[]) => mockClaimManualPairingToken(...args),
  PAIRING_UPDATE_REQUIRED_MESSAGE: 'update-required',
  PAIRING_SECRET_REQUIRED_MESSAGE: 'secret-required',
}));

jest.mock('@agiworkforce/utils/signaling', () => ({
  SignalingClient: function SignalingClient(...args: unknown[]) {
    return mockSignalingClient(...args);
  },
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
  })),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(16)),
  randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0' } },
}));

const mockDeriveDispatchSecret = jest.fn();

jest.mock('../lib/dispatchHmac', () => ({
  deriveDispatchSecret: (...args: unknown[]) => mockDeriveDispatchSecret(...args),
  signMessage: jest.fn(async () => ({ hmac: 'b'.repeat(64) })),
  verifyMessage: jest.fn(async () => ({ valid: true })),
}));

jest.mock('../lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/companionNotifications', () => ({
  notifyCompanionMessage: jest.fn(),
}));

import { useConnectionStore } from '../stores/connectionStore';

const PAIR_TOKEN = 'a'.repeat(64);
const PAIRING_SECRET = '9f'.repeat(32);
const V3_PAYLOAD = `agiw3:ABCD EFGH IJKL:${PAIRING_SECRET}`;

describe('Connection store manual pairing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConnectionStore.getState().disconnect();
    mockDeriveDispatchSecret.mockResolvedValue('b'.repeat(64));
    mockClaimManualPairingToken.mockResolvedValue({
      code: 'ABCDEFGHIJKL',
      pairToken: PAIR_TOKEN,
      expiresAt: Date.now() + 300_000,
      wsUrl: 'wss://signaling.agiworkforce.com/ws',
    });
  });

  it('claims a role token for the displayed code before WebSocket registration', async () => {
    useConnectionStore.getState().connect(`agiw3:ABCD EFGH IJKL:${PAIRING_SECRET}`);

    expect(useConnectionStore.getState()).toMatchObject({
      status: 'connecting',
      pairingCode: 'ABCDEFGHIJKL',
      pairToken: null,
    });

    await waitFor(() => {
      expect(mockSignalingClient).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ABCDEFGHIJKL',
          role: 'mobile',
          pairToken: 'a'.repeat(64),
          wsUrl: 'wss://signaling.agiworkforce.com/ws',
        }),
      );
    });
    expect(mockClaimManualPairingToken).toHaveBeenCalledWith('ABCDEFGHIJKL');
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'connecting',
      pairingCode: 'ABCDEFGHIJKL',
      pairToken: 'a'.repeat(64),
    });
  });

  it('surfaces a failed claim without opening a WebSocket', async () => {
    mockClaimManualPairingToken.mockRejectedValueOnce(
      new Error('That pairing code is invalid or expired. Generate a new code on Desktop.'),
    );

    useConnectionStore.getState().connect(`agiw3:ABCD-EFGH-IJKL:${PAIRING_SECRET}`);

    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });
    expect(useConnectionStore.getState().error).toContain('invalid or expired');
    expect(mockSignalingClient).not.toHaveBeenCalled();
  });
});

describe('Connection store dispatch key material', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConnectionStore.getState().disconnect();
    mockDeriveDispatchSecret.mockResolvedValue('b'.repeat(64));
    mockClaimManualPairingToken.mockResolvedValue({
      code: 'ABCDEFGHIJKL',
      pairToken: PAIR_TOKEN,
      expiresAt: Date.now() + 300_000,
      wsUrl: 'wss://signaling.agiworkforce.com/ws',
    });
  });

  it('keys the session on the scanned out-of-band secret, never on relay-visible inputs alone', async () => {
    useConnectionStore.getState().connect(V3_PAYLOAD);

    await waitFor(() => {
      expect(mockDeriveDispatchSecret).toHaveBeenCalled();
    });
    const [code, salt, pairingSecret] = mockDeriveDispatchSecret.mock.calls[0] as string[];
    expect(code).toBe('ABCDEFGHIJKL');
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(pairingSecret).toBe(PAIRING_SECRET);

    const [signalingOptions] = mockSignalingClient.mock.calls[0] as [
      { metadata: Record<string, unknown> },
    ];
    expect(JSON.stringify(signalingOptions.metadata)).not.toContain(PAIRING_SECRET);
  });

  it('refuses a legacy desktop payload with an update prompt instead of pairing anyway', async () => {
    useConnectionStore.getState().connect(`agiw:ABCDEFGHIJKL:${PAIR_TOKEN}`);

    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });
    expect(useConnectionStore.getState().error).toBe('update-required');
    expect(mockDeriveDispatchSecret).not.toHaveBeenCalled();
    expect(mockSignalingClient).not.toHaveBeenCalled();
    expect(mockClaimManualPairingToken).not.toHaveBeenCalled();
  });

  it('refuses a bare typed code that carries no secret', async () => {
    useConnectionStore.getState().connect('ABCD EFGH IJKL');

    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });
    expect(useConnectionStore.getState().error).toBe('secret-required');
    expect(mockSignalingClient).not.toHaveBeenCalled();
  });

  it('reuses the scanned secret when a reconnect passes only the pairing code', async () => {
    useConnectionStore.getState().connect(V3_PAYLOAD);
    await waitFor(() => {
      expect(mockDeriveDispatchSecret).toHaveBeenCalledTimes(1);
    });

    useConnectionStore.getState().connect('ABCDEFGHIJKL');
    await waitFor(() => {
      expect(mockDeriveDispatchSecret).toHaveBeenCalledTimes(2);
    });
    expect(mockDeriveDispatchSecret.mock.calls[1]?.[2]).toBe(PAIRING_SECRET);
  });

  it('forgets the secret on disconnect so a later bare code cannot revive the session', async () => {
    useConnectionStore.getState().connect(V3_PAYLOAD);
    await waitFor(() => {
      expect(mockDeriveDispatchSecret).toHaveBeenCalledTimes(1);
    });

    useConnectionStore.getState().disconnect();
    useConnectionStore.getState().connect('ABCDEFGHIJKL');

    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });
    expect(mockDeriveDispatchSecret).toHaveBeenCalledTimes(1);
  });
});
