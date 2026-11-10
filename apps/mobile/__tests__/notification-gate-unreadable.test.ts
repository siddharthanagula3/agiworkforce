const mockGetState = jest.fn();

jest.mock('@/stores/notificationPrefsStore', () => ({
  useNotificationPrefsStore: { getState: () => mockGetState() },
}));

import { notificationAllowed, vibrationAllowed } from '../services/notificationGate';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockGetState.mockReset();
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
