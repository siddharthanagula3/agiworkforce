/**
 * Zero-leak telemetry gate tests for storage/telemetry.ts (Agent Beta-4).
 *
 * enqueueTelemetryEvent must DROP the event (never touch the DB queue) unless
 * BOTH hold:
 *   1. the user has explicitly opted in (MMKV `telemetry_opted_in` === true), AND
 *   2. the app is NOT in Local mode (Local is on-device only).
 *
 * The gate is fail-closed: unset consent / unknown mode / read errors → drop.
 */

let mockConsent: boolean | undefined = false;
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getBoolean: (key: string) => (key === 'telemetry_opted_in' ? mockConsent : undefined),
  },
}));

let mockAppMode: unknown = 'local';
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => ({ appMode: mockAppMode }),
  },
}));

const mockDb = {
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
};
jest.mock('../storage/db', () => ({
  getDb: jest.fn(async () => mockDb),
}));

import { enqueueTelemetryEvent, isTelemetryAllowed } from '../storage/telemetry';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
  mockConsent = false;
  mockAppMode = 'local';
});

describe('isTelemetryAllowed — fail-closed consent + mode gate', () => {
  it('false when not consented (even in cloud mode)', () => {
    mockConsent = false;
    mockAppMode = 'cloud';
    expect(isTelemetryAllowed()).toBe(false);
  });

  it('false when consented but in Local mode', () => {
    mockConsent = true;
    mockAppMode = 'local';
    expect(isTelemetryAllowed()).toBe(false);
  });

  it('false when consent flag is unset/undefined', () => {
    mockConsent = undefined;
    mockAppMode = 'cloud';
    expect(isTelemetryAllowed()).toBe(false);
  });

  it('false when mode is unknown (fail-closed) even if consented', () => {
    mockConsent = true;
    mockAppMode = undefined;
    expect(isTelemetryAllowed()).toBe(false);
  });

  it('true only when consented AND cloud mode', () => {
    mockConsent = true;
    mockAppMode = 'cloud';
    expect(isTelemetryAllowed()).toBe(true);
  });
});

describe('enqueueTelemetryEvent — drops unless allowed', () => {
  it('does NOT enqueue when the user has not consented', async () => {
    mockConsent = false;
    mockAppMode = 'cloud';
    await enqueueTelemetryEvent('chat_turn', { count: 1 });
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when in Local mode, even if consented', async () => {
    mockConsent = true;
    mockAppMode = 'local';
    await enqueueTelemetryEvent('chat_turn', { count: 1 });
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it('enqueues only when consented AND in Cloud mode', async () => {
    mockConsent = true;
    mockAppMode = 'cloud';
    await enqueueTelemetryEvent('chat_turn', { count: 1 });
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql, args] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO telemetry_queue');
    expect(args[0]).toBe('chat_turn');
  });
});
