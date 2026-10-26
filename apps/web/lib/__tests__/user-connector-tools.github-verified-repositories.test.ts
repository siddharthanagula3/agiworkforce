import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => true,
}));

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  neonQuery: vi.fn(),
  getInstallationAccessToken: vi.fn(async (_installationId: number) => 'installation-token'),
  getPrDiff: vi.fn(async (..._args: unknown[]) => 'diff --git a/x b/x'),
  postIssueComment: vi.fn(async (..._args: unknown[]) => undefined),
  postPrReview: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/server/neon-db', () => {
  const adapter = {
    query: (...args: unknown[]) => mocks.neonQuery(...args),
    execute: async () => 0,
    transaction: async (callback: (tx: unknown) => unknown) => callback(adapter),
  };
  return { getNeonDb: () => adapter };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/github-app', () => ({
  GitHubWriteOutcomeUnknownError: class GitHubWriteOutcomeUnknownError extends Error {},
  issueCommentPostedSince: vi.fn(() => false),
  pullRequestReviewPostedSince: vi.fn(() => false),
  getInstallationAccessToken: (installationId: number) =>
    mocks.getInstallationAccessToken(installationId),
  getPrDiff: (...args: unknown[]) => mocks.getPrDiff(...args),
  isGitHubAppConfigured: () => true,
  isGitHubInstallationLinkingAvailable: () => true,
  postIssueComment: (...args: unknown[]) => mocks.postIssueComment(...args),
  postPrReview: (...args: unknown[]) => mocks.postPrReview(...args),
}));
vi.mock('@agiworkforce/mcp', () => ({
  buildMcpToolCatalog: vi.fn(),
  connectMcpServer: vi.fn(),
}));

import { makeUserConnectorExecutor } from '../user-connector-tools';

type TypesModule = typeof import('@agiworkforce/types');

const ACME_INSTALLATION = {
  installation_id: '41',
  account_login: 'acme',
  verified_repositories: ['acme/docs'],
};

function linkInstallations(rows: Array<Record<string, unknown>>): void {
  mocks.neonQuery.mockImplementation((sql: string) =>
    Promise.resolve(String(sql).includes('from github_installations') ? rows : []),
  );
}

describe('GitHub connector tools stay inside the repositories the linking account proved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkInstallations([ACME_INSTALLATION]);
  });

  it('reads a pull request diff in a verified repository', async () => {
    const result = await makeUserConnectorExecutor('user-1')('github', 'get_pull_request_diff', {
      owner: 'Acme',
      repo: 'Docs',
      pull_number: 12,
    });

    expect(result.isError).toBe(false);
    expect(mocks.getInstallationAccessToken).toHaveBeenCalledWith(41);
    expect(mocks.getPrDiff).toHaveBeenCalledWith('installation-token', 'Acme', 'Docs', 12);
  });

  it('refuses a diff from another repository of the same installation', async () => {
    const result = await makeUserConnectorExecutor('user-1')('github', 'get_pull_request_diff', {
      owner: 'acme',
      repo: 'secret-backend',
      pull_number: 12,
    });

    expect(result.isError).toBe(true);
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
    expect(mocks.getPrDiff).not.toHaveBeenCalled();
  });

  it('refuses to comment or review outside the verified repositories', async () => {
    const execute = makeUserConnectorExecutor('user-1');

    const comment = await execute('github', 'post_issue_comment', {
      owner: 'acme',
      repo: 'secret-backend',
      issue_number: 3,
      body: 'hello',
    });
    const review = await execute('github', 'post_pull_request_review', {
      owner: 'acme',
      repo: 'secret-backend',
      pull_number: 4,
      body: 'looks good',
    });

    expect(comment.isError).toBe(true);
    expect(review.isError).toBe(true);
    expect(mocks.postIssueComment).not.toHaveBeenCalled();
    expect(mocks.postPrReview).not.toHaveBeenCalled();
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('does not fall back to the only installation for an owner it does not cover', async () => {
    const result = await makeUserConnectorExecutor('user-1')('github', 'get_pull_request_diff', {
      owner: 'someone-else',
      repo: 'docs',
      pull_number: 1,
    });

    expect(result.isError).toBe(true);
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('refuses an installation linked before repository access was proved', async () => {
    linkInstallations([{ ...ACME_INSTALLATION, verified_repositories: null }]);

    const result = await makeUserConnectorExecutor('user-1')('github', 'get_pull_request_diff', {
      owner: 'acme',
      repo: 'docs',
      pull_number: 12,
    });

    expect(result.isError).toBe(true);
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('uses the installation whose verified set holds the repository', async () => {
    linkInstallations([
      ACME_INSTALLATION,
      { installation_id: '77', account_login: 'acme', verified_repositories: ['acme/api'] },
    ]);

    await makeUserConnectorExecutor('user-1')('github', 'get_pull_request_diff', {
      owner: 'acme',
      repo: 'api',
      pull_number: 5,
    });

    expect(mocks.getInstallationAccessToken).toHaveBeenCalledWith(77);
  });
});
