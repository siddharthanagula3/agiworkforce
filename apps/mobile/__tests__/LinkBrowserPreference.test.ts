import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));

import {
  openUntrustedLink,
  openUntrustedUrlInAppBrowser,
  setLinkBrowserPreferenceReader,
} from '@/lib/safeOpenURL';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';

const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;
const openURL = Linking.openURL as jest.Mock;
const link = 'https://example.com/article';

describe('Browser choice before the app registers the choice', () => {
  it('opens links in the in-app browser', async () => {
    let fresh!: {
      open: typeof openUntrustedLink;
      openBrowser: jest.Mock;
      openURL: jest.Mock;
    };
    jest.isolateModules(() => {
      fresh = {
        open: jest.requireActual<typeof import('@/lib/safeOpenURL')>('@/lib/safeOpenURL')
          .openUntrustedLink,
        openBrowser: jest.requireMock<typeof WebBrowser>('expo-web-browser')
          .openBrowserAsync as jest.Mock,
        openURL: jest.requireMock<typeof Linking>('expo-linking').openURL as jest.Mock,
      };
    });
    fresh.openBrowser.mockResolvedValue({ type: 'dismiss' });
    fresh.openURL.mockResolvedValue(true);

    await expect(fresh.open(link)).resolves.toBe(true);
    expect(fresh.openBrowser).toHaveBeenCalledWith(link, expect.any(Object));
    expect(fresh.openURL).not.toHaveBeenCalled();
  });
});

describe('Browser choice for links from chat content', () => {
  beforeAll(() => {
    setLinkBrowserPreferenceReader(() => useLocalSettingsStore.getState().linkBrowser === 'system');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    openBrowser.mockResolvedValue({ type: 'dismiss' });
    openURL.mockResolvedValue(true);
    useLocalSettingsStore.setState({ linkBrowser: 'in-app' });
  });

  afterAll(() => {
    useLocalSettingsStore.setState({ linkBrowser: 'in-app' });
  });

  it('opens links in the in-app browser by default', async () => {
    await expect(openUntrustedLink(link)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(link, expect.any(Object));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('opens links in the default browser when it is chosen', async () => {
    useLocalSettingsStore.setState({ linkBrowser: 'system' });
    await expect(openUntrustedLink(link)).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith(link);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('falls back to the in-app browser when the default browser cannot open the link', async () => {
    useLocalSettingsStore.setState({ linkBrowser: 'system' });
    openURL.mockRejectedValue(new Error('no browser'));
    await expect(openUntrustedLink(link)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(link, expect.any(Object));
  });

  it('reports failure when neither browser opens the link', async () => {
    useLocalSettingsStore.setState({ linkBrowser: 'system' });
    openURL.mockRejectedValue(new Error('no browser'));
    openBrowser.mockRejectedValue(new Error('no sheet'));
    await expect(openUntrustedLink(link)).resolves.toBe(false);
  });

  it('refuses a link that is not http or https in either mode', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const browser of ['in-app', 'system'] as const) {
      useLocalSettingsStore.setState({ linkBrowser: browser });
      await expect(openUntrustedLink('javascript:alert(1)')).resolves.toBe(false);
      await expect(openUntrustedLink('tel:5551234')).resolves.toBe(false);
    }
    expect(openURL).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps AGI pages in the in-app browser when the default browser is chosen', async () => {
    useLocalSettingsStore.setState({ linkBrowser: 'system' });
    const agiPage = 'https://agiworkforce.com/open/conversation/abc';
    await expect(openUntrustedLink(agiPage)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(agiPage, expect.any(Object));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('keeps sign-in and authorization pages in the in-app browser whatever the choice', async () => {
    useLocalSettingsStore.setState({ linkBrowser: 'system' });
    await expect(openUntrustedUrlInAppBrowser(link)).resolves.toBe(true);
    expect(openBrowser).toHaveBeenCalledWith(link, expect.any(Object));
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe('Stored browser and map choices', () => {
  const merge = useLocalSettingsStore.persist.getOptions().merge!;

  it('defaults to the in-app browser and Apple Maps', () => {
    const merged = merge({}, useLocalSettingsStore.getInitialState());
    expect(merged.linkBrowser).toBe('in-app');
    expect(merged.mapProvider).toBe('apple');
  });

  it('restores a saved choice', () => {
    const merged = merge(
      { linkBrowser: 'system', mapProvider: 'google' },
      useLocalSettingsStore.getInitialState(),
    );
    expect(merged.linkBrowser).toBe('system');
    expect(merged.mapProvider).toBe('google');
  });

  it('reads an unknown saved value as the default', () => {
    const merged = merge(
      { linkBrowser: 'chrome', mapProvider: 'waze' },
      useLocalSettingsStore.getInitialState(),
    );
    expect(merged.linkBrowser).toBe('in-app');
    expect(merged.mapProvider).toBe('apple');
  });
});
