import { MobilePushPreferencesSchema } from '@agiworkforce/cloud-contracts';

let capturedNotificationHandler:
  | ((notification: { request: { content: { data?: unknown } } }) => Promise<{
      shouldShowBanner: boolean;
    }>)
  | undefined;

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  api: { post: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/lib/deviceId', () => ({
  ...jest.requireActual('@/lib/deviceId'),
  getDeviceId: jest.fn().mockResolvedValue('device-1'),
}));

jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const constants = Object.create(actual.default);
  Object.defineProperty(constants, 'expoConfig', {
    get: () => ({ ...actual.default.expoConfig, extra: { eas: { projectId: 'project-1' } } }),
  });
  return { __esModule: true, ...actual, default: constants };
});

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  __esModule: true,
  setNotificationHandler: jest.fn((handler: { handleNotification: unknown }) => {
    capturedNotificationHandler = handler.handleNotification as typeof capturedNotificationHandler;
  }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3, HIGH: 4, MAX: 5, MIN: 1 },
}));

import { setPushTypeReceivedListener } from '../services/notifications';
import { buildPushDeliveryPreferences } from '../services/pushPreferenceSync';
import {
  DEFAULT_CATEGORY_ENABLED,
  useNotificationPrefsStore,
} from '../stores/notificationPrefsStore';

const SPLIT_TYPES = [
  'research_completed',
  'code_session_completed',
  'code_session_failed',
  'code_session_needs_input',
] as const;

function present(type: string) {
  if (!capturedNotificationHandler) throw new Error('notification handler was not captured');
  return capturedNotificationHandler({ request: { content: { data: { type } } } });
}

describe('research and AGI Code notices reach the server preferences', () => {
  beforeAll(async () => {
    setPushTypeReceivedListener((type) =>
      useNotificationPrefsStore.getState().notePushTypeReceived(type),
    );
    await useNotificationPrefsStore.persist.rehydrate();
  });

  beforeEach(() => {
    useNotificationPrefsStore.setState({
      categoryEnabled: { ...DEFAULT_CATEGORY_ENABLED, research: true, code: true, tasks: false },
      quietHours: { ...useNotificationPrefsStore.getState().quietHours, enabled: false },
      announcedPushGroups: [],
    });
  });

  it('asks the server to follow the task switch while the groups are hidden', () => {
    const preferences = buildPushDeliveryPreferences();

    expect(MobilePushPreferencesSchema.safeParse(preferences).success).toBe(true);
    for (const type of SPLIT_TYPES) {
      expect(preferences.eventTypes[type]).toBe(false);
    }
    expect(preferences.quietHoursExemptEventTypes).toEqual(
      expect.arrayContaining(['code_session_failed', 'code_session_needs_input']),
    );
    expect(preferences.quietHoursExemptEventTypes).not.toContain('code_session_completed');
    expect(preferences.quietHoursExemptEventTypes).not.toContain('research_completed');
  });

  it('gives each group its own server switch once its notices arrive', async () => {
    useNotificationPrefsStore.getState().setCategoryEnabled('tasks', true);

    const shown = await present('code_session_completed');

    expect(shown.shouldShowBanner).toBe(true);
    expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual(['code']);

    useNotificationPrefsStore.getState().setCategoryEnabled('code', false);
    const preferences = buildPushDeliveryPreferences();
    expect(preferences.eventTypes.code_session_completed).toBe(false);
    expect(preferences.eventTypes.code_session_needs_input).toBe(false);
    expect(preferences.eventTypes.research_completed).toBe(true);
    expect(preferences.eventTypes.task_completed).toBe(true);
    expect(preferences.categories.code).toBe(false);
  });

  it('keeps a notice of a hidden group silent while task and approval updates are off', async () => {
    const shown = await present('research_completed');

    expect(shown.shouldShowBanner).toBe(false);
    expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual(['research']);
    expect(useNotificationPrefsStore.getState().categoryEnabled.research).toBe(false);
  });
});
