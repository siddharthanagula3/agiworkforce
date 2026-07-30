import { waitFor } from '@testing-library/react-native';

const mockClaimManualPairingToken = jest.fn();
const mockSignalingClient = jest.fn().mockImplementation(() => ({
  sendSignal: jest.fn(),
  close: jest.fn(),
}));

jest.mock('@/services/manualPairing', () => ({
  claimManualPairingToken: (...args: unknown[]) => mockClaimManualPairingToken(...args),
  normalizePairingInput: (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('agiw:')) return trimmed.replace(/[ -]/g, '');
    const [code = '', token] = trimmed.slice(5).split(':');
    return `agiw:${code.replace(/[ -]/g, '')}${token ? `:${token}` : ''}`;
  },
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

jest.mock('../lib/dispatchHmac', () => ({
  deriveDispatchSecret: jest.fn(async () => 'b'.repeat(64)),
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

describe('Connection store manual pairing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConnectionStore.getState().disconnect();
    mockClaimManualPairingToken.mockResolvedValue({
      code: 'ABCDEFGHIJKL',
      pairToken: 'a'.repeat(64),
      expiresAt: Date.now() + 300_000,
      wsUrl: 'wss://signaling.agiworkforce.com/ws',
    });
  });

  it('claims a role token for the displayed code before WebSocket registration', async () => {
    useConnectionStore.getState().connect('ABCD EFGH IJKL');

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

    useConnectionStore.getState().connect('ABCD-EFGH-IJKL');

    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });
    expect(useConnectionStore.getState().error).toContain('invalid or expired');
    expect(mockSignalingClient).not.toHaveBeenCalled();
  });
});
