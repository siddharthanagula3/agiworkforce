const mockPost = jest.fn();
const mockOpenAuthSession = jest.fn();
const mockOpenBrowser = jest.fn();
const mockPlatform = { OS: 'ios' as 'ios' | 'android' };

jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));
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
  readGitHubInstallReturn,
  startGitHubInstallInApp,
} from '../src/features/cloud-code/githubInstall';

const STATE = 'b'.repeat(64);
const INSTALL_URL = `https://github.com/apps/agi-workforce/installations/new?state=${'f'.repeat(64)}`;

describe('a GitHub app install started on the phone', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockOpenAuthSession.mockReset();
    mockOpenBrowser.mockReset();
    mockPlatform.OS = 'ios';
  });

  it('on iOS installs in an auth session and hands back what GitHub returned, unlinked', async () => {
    mockPost.mockResolvedValueOnce({ url: INSTALL_URL });
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `agiworkforce://github/installed?state=${STATE}&code=one-time-code`,
    });

    await expect(startGitHubInstallInApp()).resolves.toEqual({
      kind: 'returned',
      result: { state: STATE, code: 'one-time-code' },
    });
    expect(mockPost).toHaveBeenCalledWith('/api/github/install/app-start', { platform: 'ios' });
    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      INSTALL_URL,
      'agiworkforce://github/installed',
    );
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('on Android opens the install and waits for the verified App Link, never a scheme listener', async () => {
    mockPlatform.OS = 'android';
    mockPost.mockResolvedValueOnce({ url: INSTALL_URL });

    await expect(startGitHubInstallInApp()).resolves.toEqual({ kind: 'opened' });
    expect(mockPost).toHaveBeenCalledWith('/api/github/install/app-start', {
      platform: 'android',
    });
    expect(mockOpenBrowser).toHaveBeenCalledWith(INSTALL_URL);
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it('never opens an install URL that is not on github.com', async () => {
    mockPost.mockResolvedValueOnce({ url: 'https://evil.example/installations/new' });

    await expect(startGitHubInstallInApp()).resolves.toEqual({ kind: 'failed' });
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  it('treats a closed install sheet as dismissed', async () => {
    mockPost.mockResolvedValueOnce({ url: INSTALL_URL });
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
