import { waitFor } from '@testing-library/react-native';
import type { SignalingEvent } from '@agiworkforce/types';

const mockClaimManualPairingToken = jest.fn();
const mockClose = jest.fn();
let capturedOnEvent: ((event: SignalingEvent) => void) | null = null;

const mockSignalingClient = jest.fn().mockImplementation((options: unknown) => {
  capturedOnEvent = (options as { onEvent: (event: SignalingEvent) => void }).onEvent;
  return { sendSignal: jest.fn(), close: mockClose };
});

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
    createDataChannel: jest.fn(() => ({ close: jest.fn(), readyState: 'connecting' })),
    addEventListener: jest.fn(),
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

const PAST_WATCHDOG_MS = 30_000;

const PAIRING_SECRET = '9f'.repeat(32);

async function connectAndAwaitSignaling(code = `agiw3:ABCD EFGH IJKL:${PAIRING_SECRET}`) {
  useConnectionStore.getState().connect(code);
  await waitFor(() => {
    expect(mockSignalingClient).toHaveBeenCalled();
  });
}

describe('Connection store connect watchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    capturedOnEvent = null;
    useConnectionStore.getState().disconnect();
    mockClaimManualPairingToken.mockResolvedValue({
      code: 'ABCDEFGHIJKL',
      pairToken: 'a'.repeat(64),
      expiresAt: Date.now() + 300_000,
      wsUrl: 'wss://signaling.agiworkforce.com/ws',
    });
  });

  afterEach(() => {
    useConnectionStore.getState().disconnect();
    jest.useRealTimers();
  });

  it('fails a connecting session that never hears from the desktop peer', async () => {
    await connectAndAwaitSignaling();
    expect(useConnectionStore.getState().status).toBe('connecting');

    jest.advanceTimersByTime(PAST_WATCHDOG_MS);

    expect(useConnectionStore.getState()).toMatchObject({
      status: 'error',
      error: null,
      connectionQuality: 'disconnected',
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it('still fails when the signaling server registered us but no peer ever arrives', async () => {
    await connectAndAwaitSignaling();
    capturedOnEvent?.({
      type: 'registered',
      expiresAt: Date.now() + 300_000,
      peerConnected: false,
    } as SignalingEvent);
    expect(useConnectionStore.getState().status).toBe('connecting');

    jest.advanceTimersByTime(PAST_WATCHDOG_MS);

    expect(useConnectionStore.getState().status).toBe('error');
  });

  it('clears the watchdog once the desktop peer is ready', async () => {
    await connectAndAwaitSignaling();
    capturedOnEvent?.({
      type: 'peer_ready',
      metadata: { deviceName: 'Siddharthas-MBP' },
    } as SignalingEvent);
    expect(useConnectionStore.getState().status).toBe('connected');

    jest.advanceTimersByTime(PAST_WATCHDOG_MS);

    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('clears the watchdog when the user cancels a pending connect', async () => {
    await connectAndAwaitSignaling();
    useConnectionStore.getState().disconnect();
    expect(useConnectionStore.getState().status).toBe('disconnected');

    jest.advanceTimersByTime(PAST_WATCHDOG_MS);

    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('leaves a claim failure error message intact instead of overwriting it later', async () => {
    mockClaimManualPairingToken.mockRejectedValueOnce(
      new Error('That pairing code is invalid or expired. Generate a new code on Desktop.'),
    );

    useConnectionStore.getState().connect(`agiw3:ABCD-EFGH-IJKL:${PAIRING_SECRET}`);
    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });

    jest.advanceTimersByTime(PAST_WATCHDOG_MS);

    expect(useConnectionStore.getState().error).toContain('invalid or expired');
  });
});
