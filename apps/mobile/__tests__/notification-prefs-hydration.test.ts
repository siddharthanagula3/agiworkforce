let mockStoredPrefs: string | null = null;

jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: () => mockStoredPrefs,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

let notificationAllowedOnceReadable: typeof import('../services/notificationGate').notificationAllowedOnceReadable;
let useNotificationPrefsStore: typeof import('../stores/notificationPrefsStore').useNotificationPrefsStore;

const NOON_UTC = new Date('2026-07-31T12:00:00Z');

function savedPreferences(quietHoursEnabled: boolean): string {
  return JSON.stringify({
    state: {
      categoryEnabled: { chat_replies: true, tasks: true, product: false },
      quietHours: {
        enabled: quietHoursEnabled,
        days: [0, 1, 2, 3, 4, 5, 6],
        startTime: '10:00',
        endTime: '14:00',
        timezone: 'UTC',
      },
    },
    version: 2,
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOON_UTC });
  mockStoredPrefs = null;
  jest.resetModules();
  ({ notificationAllowedOnceReadable } = jest.requireActual('../services/notificationGate'));
  ({ useNotificationPrefsStore } = jest.requireActual('../stores/notificationPrefsStore'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('notification preferences before and after hydration', () => {
  it('holds a routine notice and shows an exempt one until the store has hydrated', () => {
    const { shouldNotify } = useNotificationPrefsStore.getState();

    expect(useNotificationPrefsStore.persist.hasHydrated()).toBe(false);
    expect(shouldNotify('task_completed')).toBe(false);
    expect(shouldNotify('chat_message')).toBe(false);
    expect(shouldNotify('agent_approval_needed')).toBe(true);
    expect(shouldNotify('agent_failed')).toBe(true);
  });

  it('shows a held routine notice once hydration finds quiet hours off', async () => {
    mockStoredPrefs = savedPreferences(false);

    const decision = notificationAllowedOnceReadable('task_completed');
    await useNotificationPrefsStore.persist.rehydrate();

    await expect(decision).resolves.toBe(true);
  });

  it('keeps holding the notice once hydration finds quiet hours covering now', async () => {
    mockStoredPrefs = savedPreferences(true);

    const decision = notificationAllowedOnceReadable('task_completed');
    await useNotificationPrefsStore.persist.rehydrate();

    await expect(decision).resolves.toBe(false);
    await expect(notificationAllowedOnceReadable('agent_failed')).resolves.toBe(true);
  });

  it('treats a first launch with nothing saved as readable defaults', async () => {
    const decision = notificationAllowedOnceReadable('task_completed');
    await useNotificationPrefsStore.persist.rehydrate();

    await expect(decision).resolves.toBe(true);
  });
});
