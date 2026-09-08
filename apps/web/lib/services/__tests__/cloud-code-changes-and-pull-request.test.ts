import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetE2BExecutor,
  mockKillE2BSession,
  mockCreatePullRequest,
  mockFindOpenPullRequest,
  mockDefaultBranch,
  mockInstallationToken,
  mockUserInstallations,
} = vi.hoisted(() => ({
  mockGetE2BExecutor: vi.fn(),
  mockKillE2BSession: vi.fn(),
  mockCreatePullRequest: vi.fn(),
  mockFindOpenPullRequest: vi.fn(),
  mockDefaultBranch: vi.fn(),
  mockInstallationToken: vi.fn(),
  mockUserInstallations: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: mockGetE2BExecutor,
  killE2BSession: mockKillE2BSession,
}));
vi.mock('@/lib/github-app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/github-app')>();
  return {
    ...actual,
    createGitHubPullRequest: mockCreatePullRequest,
    findOpenGitHubPullRequest: mockFindOpenPullRequest,
    getGitHubRepositoryDefaultBranch: mockDefaultBranch,
    getInstallationAccessToken: mockInstallationToken,
    isGitHubAppConfigured: () => true,
    isGitHubInstallationLinkingAvailable: () => true,
  };
});
vi.mock('@/lib/user-connector-tools', () => ({
  getUserGithubInstallations: mockUserInstallations,
}));

import { GitHubPullRequestError } from '@/lib/github-app';
import {
  CloudCodeConflictError,
  CloudCodeValidationError,
  openCloudCodeSessionPullRequest,
  parseGitPorcelainStatus,
  readCloudCodeSessionChanges,
} from '../cloud-code-session-service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = { userId: 'user-1', organizationId: null };
const PLAN = 'pro';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: 'user-1',
    organization_id: null,
    request_id: 'request_123456',
    title: 'Fix the flaky test',
    repository_url: 'https://github.com/acme/widgets.git',
    repository_branch: 'main',
    network_access: 'trusted',
    runtime_id: null,
    extra_hosts: [],
    state: 'ready',
    workspace_path: '/home/user/project',
    working_branch: 'agi/fix-the-flaky-test-11111111',
    base_branch: 'main',
    pull_request_url: null,
    pull_request_number: null,
    archived_at: null,
    context_input_tokens: 0,
    context_output_tokens: 0,
    last_error: null,
    run_lease_token: null,
    run_lease_expires_at: null,
    created_at: '2026-09-07T12:00:00.000Z',
    updated_at: '2026-09-07T12:00:00.000Z',
    closed_at: null,
    ...overrides,
  };
}

function commandResult(stdout: string, ok = true) {
  return { ok, output: stdout, stdout, stderr: ok ? '' : 'failed', exitCode: ok ? 0 : 1 };
}

interface QueryCall {
  sql: string;
  params: unknown[];
}

function stubDb(row: Record<string, unknown>, calls: QueryCall[] = []) {
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/from cloud_code_agent_turns/.test(sql)) {
        return [{ final_message: 'Renamed the fixture and pinned the clock.', goal: 'fix it' }];
      }
      if (/^\s*update cloud_code_sessions/.test(sql)) {
        // Every update answers with the fixture row, so a claim and a release
        // return the same session the test set up rather than a default one.
        const pullRequestUrl = params[1];
        const pullRequestNumber = params[2];
        return [
          /pull_request_url/.test(sql)
            ? { ...row, pull_request_url: pullRequestUrl, pull_request_number: pullRequestNumber }
            : row,
        ];
      }
      return [row];
    }),
  };
}

const gitExecutor = () => ({
  status: vi.fn(async () => commandResult(' M src/app.ts\n?? notes.md\n')),
  diff: vi.fn(async () => commandResult('diff --git a/src/app.ts b/src/app.ts\n')),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUserInstallations.mockResolvedValue([{ installationId: 11, login: 'acme' }]);
  mockInstallationToken.mockResolvedValue('installation-token');
  mockDefaultBranch.mockResolvedValue('main');
});

