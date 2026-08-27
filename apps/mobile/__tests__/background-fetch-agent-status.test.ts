let mockDefinedTask: (() => Promise<unknown>) | undefined;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((_name: string, task: () => Promise<unknown>) => {
    mockDefinedTask = task;
  }),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 'Success', Failed: 'Failed' },
  BackgroundTaskStatus: { Restricted: 'Restricted', Available: 'Available' },
  getStatusAsync: jest.fn(async () => 'Available'),
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
}));

jest.mock('../services/api', () => ({ api: { get: jest.fn() } }));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn(() => ({ backgroundFetchEnabled: true, notificationsEnabled: true })),
  },
}));

import * as Notifications from 'expo-notifications';
import { api } from '../services/api';
import { GATEWAY_URL } from '@/lib/constants';
import { resetBackgroundFetchAccountState } from '../services/backgroundFetch';

const mockApiGet = api.get as jest.Mock;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;

function pause(id: string, kind: 'approval' | 'input') {
  return {
    id,
    runId: '0190a000-0000-7000-8000-000000000001',
    kind,
    toolName: 'mcp__github__read_file',
    toolCount: 1,
    model: 'claude-test',
    requestedAt: '2026-07-17T20:00:01.000Z',
  };
}

describe('backgroundFetch agent-status polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBackgroundFetchAccountState();
    mockApiGet.mockResolvedValue({ pendingApprovals: [], runningAgents: 0 });
  });

  it('polls the Next.js app, where /api/mobile/agent-status is served', async () => {
    expect(mockDefinedTask).toBeDefined();

    await mockDefinedTask!();

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    const [path, options] = mockApiGet.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/mobile/agent-status');
    // The route lives in apps/web, not on the Express gateway host: pointing it
    // at GATEWAY_URL is what made this poll a 404.
    expect(options?.['baseUrl']).toBeUndefined();
    expect(JSON.stringify(options ?? {})).not.toContain(GATEWAY_URL);
  });

  it('notifies for an input pause the same way it does for an approval', async () => {
    mockApiGet.mockResolvedValue({
      pendingApprovals: [pause('checkpoint-1', 'input')],
      runningAgents: 1,
    });

    await mockDefinedTask!();

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [request] = mockScheduleNotificationAsync.mock.calls[0] as [
      { content: { body: string; data: Record<string, unknown> } },
    ];
    expect(request.content.data['approvalId']).toBe('checkpoint-1');
    expect(request.content.body).toBe('1 agent action is waiting on you');
  });

  it('counts every open pause in the body', async () => {
    mockApiGet.mockResolvedValue({
      pendingApprovals: [pause('checkpoint-1', 'approval'), pause('checkpoint-2', 'input')],
      runningAgents: 2,
    });

    await mockDefinedTask!();

    const [request] = mockScheduleNotificationAsync.mock.calls[0] as [
      { content: { body: string } },
    ];
    expect(request.content.body).toBe('2 agent actions are waiting on you');
  });
});
