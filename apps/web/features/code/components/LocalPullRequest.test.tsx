import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listLocalBranches = vi.fn();
vi.mock('@/features/desktop-host', () => ({
  listLocalBranches: (...args: unknown[]) => listLocalBranches(...args),
  pushLocalBranch: vi.fn(),
}));

const readLocalPullRequest = vi.fn();
const openLocalPullRequest = vi.fn();
vi.mock('../services/local-pull-request-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/local-pull-request-api')>()),
  readLocalPullRequest: (...args: unknown[]) => readLocalPullRequest(...args),
  openLocalPullRequest: (...args: unknown[]) => openLocalPullRequest(...args),
}));

const { LocalPullRequest } = await import('./LocalPullRequest');
const { LocalPullRequestRequestError } = await import('../services/local-pull-request-api');
const { pushLocalBranch } = await import('@/features/desktop-host');

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

describe('a pull request lookup that is overtaken by a newer one', () => {
  it('keeps the newer result when the older lookup settles last', async () => {
    let settleOlder: (value: ReturnType<typeof lookup>) => void = () => undefined;
    const older = new Promise<ReturnType<typeof lookup>>((resolve) => {
      settleOlder = resolve;
    });
    const newer = lookup('passing');
    newer.pullRequest.number = 13;
    newer.pullRequest.url = 'https://github.com/acme/app/pull/13';
    readLocalPullRequest.mockReturnValueOnce(older).mockResolvedValueOnce(newer);

    const { rerender } = render(<LocalPullRequest rootId="root-1" title="Fix" refreshKey={0} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    rerender(<LocalPullRequest rootId="root-1" title="Fix" refreshKey={1} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Pull request #13/u)).toBeInTheDocument();

    await act(async () => {
      settleOlder(lookup('pending'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/Pull request #13/u)).toBeInTheDocument();
    expect(screen.queryByText(/Pull request #12/u)).not.toBeInTheDocument();
  });
});

describe('opening a pull request when GitHub has to be reconnected', () => {
  const lookupWithoutPullRequest = { ...lookup('none'), pullRequest: null };

  async function openPullRequest() {
    readLocalPullRequest.mockResolvedValue(lookupWithoutPullRequest);
    vi.mocked(pushLocalBranch).mockResolvedValue({
      remoteUrl: 'https://github.com/acme/app.git',
      branch: 'fix',
      baseBranch: 'main',
    } as never);
    render(<LocalPullRequest rootId="root-1" title="Fix" refreshKey={0} />);
    await settle();
    await act(async () => {
      screen.getByRole('button', { name: /pull request/iu }).click();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('says why and offers the existing reconnect action', async () => {
    openLocalPullRequest.mockRejectedValue(
      new LocalPullRequestRequestError('Reconnect GitHub to push or open pull requests.', true),
    );

    await openPullRequest();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reconnect GitHub to push or open pull requests.',
    );
    expect(screen.getByRole('link', { name: 'Reconnect GitHub' })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/github/install/start'),
    );
  });

  it('offers no reconnect action for an unrelated failure', async () => {
    openLocalPullRequest.mockRejectedValue(
      new LocalPullRequestRequestError('GitHub refused to open the pull request.', false),
    );

    await openPullRequest();

    expect(screen.getByRole('alert')).toHaveTextContent('GitHub refused to open the pull request.');
    expect(screen.queryByRole('link', { name: 'Reconnect GitHub' })).not.toBeInTheDocument();
  });
});