describe('git porcelain status parsing', () => {
  it('names every state the panel groups by', () => {
    expect(
      parseGitPorcelainStatus(
        [
          ' M src/app.ts',
          'A  src/added.ts',
          ' D src/gone.ts',
          'R  src/old.ts -> src/new.ts',
          '?? notes.md',
          'UU src/conflict.ts',
        ].join('\n'),
      ),
    ).toEqual([
      { path: 'src/app.ts', state: 'modified' },
      { path: 'src/added.ts', state: 'added' },
      { path: 'src/gone.ts', state: 'deleted' },
      { path: 'src/new.ts', state: 'renamed' },
      { path: 'notes.md', state: 'untracked' },
      { path: 'src/conflict.ts', state: 'conflicted' },
    ]);
  });

  it('unquotes a path git escaped and ignores empty lines', () => {
    expect(parseGitPorcelainStatus('?? "src/a b.ts"\n\n')).toEqual([
      { path: 'src/a b.ts', state: 'untracked' },
    ]);
  });
});

describe('readCloudCodeSessionChanges', () => {
  it('reads status and diff against the remote base without writing a terminal entry', async () => {
    const git = gitExecutor();
    mockGetE2BExecutor.mockResolvedValue({ git, pause: vi.fn(), dispose: vi.fn() });
    const db = stubDb(sessionRow());

    const changes = await readCloudCodeSessionChanges(db as never, OWNER, SESSION_ID, PLAN);

    expect(changes.base).toBe('main');
    expect(changes.workingBranch).toBe('agi/fix-the-flaky-test-11111111');
    expect(changes.files).toEqual([
      { path: 'src/app.ts', state: 'modified' },
      { path: 'notes.md', state: 'untracked' },
    ]);
    expect(changes.diff).toContain('diff --git');
    expect(git.diff).toHaveBeenCalledWith({
      path: '/home/user/project',
      baseRef: 'origin/main',
    });
    expect(db.calls.some((call) => /insert into cloud_code_terminal_entries/.test(call.sql))).toBe(
      false,
    );
  });

  it('names the base as a branch a reader would say, not as a git ref', async () => {
    const git = gitExecutor();
    mockGetE2BExecutor.mockResolvedValue({ git, pause: vi.fn(), dispose: vi.fn() });

    const changes = await readCloudCodeSessionChanges(
      stubDb(sessionRow()) as never,
      OWNER,
      SESSION_ID,
      PLAN,
    );

    expect(changes.base).toBe('main');
    expect(changes.base).not.toContain('origin/');
    expect(changes.base).not.toBe('HEAD');
  });

  it('falls back to the branch the request asked for when none was recorded', async () => {
    const git = gitExecutor();
    mockGetE2BExecutor.mockResolvedValue({ git, pause: vi.fn(), dispose: vi.fn() });

    const changes = await readCloudCodeSessionChanges(
      stubDb(sessionRow({ base_branch: null, repository_branch: 'release/2.1' })) as never,
      OWNER,
      SESSION_ID,
      PLAN,
    );

    expect(changes.base).toBe('release/2.1');
    expect(git.diff).toHaveBeenCalledWith({
      path: '/home/user/project',
      baseRef: 'origin/release/2.1',
    });
  });

  it('compares against the last commit and names no base when neither is known', async () => {
    const git = gitExecutor();
    mockGetE2BExecutor.mockResolvedValue({ git, pause: vi.fn(), dispose: vi.fn() });

    const changes = await readCloudCodeSessionChanges(
      stubDb(sessionRow({ base_branch: null, repository_branch: null })) as never,
      OWNER,
      SESSION_ID,
      PLAN,
    );

    expect(changes.base).toBeNull();
    expect(git.diff).toHaveBeenCalledWith({ path: '/home/user/project' });
  });

  it('falls back to the last commit and says so when the remote base is unknown', async () => {
    const git = gitExecutor();
    git.diff = vi
      .fn()
      .mockResolvedValueOnce(commandResult('', false))
      .mockResolvedValueOnce(commandResult('diff --git a/x b/x\n'));
    mockGetE2BExecutor.mockResolvedValue({ git, pause: vi.fn(), dispose: vi.fn() });

    const changes = await readCloudCodeSessionChanges(
      stubDb(sessionRow()) as never,
      OWNER,
      SESSION_ID,
      PLAN,
    );

    expect(changes.base).toBeNull();
    expect(git.diff).toHaveBeenLastCalledWith({ path: '/home/user/project' });
  });

  it('answers empty for a session with no repository without attaching a sandbox', async () => {
    const changes = await readCloudCodeSessionChanges(
      stubDb(sessionRow({ repository_url: null, working_branch: null })) as never,
      OWNER,
      SESSION_ID,
      PLAN,
    );

    expect(changes).toMatchObject({ files: [], diff: '', base: null });
    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
  });

  it('refuses a closed session', async () => {
    await expect(
      readCloudCodeSessionChanges(
        stubDb(sessionRow({ state: 'closed' })) as never,
        OWNER,
        SESSION_ID,
        PLAN,
      ),
    ).rejects.toThrow(CloudCodeConflictError);
  });

  it('refuses an archived session and names unarchive', async () => {
    await expect(
      readCloudCodeSessionChanges(
        stubDb(sessionRow({ archived_at: '2026-09-07T13:00:00.000Z' })) as never,
        OWNER,
        SESSION_ID,
        PLAN,
      ),
    ).rejects.toThrow(/unarchive/i);
  });
});

