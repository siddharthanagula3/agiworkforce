/* eslint-disable @typescript-eslint/no-require-imports */
const mockStore = new Map<string, string>();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();

jest.mock('@/lib/mmkv', () => ({
  ...jest.requireActual('@/lib/mmkv'),
  storage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
  },
}));

jest.mock('../services/api', () => ({
  api: { post: jest.fn().mockResolvedValue({ ok: true }) },
}));

jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-1'),
}));

jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
}));

import type { AppStateStatus } from 'react-native';

type Status = 'granted' | 'denied' | 'undetermined';
interface PermissionModules {
  enablePushNotifications: () => Promise<string>;
  getPushPermissionStatus: () => Promise<Status>;
  getPushDeliveryStatus: () => Promise<string>;
  toPushPermissionStatus: (permission: Record<string, unknown>) => Status;
  isPushPermissionRequestPending: () => boolean;
  requestNotifications: () => Promise<string>;
}

function loadModules(): PermissionModules {
  const notifications = require('../services/notifications');
  const status = require('../services/pushPermissionStatus');
  const registry = require('../src/features/settings/permissions/registry');
  return {
    enablePushNotifications: notifications.enablePushNotifications,
    getPushPermissionStatus: notifications.getPushPermissionStatus,
    getPushDeliveryStatus: notifications.getPushDeliveryStatus,
    toPushPermissionStatus: status.toPushPermissionStatus,
    isPushPermissionRequestPending: status.isPushPermissionRequestPending,
    requestNotifications: registry.PERMISSION_REGISTRY.notifications.requestPermission,
  };
}

const neverAsked = { status: 'denied', canAskAgain: true, granted: false };
const noRationale = { status: 'denied', canAskAgain: false, granted: false };
const firstRefusal = { status: 'denied', canAskAgain: true, granted: false };
const allowed = { status: 'granted', canAskAgain: true, granted: true };
const switchedOff = { status: 'denied', canAskAgain: true, granted: true };

const appStateListeners = new Set<(state: AppStateStatus) => void>();
let pendingDuringRequest: boolean[] = [];
let modules: PermissionModules;

function emitAppState(state: AppStateStatus): void {
  for (const listener of [...appStateListeners]) listener(state);
}

function systemShowsPrompt(result: Record<string, unknown>): void {
  mockRequestPermissions.mockImplementationOnce(async () => {
    pendingDuringRequest.push(modules.isPushPermissionRequestPending());
    emitAppState('background');
    emitAppState('active');
    mockGetPermissions.mockResolvedValue(result);
    return result;
  });
}

function systemAnswersWithoutPrompt(result: Record<string, unknown>): void {
  mockRequestPermissions.mockImplementationOnce(async () => {
    pendingDuringRequest.push(modules.isPushPermissionRequestPending());
    mockGetPermissions.mockResolvedValue(result);
    return result;
  });
}

let device: { os: 'ios' | 'android'; version: number | string } = { os: 'android', version: 34 };

function applyDevice(): void {
  const { Platform } = require('react-native');
  Object.defineProperty(Platform, 'OS', { get: () => device.os, configurable: true });
  Object.defineProperty(Platform, 'Version', { get: () => device.version, configurable: true });
}

function setDevice(os: 'ios' | 'android', version: number | string): void {
  device = { os, version };
  applyDevice();
}

function bootApp(): void {
  jest.resetModules();
  applyDevice();
  const { AppState } = require('react-native');
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    type: string,
    listener: (state: AppStateStatus) => void,
  ) => {
    if (type === 'change') appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  }) as never);
  modules = loadModules();
}

function restartApp(): void {
  bootApp();
}

