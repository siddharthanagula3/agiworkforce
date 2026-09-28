import 'server-only';

import {
  GitHubPullRequestError,
  createGitHubPullRequest,
  findOpenGitHubPullRequest,
  getGitHubPullRequestStatus,
  getInstallationAccessToken,
  type GitHubChecksState,
} from '@/lib/github-app';
import { getUserGithubInstallations } from '@/lib/user-connector-tools';

const GITHUB_REMOTE_RE =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const MAX_TITLE_LENGTH = 256;
const UNPROCESSABLE_STATUS = 422;
const ALREADY_EXISTS_MARKER = 'a pull request already exists';
const NO_COMMITS_MARKER = 'no commits between';
const PULL_REQUEST_PERMISSIONS = { contents: 'read', pull_requests: 'write' } as const;

export class LocalPullRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalPullRequestError';
  }
}

export interface LocalPullRequestState {
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged' | 'draft';
  checks: GitHubChecksState;
}

export interface LocalPullRequestLookup {
  connected: boolean;
  compareUrl: string;
  pullRequest: LocalPullRequestState | null;
}

interface RepositoryAccess {
  owner: string;
  repo: string;
  installationId: number | null;
  token: string | null;
}

function parseRemote(remoteUrl: unknown): { owner: string; repo: string } {
  const match = typeof remoteUrl === 'string' ? GITHUB_REMOTE_RE.exec(remoteUrl.trim()) : null;
  if (!match?.[1] || !match[2]) {
    throw new LocalPullRequestError('Pull requests can only be opened for a GitHub remote.');
  }
  return { owner: match[1], repo: match[2] };
}

function requireBranch(value: unknown, label: string): string {
  if (typeof value !== 'string' || !BRANCH_RE.test(value)) {
    throw new LocalPullRequestError(`The ${label} branch is not a branch name GitHub accepts.`);
  }
  return value;
}

async function repositoryAccess(userId: string, remoteUrl: unknown): Promise<RepositoryAccess> {
  const { owner, repo } = parseRemote(remoteUrl);
  const fullName = `${owner}/${repo}`.toLowerCase();
  const installation = (await getUserGithubInstallations(userId)).find((candidate) =>
    candidate.verifiedRepositories?.includes(fullName),
  );
  if (!installation) return { owner, repo, installationId: null, token: null };
  const token = await getInstallationAccessToken(installation.installationId, {
    repositories: [repo],
    permissions: PULL_REQUEST_PERMISSIONS,
  });
  return { owner, repo, installationId: installation.installationId, token };
}

function compareUrl(owner: string, repo: string, head: string, base: string | null): string {
  const range = base
    ? `${encodeURIComponent(base)}...${encodeURIComponent(head)}`
    : encodeURIComponent(head);
  return `https://github.com/${owner}/${repo}/compare/${range}?expand=1`;
}

async function describe(
  installationId: number,
  owner: string,
  repo: string,
  pullRequest: { number: number; url: string },
): Promise<LocalPullRequestState> {
  const status = await getGitHubPullRequestStatus(
    await getInstallationAccessToken(installationId),
    owner,
    repo,
    pullRequest.number,
  );
  return {
    number: pullRequest.number,
    url: pullRequest.url,
    state: status.merged
      ? 'merged'
      : status.state === 'closed'
        ? 'closed'
        : status.draft
          ? 'draft'
          : 'open',
    checks: status.checksState,
  };
}

export async function readLocalPullRequest(
  userId: string,
  remoteUrl: unknown,
  headValue: unknown,
  baseValue: unknown,
): Promise<LocalPullRequestLookup> {
  const head = requireBranch(headValue, 'head');
  const base =
    baseValue === null || baseValue === undefined ? null : requireBranch(baseValue, 'base');
  const { owner, repo, installationId, token } = await repositoryAccess(userId, remoteUrl);
  const link = compareUrl(owner, repo, head, base);
  if (!token || installationId === null) {
    return { connected: false, compareUrl: link, pullRequest: null };
  }
  const open = await findOpenGitHubPullRequest(token, owner, repo, head);
  return {
    connected: true,
    compareUrl: link,
    pullRequest: open ? await describe(installationId, owner, repo, open) : null,
  };
}

export async function openLocalPullRequest(
  userId: string,
  input: { remoteUrl: unknown; head: unknown; base: unknown; title: unknown },
): Promise<LocalPullRequestState> {
  const head = requireBranch(input.head, 'head');
  const base = requireBranch(input.base, 'base');
  if (head === base) {
    throw new LocalPullRequestError('Switch to a branch other than the base branch first.');
  }
  const title =
    typeof input.title === 'string' ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : '';
  if (!title) throw new LocalPullRequestError('A pull request needs a title.');
  const { owner, repo, installationId, token } = await repositoryAccess(userId, input.remoteUrl);
  if (!token || installationId === null) {
    throw new LocalPullRequestError(
      'The AGI GitHub App cannot reach this repository. Install it on the repository, or open the pull request on GitHub.',
    );
  }
  try {
    const created = await createGitHubPullRequest(token, {
      owner,
      repo,
      title,
      body: '',
      head,
      base,
    });
    return await describe(installationId, owner, repo, created);
  } catch (error) {
    if (!(error instanceof GitHubPullRequestError) || error.status !== UNPROCESSABLE_STATUS)
      throw error;
    const detail = error.detail.toLowerCase();
    if (detail.includes(ALREADY_EXISTS_MARKER)) {
      const existing = await findOpenGitHubPullRequest(token, owner, repo, head);
      if (existing) return describe(installationId, owner, repo, existing);
    }
    if (detail.includes(NO_COMMITS_MARKER)) {
      throw new LocalPullRequestError('This branch has no commits the base branch lacks yet.');
    }
    throw new LocalPullRequestError('GitHub refused to open the pull request.');
  }
}
