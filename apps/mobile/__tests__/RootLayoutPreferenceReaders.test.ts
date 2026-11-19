/* eslint-disable @typescript-eslint/no-require-imports */
let capturedNotificationHandler:
  ((notification: { request: { content: { data?: unknown } } }) => Promise<unknown>) | undefined;

jest.mock('../global.css', () => ({}));
jest.mock('../app/error', () => ({ default: () => null }));
jest.mock('expo-web-browser', () => ({
  ...jest.requireActual('expo-web-browser'),
  openBrowserAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  openURL: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  ...jest.requireActual('@/__mocks__/expo-notifications.mock').expoNotificationsMock(),
  __esModule: true,
  setNotificationHandler: jest.fn((handler: { handleNotification: unknown }) => {
    capturedNotificationHandler = handler.handleNotification as typeof capturedNotificationHandler;
  }),
}));

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { openUntrustedLink } from '@/lib/safeOpenURL';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';

const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
const openURL = Linking.openURL as jest.Mock;
const link = 'https://example.com/article';

describe('RootLayout hands stored preferences to the services that need them', () => {
  beforeAll(async () => {
    require('../app/_layout');
    await useNotificationPrefsStore.persist.rehydrate();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    openBrowser.mockResolvedValue({ type: 'dismiss' });
    openURL.mockResolvedValue(true);
  });

  afterAll(() => {
    useLocalSettingsStore.setState({ linkBrowser: 'in-app' });
  });

  it('opens a chat link in the browser the person chose', async () => {
    useLocalSettingsStore.setState({ linkBrowser: 'system' });
    await expect(openUntrustedLink(link)).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(link);
    expect(openBrowser).not.toHaveBeenCalled();

    jest.clearAllMocks();
    useLocalSettingsStore.setState({ linkBrowser: 'in-app' });
    await expect(openUntrustedLink(link)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(link, expect.any(Object));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('records the first research notice in the notification settings', async () => {
    useNotificationPrefsStore.setState({ announcedPushGroups: [] });
    if (!capturedNotificationHandler) throw new Error('notification handler was not captured');

    await capturedNotificationHandler({
      request: { content: { data: { type: 'research_completed' } } },
    });

    expect(useNotificationPrefsStore.getState().announcedPushGroups).toEqual(['research']);
  });
});
