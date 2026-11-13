import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudCodeApi } from '@agiworkforce/cloud-contracts';
import type { CloudCodeSharedSession } from '@agiworkforce/types';

const identity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'account-a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'account-a' },
    session: { id: 'session-a', user: { id: 'account-a' }, getToken: async () => 'token-a' },
  },
}));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => identity.auth, useClerk: () => identity.sdk }));
vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { SharedCodeSessionPage } from './SharedCodeSessionPage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function shared(title: string): CloudCodeSharedSession {
  return {
    title,
    terminalEntries: [],
    turns: [],
    visibility: 'public',
    ownerName: null,
    workingBranch: null,
    baseBranch: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    createdAt: '2026-07-30T12:00:00Z',
    repositoryUrl: null,
    updatedAt: '2026-07-30T12:00:00Z',
    ownerName: null,
    workingBranch: null,
    baseBranch: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    createdAt: '2026-07-30T12:00:00Z',
  } satisfies CloudCodeSharedSession;
}

beforeEach(() => {
  identity.auth = { isLoaded: true, isSignedIn: true, userId: 'account-a', sessionId: 'session-a' };
  identity.sdk.user = { id: 'account-a' };
  identity.sdk.session = {
    id: 'session-a',
    user: { id: 'account-a' },
    getToken: async () => 'token-a',
  };
});

describe('shared Code session ownership', () => {
  it.each(['isLoaded', 'isSignedIn'] as const)(
    'loads the share when %s becomes ready with retained identity ids',
    async (readiness) => {
      identity.auth = { ...identity.auth, [readiness]: false };
      const api = {
        openShared: vi.fn().mockResolvedValue(shared('Ready account share')),
      } as unknown as CloudCodeApi;
      const { rerender } = render(<SharedCodeSessionPage token="same" api={api} />);
      await act(async () => {});
      expect(api.openShared).not.toHaveBeenCalled();
      identity.auth = { ...identity.auth, [readiness]: true };
      rerender(<SharedCodeSessionPage token="same" api={api} />);
      await act(async () => {});
      expect(api.openShared).toHaveBeenCalledOnce();
      expect(screen.getByRole('heading', { name: 'Ready account share' })).toBeTruthy();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores old token %s after navigation',
    async (outcome) => {
      const old = deferred<CloudCodeSharedSession>();
      const next = deferred<CloudCodeSharedSession>();
      const api = {
        openShared: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise),
      } as unknown as CloudCodeApi;
      const { rerender } = render(<SharedCodeSessionPage token="old" api={api} />);
      rerender(<SharedCodeSessionPage token="next" api={api} />);
      await act(async () => {
        next.resolve(shared('Current shared session'));
      });
      await act(async () => {
        if (outcome === 'resolve') old.resolve(shared('Old private title'));
        else old.reject(new Error('Old private failure'));
      });
      expect(screen.getByRole('heading', { name: 'Current shared session' })).toBeTruthy();
      expect(screen.queryByText('Old private title')).toBeNull();
      expect(screen.queryByText('Old private failure')).toBeNull();
    },
  );

  it('clears a loaded share synchronously when the authenticated session changes', async () => {
    const next = deferred<CloudCodeSharedSession>();
    const api = {
      openShared: vi
        .fn()
        .mockResolvedValueOnce(shared('Account A share'))
        .mockReturnValueOnce(next.promise),
    } as unknown as CloudCodeApi;
    const { rerender } = render(<SharedCodeSessionPage token="same" api={api} />);
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Account A share' })).toBeTruthy();
    identity.auth = { ...identity.auth, sessionId: 'session-b' };
    identity.sdk.session = { ...identity.sdk.session, id: 'session-b' };
    rerender(<SharedCodeSessionPage token="same" api={api} />);
    expect(screen.queryByRole('heading', { name: 'Account A share' })).toBeNull();
    await act(async () => {
      next.resolve(shared('New session share'));
    });
    expect(screen.getByRole('heading', { name: 'New session share' })).toBeTruthy();
  });
});

describe('shared Code session history window', () => {
  const NOTICE = 'Earlier turns of this session are not shown here.';

  it('says earlier turns are missing when the server returned only the newest ones', async () => {
    const api = {
      openShared: vi.fn().mockResolvedValue({ ...shared('Long share'), turnsTruncated: true }),
    } as unknown as CloudCodeApi;
    render(<SharedCodeSessionPage token="long" api={api} />);
    await act(async () => {});
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it('shows no notice for a complete transcript', async () => {
    const api = {
      openShared: vi.fn().mockResolvedValue(shared('Short share')),
    } as unknown as CloudCodeApi;
    render(<SharedCodeSessionPage token="short" api={api} />);
    await act(async () => {});
    expect(screen.getByRole('heading', { name: 'Short share' })).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
