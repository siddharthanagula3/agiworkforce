const mockGetCalendarPermissions = jest.fn();
const mockRequestCalendarPermissions = jest.fn();
const mockGetRemindersPermissions = jest.fn();
const mockRequestRemindersPermissions = jest.fn();

jest.mock('expo-calendar', () => ({
  getCalendarPermissionsAsync: () => mockGetCalendarPermissions(),
  requestCalendarPermissionsAsync: () => mockRequestCalendarPermissions(),
  getRemindersPermissionsAsync: () => mockGetRemindersPermissions(),
  requestRemindersPermissionsAsync: () => mockRequestRemindersPermissions(),
}));

jest.mock('expo-camera', () => ({
  Camera: {
    getMicrophonePermissionsAsync: jest.fn(),
    requestMicrophonePermissionsAsync: jest.fn(),
    getCameraPermissionsAsync: jest.fn(),
    requestCameraPermissionsAsync: jest.fn(),
  },
}));

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-notifications', () => ({}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy(
    {},
    {
      get: (_target, property) => (property === '__esModule' ? true : icon),
    },
  );
});

import {
  PERMISSION_KINDS,
  PERMISSION_REGISTRY,
} from '../src/features/settings/permissions/registry';

describe('Calendar and reminders permission registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCalendarPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockRequestCalendarPermissions.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    mockGetRemindersPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false });
    mockRequestRemindersPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
  });

  it('consolidates Calendar into the unified permission list and native adapter', async () => {
    expect(PERMISSION_KINDS).toContain('calendar');

    await expect(PERMISSION_REGISTRY.calendar.getStatus()).resolves.toBe('granted');
    await expect(PERMISSION_REGISTRY.calendar.requestPermission()).resolves.toBe('undetermined');
    expect(mockGetCalendarPermissions).toHaveBeenCalledTimes(1);
    expect(mockRequestCalendarPermissions).toHaveBeenCalledTimes(1);
  });

  it('uses the distinct iOS Reminders permission instead of calendar status', async () => {
    expect(PERMISSION_KINDS).toContain('reminders');

    await expect(PERMISSION_REGISTRY.reminders.getStatus()).resolves.toBe('denied');
    await expect(PERMISSION_REGISTRY.reminders.requestPermission()).resolves.toBe('granted');
    expect(mockGetRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(mockRequestRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(mockGetCalendarPermissions).not.toHaveBeenCalled();
  });
});
