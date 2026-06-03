let mockDefinedTask: (() => Promise<unknown>) | undefined;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((_name: string, task: () => Promise<unknown>) => {
    mockDefinedTask = task;
  }),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: {
    NewData: 'NewData',
    NoData: 'NoData',
    Failed: 'Failed',
  },
  BackgroundFetchStatus: {
    Available: 'Available',
    Denied: 'Denied',
    Restricted: 'Restricted',
  },
  getStatusAsync: jest.fn(async () => 'Available'),
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
}));

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: jest.fn(() => ({
      backgroundFetchEnabled: true,
      notificationsEnabled: true,
    })),
  },
}));

import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { api } from '../services/api';
import '../services/backgroundFetch';

const mockApiGet = api.get as jest.Mock;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;

describe('backgroundFetch Wave 1 approval notification dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({
      pendingApprovals: [
        {
          id: 'approval-1',
          agentName: 'Agent',
          toolName: 'run_command',
          description: 'Run command',
        },
      ],
      runningAgents: 1,
    });
  });

  it('does not schedule duplicate notifications for the same pending approval batch', async () => {
    expect(mockDefinedTask).toBeDefined();

    const first = await mockDefinedTask!();
    const second = await mockDefinedTask!();

    expect(first).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
    expect(second).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
