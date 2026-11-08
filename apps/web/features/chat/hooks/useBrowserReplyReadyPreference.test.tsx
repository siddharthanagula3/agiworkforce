import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFERENCE_NAMESPACE_SAVED_EVENT } from '@/app/settings/_lib/preferences-client';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { useBrowserReplyReadyPreference } from './use-browser-reply-ready-preference';
type ScanModule0 = typeof import('@/app/settings/_lib/preferences-client');

const fetchOwnedPreferenceNamespace = vi.hoisted(() => vi.fn());
const identity = vi.hoisted(() => ({ session: null as SessionAuthority | null }));
type SessionSnapshotModule = typeof import('@/lib/identity/useSessionSnapshot');
vi.mock('@/lib/identity/useSessionSnapshot', async (original) => ({
  ...(await original<SessionSnapshotModule>()),
  useSessionSnapshot: () => () => identity.session,
}));

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, fetchOwnedPreferenceNamespace };
});

function replaceSession(userId = 'owner-a') {
  const session: SessionAuthority = {
    userId,
    sessionId: `session-${userId}`,
    isCurrent: () => identity.session === session,
    getToken: async () => 'preferences-token',
  };
  identity.session = session;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function PreferenceProbe() {
  const enabled = useBrowserReplyReadyPreference();
  return <output>{enabled ? 'enabled' : 'disabled'}</output>;
}

describe('useBrowserReplyReadyPreference', () => {
  beforeEach(() => {
    replaceSession();
    fetchOwnedPreferenceNamespace.mockReset();
    fetchOwnedPreferenceNamespace.mockResolvedValue({ browserReplyReady: true });
  });

  it('applies a successful notification preference save without a page reload', async () => {
    render(<PreferenceProbe />);
    await waitFor(() => expect(screen.getByText('enabled')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: {
            namespace: 'notifications',
            value: { browserReplyReady: false },
          },
        }),
      );
    });

    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('ignores unrelated and malformed preference updates', async () => {
    render(<PreferenceProbe />);
    await waitFor(() => expect(screen.getByText('enabled')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: { namespace: 'privacy', value: { browserReplyReady: false } },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: { namespace: 'notifications', value: { browserReplyReady: 'no' } },
        }),
      );
    });

    expect(screen.getByText('enabled')).toBeInTheDocument();
  });

  it('does not overwrite a newer saved value with the initial read', async () => {
    const initial = deferred<{ browserReplyReady: boolean }>();
    fetchOwnedPreferenceNamespace.mockReturnValueOnce(initial.promise);
    render(<PreferenceProbe />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: { namespace: 'notifications', value: { browserReplyReady: false } },
        }),
      ),
    );
    expect(screen.getByText('disabled')).toBeInTheDocument();
    await act(async () => initial.resolve({ browserReplyReady: true }));
    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('clears the old account value and refuses its late read after replacement', async () => {
    const oldRead = deferred<{ browserReplyReady: boolean }>();
    const nextRead = deferred<{ browserReplyReady: boolean }>();
    fetchOwnedPreferenceNamespace
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(nextRead.promise);
    const view = render(<PreferenceProbe />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_NAMESPACE_SAVED_EVENT, {
          detail: { namespace: 'notifications', value: { browserReplyReady: false } },
        }),
      ),
    );
    expect(screen.getByText('disabled')).toBeInTheDocument();
    replaceSession('owner-b');
    view.rerender(<PreferenceProbe />);
    expect(screen.getByText('enabled')).toBeInTheDocument();
    await act(async () => oldRead.resolve({ browserReplyReady: false }));
    expect(screen.getByText('enabled')).toBeInTheDocument();
    await act(async () => nextRead.resolve({ browserReplyReady: false }));
    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('keeps the default without requesting account preferences while signed out', () => {
    identity.session = null;
    render(<PreferenceProbe />);
    expect(screen.getByText('enabled')).toBeInTheDocument();
    expect(fetchOwnedPreferenceNamespace).not.toHaveBeenCalled();
  });
});
