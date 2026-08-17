jest.mock('@agiworkforce/utils/signaling', () => ({
  SignalingClient: jest.fn(),
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array(16)),
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(16)),
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('../services/companionNotifications', () => ({
  notifyCompanionMessage: jest.fn(),
}));

import {
  createControlAckTracker,
  readControlRequestId,
  type ControlAckTracker,
  type ControlDelivery,
} from '../src/integrations/controlAckTracker';
import { parseControlReceipt } from '../stores/connectionStore';

const TIMEOUT_MS = 1_000;
const MAX_ATTEMPTS = 3;

function receiptPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: 'control.receipt',
    version: 1,
    requestId: 'req-1',
    controlAction: 'dispatch.task.create',
    outcome: 'accepted',
    receivedAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  };
}

describe('parseControlReceipt', () => {
  it('accepts a versioned receipt with a known outcome', () => {
    expect(parseControlReceipt(receiptPayload())).toEqual({
      action: 'control.receipt',
      version: 1,
      requestId: 'req-1',
      controlAction: 'dispatch.task.create',
      outcome: 'accepted',
      receivedAt: '2026-08-17T10:00:00.000Z',
    });
    expect(parseControlReceipt(receiptPayload({ outcome: 'duplicate' }))?.outcome).toBe(
      'duplicate',
    );
  });

  it('rejects a receipt from another contract version or with an unknown outcome', () => {
    expect(parseControlReceipt(receiptPayload({ version: 2 }))).toBeNull();
    expect(parseControlReceipt(receiptPayload({ outcome: 'maybe' }))).toBeNull();
    expect(parseControlReceipt(receiptPayload({ requestId: '   ' }))).toBeNull();
    expect(parseControlReceipt(receiptPayload({ receivedAt: 'not-a-date' }))).toBeNull();
    expect(parseControlReceipt(receiptPayload({ action: 'dispatch.task.status' }))).toBeNull();
  });
});

describe('readControlRequestId', () => {
  it('reads only a bounded string request id', () => {
    expect(readControlRequestId({ requestId: 'req-1' })).toBe('req-1');
    expect(readControlRequestId({ requestId: 'x'.repeat(129) })).toBeNull();
    expect(readControlRequestId({ requestId: 7 })).toBeNull();
    expect(readControlRequestId(null)).toBeNull();
  });
});

describe('control ack tracker', () => {
  let resend: jest.Mock;
  let deliveries: ControlDelivery[];
  let pendingCounts: number[];
  let tracker: ControlAckTracker;

  beforeEach(() => {
    jest.useFakeTimers();
    resend = jest.fn();
    deliveries = [];
    pendingCounts = [];
    tracker = createControlAckTracker({
      timeoutMs: TIMEOUT_MS,
      maxAttempts: MAX_ATTEMPTS,
      maxPending: 3,
      resend: (action, payload) => {
        resend(action, payload);
        tracker.track(action, payload);
      },
      onChange: (pendingCount, delivery) => {
        pendingCounts.push(pendingCount);
        if (delivery) deliveries.push(delivery);
      },
    });
  });

  afterEach(() => {
    tracker.clear();
    jest.useRealTimers();
  });

  it('holds a dispatched control pending until its receipt arrives', () => {
    tracker.track('dispatch.task.create', { requestId: 'req-1', prompt: 'do it' });
    expect(tracker.pendingRequestIds()).toEqual(['req-1']);

    tracker.resolve('req-1', 'accepted');

    expect(tracker.pendingCount()).toBe(0);
    expect(deliveries).toEqual([
      { requestId: 'req-1', action: 'dispatch.task.create', outcome: 'acknowledged' },
    ]);
  });

  it('retries the same request id until the attempt budget is spent, then reports it dropped', () => {
    tracker.track('dispatch.task.create', { requestId: 'req-1', prompt: 'do it' });

    jest.advanceTimersByTime(TIMEOUT_MS);
    expect(resend).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(TIMEOUT_MS);
    expect(resend).toHaveBeenCalledTimes(2);
    expect(resend.mock.calls.every(([, payload]) => payload.requestId === 'req-1')).toBe(true);

    jest.advanceTimersByTime(TIMEOUT_MS);

    expect(resend).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
    expect(tracker.pendingCount()).toBe(0);
    expect(deliveries).toEqual([
      { requestId: 'req-1', action: 'dispatch.task.create', outcome: 'dropped' },
    ]);
  });

  it('stops retrying once the receipt lands', () => {
    tracker.track('approval_response', { requestId: 'req-2', approved: true });

    jest.advanceTimersByTime(TIMEOUT_MS);
    expect(resend).toHaveBeenCalledTimes(1);

    tracker.resolve('req-2', 'duplicate');
    jest.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(resend).toHaveBeenCalledTimes(1);
    expect(deliveries).toEqual([
      { requestId: 'req-2', action: 'approval_response', outcome: 'acknowledged' },
    ]);
  });

  it('reports a rejected receipt as a rejected delivery rather than a silent success', () => {
    tracker.track('dispatch.task.cancel', { requestId: 'req-3' });
    tracker.resolve('req-3', 'rejected');

    expect(deliveries).toEqual([
      { requestId: 'req-3', action: 'dispatch.task.cancel', outcome: 'rejected' },
    ]);
  });

  it('never grows past its pending bound', () => {
    for (let index = 0; index < 10; index += 1) {
      tracker.track('dispatch.task.create', { requestId: `req-${index}`, prompt: 'x' });
    }

    expect(tracker.pendingCount()).toBe(3);
    expect(tracker.pendingRequestIds()).toEqual(['req-7', 'req-8', 'req-9']);
  });

  it('ignores a control that carries no request id', () => {
    tracker.track('sync_request', {});
    expect(tracker.pendingCount()).toBe(0);
    expect(pendingCounts).toEqual([]);
  });

  it('drops every pending control when the session is torn down', () => {
    tracker.track('dispatch.task.create', { requestId: 'req-1', prompt: 'x' });
    tracker.clear();

    jest.advanceTimersByTime(TIMEOUT_MS * 5);

    expect(resend).not.toHaveBeenCalled();
    expect(tracker.pendingCount()).toBe(0);
  });
});
