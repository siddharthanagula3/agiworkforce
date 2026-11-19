import { waitFor } from '@testing-library/react-native';
import type { SignalingEvent } from '@agiworkforce/types';

const mockClaimManualPairingToken = jest.fn();
const mockClose = jest.fn();
const capturedOnEvents: ((event: SignalingEvent) => void)[] = [];

const mockSignalingClient = jest.fn().mockImplementation((options: unknown) => {
  capturedOnEvents.push((options as { onEvent: (event: SignalingEvent) => void }).onEvent);
  return { sendSignal: jest.fn(), close: mockClose };
});

jest.mock('@/services/secureFetch', () => ({ secureFetch: jest.fn() }));

jest.mock('@/services/manualPairing', () => ({
  ...jest.requireActual('@/services/manualPairing'),
  claimManualPairingToken: (...args: unknown[]) => mockClaimManualPairingToken(...args),
}));

jest.mock('@agiworkforce/utils/signaling', () => ({
  ...jest.requireActual('@agiworkforce/utils/signaling'),
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
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('../services/companionNotifications', () => ({
  notifyCompanionMessage: jest.fn(),
}));

import { useConnectionStore } from '../stores/connectionStore';

const PAIRING_SECRET = '9f'.repeat(32);

async function awaitSignalingClient(count: number) {
  await waitFor(() => expect(mockSignalingClient).toHaveBeenCalledTimes(count));
}

function latestOnEvent(): (event: SignalingEvent) => void {
  const onEvent = capturedOnEvents.at(-1);
  if (!onEvent) throw new Error('No signaling client was created');
  return onEvent;
}

describe('a relay that asks the phone to try again later', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnEvents.length = 0;
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
  });

  it('keeps the pairing, explains the pause and counts down to its own reconnect', async () => {
    useConnectionStore.getState().connect(`agiw3:ABCDEFGHIJKL:${PAIRING_SECRET}`);
    await awaitSignalingClient(1);
    const firstClientEvents = latestOnEvent();

    firstClientEvents({ type: 'error', error: 'service_unavailable' });

    expect(useConnectionStore.getState()).toMatchObject({
      status: 'reconnecting',
      error: 'Remote Control is briefly unavailable.',
      reconnectCountdown: 5,
      pairingCode: 'ABCDEFGHIJKL',
      pairToken: 'a'.repeat(64),
    });
    expect(mockClose).toHaveBeenCalledTimes(1);

    firstClientEvents({ type: 'close' });
    firstClientEvents({ type: 'error', error: 'connection_closed' });
    expect(useConnectionStore.getState().status).toBe('reconnecting');
  });

  it('waits longer each time the relay refuses again', async () => {
    useConnectionStore.getState().connect(`agiw3:ABCDEFGHIJKL:${PAIRING_SECRET}`);
    await awaitSignalingClient(1);
    latestOnEvent()({ type: 'error', error: 'service_unavailable' });
    expect(useConnectionStore.getState().reconnectCountdown).toBe(5);

    useConnectionStore.getState().connect('ABCDEFGHIJKL');
    await awaitSignalingClient(2);
    latestOnEvent()({ type: 'error', error: 'service_unavailable' });
    expect(useConnectionStore.getState()).toMatchObject({
      status: 'reconnecting',
      reconnectCountdown: 15,
    });
    expect(mockClaimManualPairingToken).toHaveBeenCalledTimes(1);
  });

  it('starts the wait over once a user disconnects', async () => {
    useConnectionStore.getState().connect(`agiw3:ABCDEFGHIJKL:${PAIRING_SECRET}`);
    await awaitSignalingClient(1);
    latestOnEvent()({ type: 'error', error: 'service_unavailable' });
    useConnectionStore.getState().disconnect();

    useConnectionStore.getState().connect(`agiw3:ABCDEFGHIJKL:${PAIRING_SECRET}`);
    await awaitSignalingClient(2);
    latestOnEvent()({ type: 'error', error: 'service_unavailable' });

    expect(useConnectionStore.getState().reconnectCountdown).toBe(5);
  });
});
