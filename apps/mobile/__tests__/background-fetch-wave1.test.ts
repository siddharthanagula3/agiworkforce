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
  setNotificationCategoryAsync: jest.fn(async () => undefined),
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
import {
  registerBackgroundFetch,
  resetBackgroundFetchAccountState,
} from '../services/backgroundFetch';
import {
  AGENT_APPROVAL_CATEGORY_IDENTIFIER,
  AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER,
} from '../services/notificationCategories';

const mockApiGet = api.get as jest.Mock;
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;

describe('backgroundFetch Wave 1 approval notification dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBackgroundFetchAccountState();
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
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          categoryIdentifier: AGENT_APPROVAL_CATEGORY_IDENTIFIER,
        }),
      }),
    );
  });

  it('registers a safe review action before enabling background polling', async () => {
    await registerBackgroundFetch();

    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      AGENT_APPROVAL_CATEGORY_IDENTIFIER,
      [
        {
          identifier: AGENT_APPROVAL_REVIEW_ACTION_IDENTIFIER,
          buttonTitle: 'Review',
          options: {
            isAuthenticationRequired: true,
            opensAppToForeground: true,
          },
        },
      ],
      {
        previewPlaceholder: 'Approval required',
      },
    );
    expect(AGENT_APPROVAL_CATEGORY_IDENTIFIER).not.toMatch(/[:-]/);
  });
});