beforeEach(() => {
  mockStore.clear();
  mockGetPermissions.mockReset().mockResolvedValue(neverAsked);
  mockRequestPermissions.mockReset();
  appStateListeners.clear();
  pendingDuringRequest = [];
  device = { os: 'android', version: 34 };
  bootApp();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Android 13 and later: a first prompt closed with Back is not a refusal', () => {
  it('keeps the turn-on control and shows the prompt again, also after a restart', async () => {
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');

    systemShowsPrompt(noRationale);
    await expect(modules.enablePushNotifications()).resolves.toBe('undetermined');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');
    await expect(modules.getPushDeliveryStatus()).resolves.toBe('undetermined');

    restartApp();
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');

    const listenersBeforeRequest = appStateListeners.size;
    systemShowsPrompt(allowed);
    await expect(modules.enablePushNotifications()).resolves.toBe('granted');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(2);
    expect(pendingDuringRequest).toEqual([true, true]);
    expect(modules.isPushPermissionRequestPending()).toBe(false);
    expect(appStateListeners.size).toBe(listenersBeforeRequest);
  });

  it('reads a prompt dismissed in an earlier build, with no record yet, as still askable', async () => {
    mockGetPermissions.mockResolvedValue(noRationale);

    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');
    expect(modules.toPushPermissionStatus(noRationale)).toBe('undetermined');
  });

  it('keeps the control offered after one Don’t allow and then a prompt closed with Back', async () => {
    systemShowsPrompt(firstRefusal);
    await expect(modules.enablePushNotifications()).resolves.toBe('undetermined');

    systemShowsPrompt(firstRefusal);
    await expect(modules.enablePushNotifications()).resolves.toBe('undetermined');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');
  });
});

describe('Android 13 and later: the system will no longer show the prompt', () => {
  it('reads two explicit refusals as blocked, also after a restart', async () => {
    systemShowsPrompt(firstRefusal);
    await expect(modules.enablePushNotifications()).resolves.toBe('undetermined');

    systemShowsPrompt(noRationale);
    await expect(modules.enablePushNotifications()).resolves.toBe('denied');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');

    restartApp();
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
  });

  it('takes a request that returned without a prompt straight to blocked', async () => {
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');

    systemAnswersWithoutPrompt(noRationale);
    await expect(modules.enablePushNotifications()).resolves.toBe('denied');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
    await expect(modules.getPushDeliveryStatus()).resolves.toBe('denied');

    restartApp();
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
  });

  it('reads a second unanswered result in a row as blocked, so the control cannot keep returning', async () => {
    systemShowsPrompt(noRationale);
    await expect(modules.enablePushNotifications()).resolves.toBe('undetermined');

    systemShowsPrompt(noRationale);
    await expect(modules.enablePushNotifications()).resolves.toBe('denied');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
  });

  it('reads a block that follows an earlier grant as blocked', async () => {
    systemShowsPrompt(allowed);
    await expect(modules.enablePushNotifications()).resolves.toBe('granted');

    mockGetPermissions.mockResolvedValue(noRationale);
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
  });
});

describe('Android 13 and later: granted states are unchanged', () => {
  it('reads a grant as granted without asking', async () => {
    mockGetPermissions.mockResolvedValue(allowed);

    await expect(modules.enablePushNotifications()).resolves.toBe('granted');
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('reads notifications switched off in system settings as blocked, before and after a request', async () => {
    mockGetPermissions.mockResolvedValue(switchedOff);
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');

    systemAnswersWithoutPrompt(switchedOff);
    await expect(modules.enablePushNotifications()).resolves.toBe('denied');
  });
});

describe('the Permissions screen agrees with the Notifications screen', () => {
  it('records the same answers through the registry request', async () => {
    systemShowsPrompt(noRationale);
    await expect(modules.requestNotifications()).resolves.toBe('undetermined');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');

    systemAnswersWithoutPrompt(noRationale);
    await expect(modules.requestNotifications()).resolves.toBe('denied');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
  });
});

describe('platforms without the Android 13 prompt are unchanged', () => {
  it('keeps an Android 12 denial blocked, since there is no prompt to show', async () => {
    setDevice('android', 32);
    mockGetPermissions.mockResolvedValue(noRationale);

    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
  });

  it('keeps iOS to one prompt per install and records nothing', async () => {
    setDevice('ios', '18.0');
    mockGetPermissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    await expect(modules.getPushPermissionStatus()).resolves.toBe('undetermined');

    systemShowsPrompt({ status: 'denied', canAskAgain: false, granted: false });
    await expect(modules.enablePushNotifications()).resolves.toBe('denied');
    await expect(modules.getPushPermissionStatus()).resolves.toBe('denied');
    expect(mockStore.size).toBe(0);
  });
});
