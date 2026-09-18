import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: vi.fn(async () => []), execute: vi.fn() }),
}));

import {
  GitHubAuthorizationRevokedError,
  createGitHubPullRequest,
  getGitHubIssue,
  getGitHubPullRequestStatus,
  listGitHubIssues,
  parseLinkedIssues,
} from './github-app';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createGitHubPullRequest', () => {
  it('opens a draft when the caller asks for one', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ number: 3, html_url: 'https://github.com/acme/widgets/pull/3' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createGitHubPullRequest('token', {
      owner: 'acme',
      repo: 'widgets',
      title: 'Fix it',
      body: 'grounded body',
      head: 'agi/fix',
      base: 'main',
      draft: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ draft: true });
  });

  it('sends draft false rather than omitting it, so the default is stated', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ number: 4, html_url: 'https://github.com/acme/widgets/pull/4' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createGitHubPullRequest('token', {
      owner: 'acme',
      repo: 'widgets',
      title: 'Fix it',
      body: 'grounded body',
      head: 'agi/fix',
      base: 'main',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ draft: false });
  });
});

describe('listGitHubIssues', () => {
  it('drops the pull requests GitHub returns from the issues endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          {
            number: 1,
            title: 'Real issue',
            body: 'text',
            state: 'open',
            html_url: 'https://github.com/acme/widgets/issues/1',
            labels: ['bug', { name: 'p1' }],
          },
          {
            number: 2,
            title: 'A pull request',
            body: null,
            state: 'open',
            html_url: 'https://github.com/acme/widgets/pull/2',
            labels: [],
            pull_request: { url: 'x' },
          },
        ]),
      ),
    );

    const issues = await listGitHubIssues('token', 'acme', 'widgets');

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Real issue',
        body: 'text',
        state: 'open',
        url: 'https://github.com/acme/widgets/issues/1',
        labels: ['bug', 'p1'],
      },
    ]);
  });

  it('refuses a repository path segment that is not one', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listGitHubIssues('token', '../../etc', 'widgets')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for reauthorization when GitHub refuses the credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'Bad credentials' }, 403)),
    );

    await expect(listGitHubIssues('token', 'acme', 'widgets')).rejects.toBeInstanceOf(
      GitHubAuthorizationRevokedError,
    );
  });
});

describe('getGitHubIssue', () => {
  it('refuses an issue number that is not a positive integer', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getGitHubIssue('token', 'acme', 'widgets', 0)).rejects.toThrow(/issue number/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getGitHubPullRequestStatus', () => {
  it('reports draft, review, checks, merge state and the issues it closes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('/reviews')) {
        return jsonResponse([{ state: 'COMMENTED' }, { state: 'CHANGES_REQUESTED' }]);
      }
      if (path.includes('/check-runs')) {
        return jsonResponse({
          check_runs: [
            { name: 'lint', status: 'completed', conclusion: 'success' },
            { name: 'tests', status: 'completed', conclusion: 'failure' },
          ],
        });
      }
      return jsonResponse({
        number: 7,
        state: 'open',
        draft: true,
        merged: false,
        mergeable_state: 'blocked',
        head: { sha: 'abc123' },
        body: 'Closes #42 and fixes acme/widgets#43',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getGitHubPullRequestStatus('token', 'acme', 'widgets', 7)).resolves.toEqual({
      number: 7,
      state: 'open',
      draft: true,
      merged: false,
      mergeableState: 'blocked',
      headSha: 'abc123',
      reviewState: 'changes_requested',
      checksState: 'failing',
      failedChecks: ['tests'],
      linkedIssues: ['#42', 'acme/widgets#43'],
    });
  });

  it('calls a pull request with no checks none rather than passing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = String(url);
        if (path.includes('/reviews')) return jsonResponse([]);
        if (path.includes('/check-runs')) return jsonResponse({ check_runs: [] });
        return jsonResponse({
          number: 8,
          state: 'closed',
          merged: true,
          head: { sha: 'def' },
          body: null,
        });
      }),
    );

    await expect(getGitHubPullRequestStatus('token', 'acme', 'widgets', 8)).resolves.toMatchObject({
      checksState: 'none',
      reviewState: 'none',
      merged: true,
      linkedIssues: [],
    });
  });
});

describe('parseLinkedIssues', () => {
  it('reads only the keywords GitHub itself treats as links', () => {
    expect(parseLinkedIssues('Closes #1, fixes #2, resolved acme/w#3, mentions #4')).toEqual([
      '#1',
      '#2',
      'acme/w#3',
    ]);
  });
});
