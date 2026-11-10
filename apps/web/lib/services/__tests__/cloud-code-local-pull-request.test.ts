import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createGitHubPullRequest: vi.fn(),
  findOpenGitHubPullRequest: vi.fn(),
  getGitHubPullRequestStatus: vi.fn(),
  getInstallationAccessToken: vi.fn(),
  getUserGithubInstallations: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/github-app', () => ({
  GitHubPullRequestError: class GitHubPullRequestError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail);
    }
  },
  createGitHubPullRequest: mocks.createGitHubPullRequest,
  findOpenGitHubPullRequest: mocks.findOpenGitHubPullRequest,
  getGitHubPullRequestStatus: mocks.getGitHubPullRequestStatus,
  getInstallationAccessToken: mocks.getInstallationAccessToken,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getUserGithubInstallations: mocks.getUserGithubInstallations,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}));

const { LocalPullRequestError, openLocalPullRequest, readLocalPullRequest } =
  await import('../cloud-code-local-pull-request');

const input = {
  remoteUrl: 'https://github.com/acme/app.git',
  head: 'fix',
  base: 'main',
  title: 'Fix it',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserGithubInstallations.mockResolvedValue([
    { installationId: 7, verifiedRepositories: ['acme/app'], writableRepositories: ['acme/app'] },
  ]);
  mocks.getInstallationAccessToken.mockResolvedValue('token');
  mocks.createGitHubPullRequest.mockResolvedValue({
    number: 12,
    url: 'https://github.com/acme/app/pull/12',
  });
});

describe('opening a local session pull request', () => {
  it('returns the created pull request with its status', async () => {
    mocks.getGitHubPullRequestStatus.mockResolvedValue({
      merged: false,
      state: 'open',
      draft: false,
      checksState: 'pending',
    });
    await expect(openLocalPullRequest('user-1', input)).resolves.toEqual({
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      state: 'open',
      checks: 'pending',
    });
  });

  it('still returns the created pull request when its status cannot be read', async () => {
    mocks.getGitHubPullRequestStatus.mockRejectedValue(new Error('status read failed'));
    await expect(openLocalPullRequest('user-1', input)).resolves.toEqual({
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      state: 'open',
      checks: 'none',
    });
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it('still returns the created pull request when the status token cannot be minted', async () => {
    mocks.getInstallationAccessToken
      .mockResolvedValueOnce('token')
      .mockRejectedValueOnce(new Error('token failed'));
    await expect(openLocalPullRequest('user-1', input)).resolves.toMatchObject({
      number: 12,
      state: 'open',
    });
  });

  it('keeps a failed creation a failure', async () => {
    mocks.createGitHubPullRequest.mockRejectedValue(new Error('GitHub is down'));
    await expect(openLocalPullRequest('user-1', input)).rejects.toThrow('GitHub is down');
  });

  it('asks the reader to reconnect GitHub when the link never recorded what it can push to', async () => {
    mocks.getUserGithubInstallations.mockResolvedValue([
      { installationId: 7, verifiedRepositories: ['acme/app'], writableRepositories: null },
    ]);

    const failure = await openLocalPullRequest('user-1', input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LocalPullRequestError);
    expect(failure).toMatchObject({
      reason: 'github_reconnect_required',
      message: expect.stringMatching(/^Reconnect GitHub to push or open pull requests/),
    });
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
    expect(mocks.createGitHubPullRequest).not.toHaveBeenCalled();
  });

  it('refuses a repository the account can see but not push to', async () => {
    mocks.getUserGithubInstallations.mockResolvedValue([
      { installationId: 7, verifiedRepositories: ['acme/app'], writableRepositories: [] },
    ]);

    await expect(openLocalPullRequest('user-1', input)).rejects.toThrow(
      /Your GitHub account cannot push to acme\/app/,
    );
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
    expect(mocks.createGitHubPullRequest).not.toHaveBeenCalled();
  });

  it('mints a write token only for a repository the account can push to', async () => {
    mocks.getGitHubPullRequestStatus.mockResolvedValue({
      merged: false,
      state: 'open',
      draft: false,
      checksState: 'none',
    });

    await openLocalPullRequest('user-1', input);

    expect(mocks.getInstallationAccessToken).toHaveBeenNthCalledWith(1, 7, {
      repositories: ['app'],
      permissions: { contents: 'read', pull_requests: 'write' },
    });
  });
});

describe('looking up a local session pull request', () => {
  it('still reads with a read-only token for a link that cannot push', async () => {
    mocks.getUserGithubInstallations.mockResolvedValue([
      { installationId: 7, verifiedRepositories: ['acme/app'], writableRepositories: null },
    ]);
    mocks.findOpenGitHubPullRequest.mockResolvedValue(null);

    await expect(
      readLocalPullRequest('user-1', input.remoteUrl, 'fix', 'main'),
    ).resolves.toMatchObject({ connected: true, pullRequest: null });

    expect(mocks.getInstallationAccessToken).toHaveBeenCalledWith(7, {
      repositories: ['app'],
      permissions: { pull_requests: 'read' },
    });
  });
});
