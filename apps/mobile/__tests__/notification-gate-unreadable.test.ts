const mockGetState = jest.fn();
const mockHasHydrated = jest.fn();
const mockOnFinishHydration = jest.fn();

jest.mock('@/stores/notificationPrefsStore', () => ({
  useNotificationPrefsStore: {
    getState: () => mockGetState(),
    persist: {
      hasHydrated: () => mockHasHydrated(),
      onFinishHydration: (callback: () => void) => mockOnFinishHydration(callback),
    },
  },
}));

import {
  notificationAllowed,
  notificationAllowedOnceReadable,
  vibrationAllowed,
} from '../services/notificationGate';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockGetState.mockReset();
  mockHasHydrated.mockReset().mockReturnValue(true);
  mockOnFinishHydration.mockReset().mockReturnValue(() => undefined);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

describe('notification gate with readable preferences', () => {
  it('follows the stored decision', () => {
    mockGetState.mockReturnValue({
      shouldNotify: (type: string) => type === 'agent_failed',
      vibrationEnabled: { critical: true, high: false, normal: false, low: false },
    });

    expect(notificationAllowed('agent_failed')).toBe(true);
    expect(notificationAllowed('task_completed')).toBe(false);
    expect(vibrationAllowed('critical')).toBe(true);
    expect(vibrationAllowed('high')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('notification gate with unreadable preferences', () => {
  beforeEach(() => {
    mockGetState.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
  });

  it('holds a routine notice instead of showing it as if quiet hours were off', () => {
    expect(notificationAllowed('task_completed')).toBe(false);
    expect(notificationAllowed('chat_message')).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('still shows the notices quiet hours never hold', () => {
    expect(notificationAllowed('agent_approval_needed')).toBe(true);
    expect(notificationAllowed('agent_failed')).toBe(true);
    expect(notificationAllowed('emergency_stop_triggered')).toBe(true);
  });

  it('vibrates only for a critical notice', () => {
    expect(vibrationAllowed('critical')).toBe(true);
    expect(vibrationAllowed('high')).toBe(false);
    expect(vibrationAllowed('normal')).toBe(false);
  });
});

describe('notification gate before the preference store has hydrated', () => {
  const store = (allowed: boolean) => ({ shouldNotify: jest.fn(() => allowed) });

  beforeEach(() => {
    mockHasHydrated.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a routine notice once hydration completes and allows it', async () => {
    mockGetState.mockReturnValue(store(true));
    let finishHydration: () => void = () => undefined;
    mockOnFinishHydration.mockImplementation((callback: () => void) => {
      finishHydration = callback;
      return () => undefined;
    });

    const decision = notificationAllowedOnceReadable('task_completed');
    await Promise.resolve();
    expect(mockGetState).not.toHaveBeenCalled();

    mockHasHydrated.mockReturnValue(true);
    finishHydration();
    await expect(decision).resolves.toBe(true);
  });

  it('keeps holding a routine notice that the hydrated preferences hold', async () => {
    mockGetState.mockReturnValue(store(false));
    mockOnFinishHydration.mockImplementation((callback: () => void) => {
      callback();
      return () => undefined;
    });

    await expect(notificationAllowedOnceReadable('task_completed')).resolves.toBe(false);
  });

  it('stops waiting after the bound and holds the notice when hydration never finishes', async () => {
    jest.useFakeTimers();
    mockGetState.mockReturnValue(store(false));

    const decision = notificationAllowedOnceReadable('task_completed');
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(decision).resolves.toBe(false);
  });

  it('shows an exempt notice at once without waiting', async () => {
    mockGetState.mockReturnValue(store(true));

    await expect(notificationAllowedOnceReadable('agent_approval_needed')).resolves.toBe(true);
    expect(mockOnFinishHydration).not.toHaveBeenCalled();
  });
});
