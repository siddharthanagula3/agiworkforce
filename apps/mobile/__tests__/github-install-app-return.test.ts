const mockPost = jest.fn();
const mockOpenAuthSession = jest.fn();

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
}));

import {
  completeGitHubInstall,
  connectGitHubInApp,
  describeGitHubInstallOutcome,
} from '../src/features/cloud-code/githubInstall';

const STATE = 'b'.repeat(64);
const INSTALL_URL = `https://github.com/apps/agi-workforce/installations/new?state=${'f'.repeat(64)}`;

describe('a GitHub app install that returns to the app', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockOpenAuthSession.mockReset();
  });

  it('starts over the signed-in session, installs in an auth session and finishes in the app', async () => {
    mockPost
      .mockResolvedValueOnce({ url: INSTALL_URL })
      .mockResolvedValueOnce({ status: 'connected' });
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: `agiworkforce://github/installed?state=${STATE}&code=one-time-code`,
    });

    await expect(connectGitHubInApp()).resolves.toBe('connected');

    expect(mockPost).toHaveBeenNthCalledWith(1, '/api/github/install/app-start');
    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      INSTALL_URL,
      'agiworkforce://github/installed',
    );
    expect(mockPost).toHaveBeenNthCalledWith(2, '/api/github/install/complete', {
      state: STATE,
      code: 'one-time-code',
    });
  });

  it('never opens an install URL that is not on github.com', async () => {
    mockPost.mockResolvedValueOnce({ url: 'https://evil.example/installations/new' });

    await expect(connectGitHubInApp()).resolves.toBe('failed');
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it('treats a closed install sheet as dismissed without finishing anything', async () => {
    mockPost.mockResolvedValueOnce({ url: INSTALL_URL });
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });

    await expect(connectGitHubInApp()).resolves.toBe('dismissed');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('does not post a return link without a valid state', async () => {
    await expect(completeGitHubInstall('agiworkforce://github/installed?code=x')).resolves.toBe(
      'invalid_state',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('passes a denial through and explains every refused outcome', async () => {
    mockPost.mockResolvedValueOnce({ status: 'denied' });

    await expect(
      completeGitHubInstall(`agiworkforce://github/installed?state=${STATE}&error=denied`),
    ).resolves.toBe('denied');
    expect(mockPost).toHaveBeenCalledWith('/api/github/install/complete', {
      state: STATE,
      error: 'denied',
    });
    expect(describeGitHubInstallOutcome('connected')).toBeNull();
    expect(describeGitHubInstallOutcome('dismissed')).toBeNull();
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
