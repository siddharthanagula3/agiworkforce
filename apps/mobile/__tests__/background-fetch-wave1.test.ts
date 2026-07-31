let mockDefinedTask: (() => Promise<unknown>) | undefined;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((_name: string, task: () => Promise<unknown>) => {
    mockDefinedTask = task;
  }),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: {
    Success: 'Success',
    Failed: 'Failed',
  },
  BackgroundTaskStatus: {
    Restricted: 'Restricted',
    Available: 'Available',
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

import * as BackgroundTask from 'expo-background-task';
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

    // expo-background-task has no NewData/NoData distinction, so the return
    // value can no longer witness the dedupe — both runs report Success. The
    // notification call count is the assertion that actually proves it: the
    // second run saw the same approval batch and scheduled nothing.
    expect(first).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(second).toBe(BackgroundTask.BackgroundTaskResult.Success);
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
