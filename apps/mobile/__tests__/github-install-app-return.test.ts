const mockPost = jest.fn();
const mockOpenAuthSession = jest.fn();
const mockOpenBrowser = jest.fn();
const mockOpenURL = jest.fn();
const mockPlatform = { OS: 'ios' as 'ios' | 'android', Version: '17.4' as string | number };

jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
  Linking: { openURL: (...args: unknown[]) => mockOpenURL(...args) },
}));
jest.mock('@/lib/constants', () => ({ API_URL: 'https://agiworkforce.com' }));
jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

import {
  completeGitHubInstall,
  describeGitHubInstallOutcome,
  fetchPendingGitHubInstall,
  iosSupportsHttpsAuthCallback,
  readGitHubInstallReturn,
  startGitHubInstallInApp,
} from '../src/features/cloud-code/githubInstall';

const STATE = 'b'.repeat(64);
const CONNECT_URL = `https://agiworkforce.com/github/connect?state=${'f'.repeat(64)}`;
const RETURN_URL = 'https://agiworkforce.com/github/installed';

describe('a GitHub app install started on the phone', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockOpenAuthSession.mockReset();
    mockOpenBrowser.mockReset();
    mockOpenURL.mockReset();
    mockPlatform.OS = 'ios';
    mockPlatform.Version = '17.4';
  });

  it('on iOS 17.4+ catches the https return in the auth session and hands it back, unlinked', async () => {
    mockPost.mockResolvedValueOnce({ url: CONNECT_URL });
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `${RETURN_URL}?state=${STATE}&code=one-time-code`,
    });

    await expect(startGitHubInstallInApp()).resolves.toEqual({
      kind: 'returned',
      result: { state: STATE, code: 'one-time-code' },
    });
    expect(mockPost).toHaveBeenCalledWith('/api/github/install/app-start');
    expect(mockOpenAuthSession).toHaveBeenCalledWith(CONNECT_URL, RETURN_URL, {
      preferUniversalLinks: true,
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('below iOS 17.4 opens Safari and returns through the universal link', async () => {
    mockPlatform.Version = '16.7';
    mockPost.mockResolvedValueOnce({ url: CONNECT_URL });

    await expect(startGitHubInstallInApp()).resolves.toEqual({ kind: 'opened' });
    expect(mockOpenURL).toHaveBeenCalledWith(CONNECT_URL);
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it('on Android opens a browser tab and waits for the verified App Link', async () => {
    mockPlatform.OS = 'android';
    mockPlatform.Version = 36;
    mockPost.mockResolvedValueOnce({ url: CONNECT_URL });

    await expect(startGitHubInstallInApp()).resolves.toEqual({ kind: 'opened' });
    expect(mockOpenBrowser).toHaveBeenCalledWith(CONNECT_URL);
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it('knows which iOS versions take an https auth callback', () => {
    expect(iosSupportsHttpsAuthCallback('17.4')).toBe(true);
    expect(iosSupportsHttpsAuthCallback('18.0')).toBe(true);
    expect(iosSupportsHttpsAuthCallback('17.3.1')).toBe(false);
    expect(iosSupportsHttpsAuthCallback('15.1')).toBe(false);
  });

  it('never opens a start URL that is not our own site', async () => {
    mockPost.mockResolvedValueOnce({ url: 'https://evil.example/github/connect' });

    await expect(startGitHubInstallInApp()).resolves.toEqual({ kind: 'failed' });
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
    expect(mockOpenBrowser).not.toHaveBeenCalled();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('treats a closed install sheet as dismissed', async () => {
    mockPost.mockResolvedValueOnce({ url: CONNECT_URL });
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });

    await expect(startGitHubInstallInApp()).resolves.toEqual({ kind: 'dismissed' });
  });

  it('reads only a well-formed return', () => {
    expect(readGitHubInstallReturn({ state: STATE, code: 'c' })).toEqual({
      state: STATE,
      code: 'c',
    });
    expect(readGitHubInstallReturn({ code: 'c' })).toBeNull();
    expect(readGitHubInstallReturn({ state: 'short' })).toBeNull();
  });

  it('asks which installation is pending and finishes only when told to', async () => {
    mockPost
      .mockResolvedValueOnce({ status: 'ready', accountLogin: 'acme', accountType: 'Organization' })
      .mockResolvedValueOnce({ status: 'connected' });

    await expect(fetchPendingGitHubInstall(STATE)).resolves.toEqual({
      status: 'ready',
      accountLogin: 'acme',
      accountType: 'Organization',
    });
    expect(mockPost).toHaveBeenLastCalledWith('/api/github/install/pending', { state: STATE });

    await expect(completeGitHubInstall({ state: STATE, code: 'c' })).resolves.toBe('connected');
    expect(mockPost).toHaveBeenLastCalledWith('/api/github/install/complete', {
      state: STATE,
      code: 'c',
    });
  });

  it('explains every refused outcome', () => {
    expect(describeGitHubInstallOutcome('connected')).toBeNull();
    for (const outcome of [
      'already_linked',
      'ownership_failed',
      'denied',
      'invalid_state',
      'failed',
    ] as const) {
      expect(describeGitHubInstallOutcome(outcome)).toEqual(expect.any(String));
    }
  });
});
