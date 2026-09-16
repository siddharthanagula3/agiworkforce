/**
 * The full expo-notifications surface every suite starts from. Spread it first
 * and put the suite's own stubs after it: `services/notifications.ts` calls
 * `setNotificationHandler` at module scope, so a partial stub takes down every
 * suite whose import graph reaches it.
 */
function expoNotificationsMock(overrides = {}) {
  const makeSubscription = () => ({ remove: jest.fn() });

  return {
    __esModule: true,
    AndroidImportance: {
      MAX: 5,
      HIGH: 4,
      DEFAULT: 3,
      MIN: 1,
    },
    AndroidNotificationPriority: {
      MAX: 'max',
      HIGH: 'high',
      DEFAULT: 'default',
      LOW: 'low',
      MIN: 'min',
    },
    PermissionStatus: {
      GRANTED: 'granted',
      DENIED: 'denied',
      UNDETERMINED: 'undetermined',
    },
    IosAuthorizationStatus: {
      NOT_DETERMINED: 0,
      DENIED: 1,
      AUTHORIZED: 2,
      PROVISIONAL: 3,
      EPHEMERAL: 4,
    },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    getNotificationChannelAsync: jest.fn().mockResolvedValue(null),
    deleteNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
    getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
    getDevicePushTokenAsync: jest.fn().mockResolvedValue({ data: 'device-token' }),
    scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
    dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    addNotificationReceivedListener: jest.fn(() => makeSubscription()),
    addNotificationResponseReceivedListener: jest.fn(() => makeSubscription()),
    addPushTokenListener: jest.fn(() => makeSubscription()),
    removeNotificationSubscription: jest.fn(),
    getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
    setBadgeCountAsync: jest.fn().mockResolvedValue(undefined),
    getBadgeCountAsync: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

module.exports = { expoNotificationsMock };