describe('openCloudCodeSessionPullRequest', () => {
  it('opens one from the working branch and records it', async () => {
    mockCreatePullRequest.mockResolvedValue({
      number: 7,
      url: 'https://github.com/acme/widgets/pull/7',
    });
    const db = stubDb(sessionRow());

    const result = await openCloudCodeSessionPullRequest(db as never, OWNER, SESSION_ID);

    expect(result).toMatchObject({
      number: 7,
      url: 'https://github.com/acme/widgets/pull/7',
      alreadyOpen: false,
    });
    expect(mockCreatePullRequest).toHaveBeenCalledWith('installation-token', {
      owner: 'acme',
      repo: 'widgets',
      title: 'Fix the flaky test',
      body: 'Renamed the fixture and pinned the clock.',
      head: 'agi/fix-the-flaky-test-11111111',
      base: 'main',
    });
    expect(db.calls.some((call) => /set pull_request_url/.test(call.sql))).toBe(true);
  });

  it('answers from the row on a second call without asking GitHub again', async () => {
    const result = await openCloudCodeSessionPullRequest(
      stubDb(
        sessionRow({
          pull_request_url: 'https://github.com/acme/widgets/pull/7',
          pull_request_number: 7,
        }),
      ) as never,
      OWNER,
      SESSION_ID,
    );

    expect(result).toMatchObject({ number: 7, alreadyOpen: true });
    expect(mockCreatePullRequest).not.toHaveBeenCalled();
  });

  it('records the pull request GitHub says already exists rather than failing', async () => {
    mockCreatePullRequest.mockRejectedValue(
      new GitHubPullRequestError(422, 'A pull request already exists for acme:agi/fix.'),
    );
    mockFindOpenPullRequest.mockResolvedValue({
      number: 9,
      url: 'https://github.com/acme/widgets/pull/9',
    });
    const db = stubDb(sessionRow());

    const result = await openCloudCodeSessionPullRequest(db as never, OWNER, SESSION_ID);

    expect(result).toMatchObject({ number: 9, alreadyOpen: true });
    expect(db.calls.some((call) => /set pull_request_url/.test(call.sql))).toBe(true);
  });

  it('says there is nothing to open when the branch carries no commits', async () => {
    mockCreatePullRequest.mockRejectedValue(
      new GitHubPullRequestError(422, 'No commits between main and agi/fix.'),
    );

    await expect(
      openCloudCodeSessionPullRequest(stubDb(sessionRow()) as never, OWNER, SESSION_ID),
    ).rejects.toThrow(/no commits/i);
  });

  it('refuses a session with no working branch', async () => {
    await expect(
      openCloudCodeSessionPullRequest(
        stubDb(sessionRow({ working_branch: null })) as never,
        OWNER,
        SESSION_ID,
      ),
    ).rejects.toThrow(CloudCodeValidationError);
  });

  it('refuses an archived session', async () => {
    await expect(
      openCloudCodeSessionPullRequest(
        stubDb(sessionRow({ archived_at: '2026-09-07T13:00:00.000Z' })) as never,
        OWNER,
        SESSION_ID,
      ),
    ).rejects.toThrow(CloudCodeConflictError);
  });

  it('refuses when no connected installation can reach the repository', async () => {
    mockUserInstallations.mockResolvedValue([]);

    await expect(
      openCloudCodeSessionPullRequest(stubDb(sessionRow()) as never, OWNER, SESSION_ID),
    ).rejects.toThrow(/no connected github installation/i);
  });
});
