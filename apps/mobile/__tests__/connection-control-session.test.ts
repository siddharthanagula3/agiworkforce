import { waitFor } from '@testing-library/react-native';
import {
  DISPATCH_MAX_MESSAGE_AGE_MS,
  type SignalingClientOptions,
  type SignalingEvent,
} from '@agiworkforce/types';

let mockDigestBarrier: { entered: () => void; resume: Promise<void> } | null = null;
let mockNonceCounter = 0;
const mockClaimManualPairingToken = jest.fn();
const mockSignalingClient = jest.fn().mockImplementation(() => ({
  sendSignal: jest.fn().mockReturnValue(true),
  close: jest.fn(),
}));

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
  RTCPeerConnection: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof import('crypto')>('crypto');
  const randomBytes = (length: number) => {
    mockNonceCounter += 1;
    return Uint8Array.from({ length }, (_, index) => (mockNonceCounter + index * 7) & 0xff);
  };
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digest: jest.fn(async (_algorithm: string, data: ArrayBuffer) => {
      const barrier = mockDigestBarrier;
      mockDigestBarrier = null;
      if (barrier) {
        barrier.entered();
        await barrier.resume;
      }
      const result = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest();
      return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
    }),
    getRandomBytes: jest.fn(randomBytes),
    getRandomBytesAsync: jest.fn(async (length: number) => randomBytes(length)),
    randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0' } },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn(),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('../services/companionNotifications', () => ({
  notifyCompanionMessage: jest.fn(),
}));

import { deriveDispatchSecret, signMessage, type HmacSessionState } from '../lib/dispatchHmac';
import { useConnectionStore } from '../stores/connectionStore';
import { useAgentStore } from '../stores/agentStore';
import { notifyCompanionMessage } from '../services/companionNotifications';

const PAIRING_CODE = 'ABCDEFGHIJKL';
const PAIRING_SECRET = '9f'.repeat(32);
const PAIRING_PAYLOAD = `agiw3:${PAIRING_CODE}:${PAIRING_SECRET}`;

function holdNextDigest() {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockDigestBarrier = { entered, resume };
  return { started, release };
}

