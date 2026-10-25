import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listLocalBranches = vi.fn();
vi.mock('@/features/desktop-host', () => ({
  listLocalBranches: (...args: unknown[]) => listLocalBranches(...args),
  pushLocalBranch: vi.fn(),
}));

const readLocalPullRequest = vi.fn();
vi.mock('../services/local-pull-request-api', () => ({
  readLocalPullRequest: (...args: unknown[]) => readLocalPullRequest(...args),
  openLocalPullRequest: vi.fn(),
}));

const { LocalPullRequest } = await import('./LocalPullRequest');

function lookup(checks: 'passing' | 'failing' | 'pending' | 'none', state = 'open') {
  return {
    connected: true,
    compareUrl: 'https://github.com/acme/app/compare/main...fix',
    pullRequest: { number: 12, url: 'https://github.com/acme/app/pull/12', state, checks },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  listLocalBranches.mockResolvedValue({
    current: 'fix',
    baseBranch: 'main',
    remoteUrl: 'https://github.com/acme/app.git',
    branches: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function settle() {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
}

describe('the checks on a local session pull request', () => {
  it('reads the checks again while they are running, and stops once they finish', async () => {
    readLocalPullRequest
      .mockResolvedValueOnce(lookup('pending'))
      .mockResolvedValueOnce(lookup('passing'));
    render(<LocalPullRequest rootId="root-1" title="Fix" refreshKey={0} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Pull request #12/u)).toBeInTheDocument();
    expect(readLocalPullRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(readLocalPullRequest).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(readLocalPullRequest).toHaveBeenCalledTimes(2);
  });

  it('does not keep reading a merged pull request', async () => {
    readLocalPullRequest.mockResolvedValue(lookup('pending', 'merged'));
    render(<LocalPullRequest rootId="root-1" title="Fix" refreshKey={0} />);
    await settle();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(readLocalPullRequest).toHaveBeenCalledTimes(1);
  });
});

describe('a pull request from changes on no branch', () => {
  it('offers to create a branch and passes the session title for its name', async () => {
    const { pushLocalBranch } = await import('@/features/desktop-host');
    const { openLocalPullRequest } = await import('../services/local-pull-request-api');
    listLocalBranches.mockResolvedValue({
      current: null,
      baseBranch: 'main',
      remoteUrl: 'https://github.com/acme/app.git',
      branches: [],
    });
    vi.mocked(pushLocalBranch).mockResolvedValue({
      branch: 'agi/fix-sign-in',
      remoteUrl: 'https://github.com/acme/app.git',
      baseBranch: 'main',
    });
    vi.mocked(openLocalPullRequest).mockResolvedValue({
      number: 3,
      url: 'https://github.com/acme/app/pull/3',
      state: 'open',
      checks: 'none',
    } as never);

    render(<LocalPullRequest rootId="root-1" title="Fix sign-in" refreshKey={0} />);
    await settle();

    const button = screen.getByRole('button', { name: 'Create branch and open pull request' });
    await act(async () => {
      button.click();
      await vi.runOnlyPendingTimersAsync();
    });

    expect(pushLocalBranch).toHaveBeenCalledWith('root-1', 'Fix sign-in');
    expect(readLocalPullRequest).not.toHaveBeenCalled();
    expect(openLocalPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ head: 'agi/fix-sign-in', base: 'main', title: 'Fix sign-in' }),
    );
  });
});
