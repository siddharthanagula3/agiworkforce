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