async function drainControlWork(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function connectSession() {
  const callIndex = mockSignalingClient.mock.calls.length;
  useConnectionStore.getState().connect(PAIRING_PAYLOAD);
  await waitFor(() => expect(mockSignalingClient).toHaveBeenCalledTimes(callIndex + 1));
  const options = mockSignalingClient.mock.calls[callIndex]![0] as SignalingClientOptions;
  const client = mockSignalingClient.mock.results[callIndex]!.value as {
    sendSignal: jest.Mock;
    close: jest.Mock;
  };
  const emit = (event: SignalingEvent) => options.onEvent(event);
  emit({ type: 'peer_ready', role: 'desktop', metadata: { deviceName: 'Test desktop' } });
  const salt = options.metadata!['dispatchSalt'] as string;
  const sender: HmacSessionState = {
    secret: await deriveDispatchSecret(PAIRING_CODE, salt, PAIRING_SECRET),
    nonceCache: new Map(),
  };
  return { emit, client, sender };
}

async function agentEnvelope(sender: HmacSessionState, id: string) {
  return signMessage(sender, 'agents_update', {
    action: 'agents_update',
    agents: [
      {
        id,
        name: id,
        model: 'default',
        status: 'running',
        currentStep: 'Working',
        progress: 10,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        steps: [],
        toolCalls: [],
      },
    ],
  });
}

function deliverControl(emit: (event: SignalingEvent) => void, payload: unknown): void {
  emit({ type: 'signal', from: 'desktop', kind: 'control', payload });
}

describe('Connection control session ownership', () => {
  beforeEach(() => {
    useConnectionStore.getState().disconnect();
    jest.clearAllMocks();
    mockDigestBarrier = null;
    mockNonceCounter = 0;
    mockClaimManualPairingToken.mockResolvedValue({
      code: PAIRING_CODE,
      pairToken: 'a'.repeat(64),
      expiresAt: Date.now() + 300_000,
      wsUrl: 'wss://signaling.agiworkforce.com/ws',
    });
    useAgentStore.setState({ agents: [], pendingApprovals: [], selectedAgentId: null });
  });

  afterEach(() => {
    useConnectionStore.getState().disconnect();
    jest.restoreAllMocks();
  });

  it('applies authentic controls and notifications in the current session', async () => {
    const session = await connectSession();
    deliverControl(session.emit, await agentEnvelope(session.sender, 'current-agent'));
    const notice = await signMessage(session.sender, 'task_completed', {
      action: 'task_completed',
      taskId: 'current-task',
    });
    deliverControl(session.emit, notice);
    await drainControlWork();
    expect(useAgentStore.getState().agents.map((agent) => agent.id)).toEqual(['current-agent']);
    expect(notifyCompanionMessage).toHaveBeenCalledTimes(1);
  });

  it('delivers a concurrently duplicated authentic notification once', async () => {
    const session = await connectSession();
    const notice = await signMessage(session.sender, 'task_completed', {
      action: 'task_completed',
      taskId: 'current-task',
    });
    deliverControl(session.emit, notice);
    deliverControl(session.emit, notice);
    await drainControlWork();
    expect(notifyCompanionMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['disconnect', 'peer_left', 'terminated', 'close', 'session_expired'] as const)(
    'rejects a control completing after %s',
    async (ending) => {
      const session = await connectSession();
      const envelope = await agentEnvelope(session.sender, 'old-agent');
      const barrier = holdNextDigest();
      deliverControl(session.emit, envelope);
      await barrier.started;
      if (ending === 'disconnect') useConnectionStore.getState().disconnect();
      else if (ending === 'peer_left') session.emit({ type: 'peer_left', role: 'desktop' });
      else session.emit({ type: ending });
      barrier.release();
      await drainControlWork();
      expect(useAgentStore.getState().agents).toEqual([]);
      expect(useConnectionStore.getState().status).toBe(
        ending === 'session_expired' ? 'session_expired' : 'disconnected',
      );
      expect(notifyCompanionMessage).not.toHaveBeenCalled();
    },
  );

  it('rejects an old control after session replacement and accepts the replacement control', async () => {
    const oldSession = await connectSession();
    const envelope = await agentEnvelope(oldSession.sender, 'old-agent');
    const barrier = holdNextDigest();
    deliverControl(oldSession.emit, envelope);
    await barrier.started;
    const replacement = await connectSession();
    deliverControl(replacement.emit, await agentEnvelope(replacement.sender, 'new-agent'));
    await drainControlWork();
    barrier.release();
    await drainControlWork();
    expect(useAgentStore.getState().agents.map((agent) => agent.id)).toEqual(['new-agent']);
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('never notifies for an authentic control completing after disconnect', async () => {
    const session = await connectSession();
    const envelope = await signMessage(session.sender, 'task_completed', {
      action: 'task_completed',
      taskId: 'old-task',
    });
    const barrier = holdNextDigest();
    deliverControl(session.emit, envelope);
    await barrier.started;
    useConnectionStore.getState().disconnect();
    barrier.release();
    await drainControlWork();
    expect(notifyCompanionMessage).not.toHaveBeenCalled();
  });

  it('does not apply an old protocol rejection after disconnect', async () => {
    const session = await connectSession();
    const envelope = await agentEnvelope(session.sender, 'old-agent');
    deliverControl(session.emit, { ...envelope, v: envelope.v - 1 });
    useConnectionStore.getState().disconnect();
    await drainControlWork();
    expect(useConnectionStore.getState().error).toBeNull();
  });

  it('rejects a pending control across a peer disconnect and return in the same pairing', async () => {
    const session = await connectSession();
    const envelope = await agentEnvelope(session.sender, 'old-agent');
    const barrier = holdNextDigest();
    deliverControl(session.emit, envelope);
    await barrier.started;
    session.emit({ type: 'peer_left', role: 'desktop' });
    session.emit({ type: 'peer_ready', role: 'desktop' });
    barrier.release();
    await drainControlWork();
    expect(useAgentStore.getState().agents).toEqual([]);
    expect(useConnectionStore.getState().status).toBe('connected');
    deliverControl(session.emit, await agentEnvelope(session.sender, 'returned-agent'));
    await drainControlWork();
    expect(useAgentStore.getState().agents.map((agent) => agent.id)).toEqual(['returned-agent']);
  });

  it.each(['stale', 'reconnecting'] as const)(
    'preserves authentic heartbeat recovery from %s',
    async (status) => {
      const session = await connectSession();
      const envelope = await signMessage(session.sender, 'heartbeat_ack', {
        action: 'heartbeat_ack',
        timestamp: Date.now(),
      });
      useConnectionStore.setState({ status });
      deliverControl(session.emit, envelope);
      await drainControlWork();
      expect(useConnectionStore.getState().status).toBe('connected');
      expect(useConnectionStore.getState().lastHeartbeatLatencyMs).not.toBeNull();
    },
  );

  it.each(['connected', 'stale', 'reconnecting'] as const)(
    'rejects a control expiring during verification in the same %s session',
    async (status) => {
      const session = await connectSession();
      const envelope = await agentEnvelope(session.sender, 'expired-agent');
      useConnectionStore.setState({ status });
      const barrier = holdNextDigest();
      deliverControl(session.emit, envelope);
      await barrier.started;
      jest.spyOn(Date, 'now').mockReturnValue(envelope.ts + DISPATCH_MAX_MESSAGE_AGE_MS + 1);
      barrier.release();
      await drainControlWork();
      expect(useAgentStore.getState().agents).toEqual([]);
      expect(useConnectionStore.getState().status).toBe(status);
      const heartbeat = await signMessage(session.sender, 'heartbeat_ack', {
        action: 'heartbeat_ack',
        timestamp: Date.now(),
      });
      deliverControl(session.emit, heartbeat);
      await drainControlWork();
      expect(useConnectionStore.getState().status).toBe('connected');
      expect(useConnectionStore.getState().lastHeartbeatLatencyMs).toBe(0);
    },
  );

  it('never resurrects a queued control after its signing session disconnects', async () => {
    const oldSession = await connectSession();
    useConnectionStore.getState().markStale();
    useConnectionStore.getState().markStale();
    await useConnectionStore.getState().sendControl('pause_agent', { agentId: 'old-agent' });
    const barrier = holdNextDigest();
    oldSession.emit({ type: 'peer_ready', role: 'desktop' });
    await barrier.started;
    useConnectionStore.getState().disconnect();
    barrier.release();
    await drainControlWork();
    const replacement = await connectSession();
    await drainControlWork();
    expect(oldSession.client.sendSignal).not.toHaveBeenCalled();
    expect(replacement.client.sendSignal).not.toHaveBeenCalled();
    useConnectionStore.getState().markStale();
    useConnectionStore.getState().markStale();
    await useConnectionStore.getState().sendControl('pause_agent', { agentId: 'new-agent' });
    replacement.emit({ type: 'peer_ready', role: 'desktop' });
    await drainControlWork();
    expect(replacement.client.sendSignal).toHaveBeenCalledTimes(1);
    expect(replacement.client.sendSignal.mock.calls[0]![1].data.payload).toMatchObject({
      agentId: 'new-agent',
    });
  });

  it('keeps a failed same-session queued send for a later transport retry', async () => {
    const session = await connectSession();
    session.client.sendSignal.mockReturnValueOnce(false);
    useConnectionStore.getState().markStale();
    useConnectionStore.getState().markStale();
    await useConnectionStore.getState().sendControl('pause_agent', { agentId: 'current-agent' });
    session.emit({ type: 'peer_ready', role: 'desktop' });
    await drainControlWork();
    expect(session.client.sendSignal).toHaveBeenCalledTimes(1);
    session.emit({ type: 'peer_ready', role: 'desktop' });
    await drainControlWork();
    expect(session.client.sendSignal).toHaveBeenCalledTimes(2);
  });

  it('does not send a queued control whose peer disconnected and returned during signing', async () => {
    const session = await connectSession();
    useConnectionStore.getState().queueControl('pause_agent', { agentId: 'old-agent' });
    const barrier = holdNextDigest();
    session.emit({ type: 'peer_ready', role: 'desktop' });
    await barrier.started;
    session.emit({ type: 'peer_left', role: 'desktop' });
    session.emit({ type: 'peer_ready', role: 'desktop' });
    barrier.release();
    await drainControlWork();
    expect(session.client.sendSignal).not.toHaveBeenCalled();
    session.emit({ type: 'peer_ready', role: 'desktop' });
    await drainControlWork();
    expect(session.client.sendSignal).not.toHaveBeenCalled();
  });
});
