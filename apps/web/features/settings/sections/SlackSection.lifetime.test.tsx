import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  observeWorkspaceOwner,
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
} from '@/features/workspaces/lib/workspace-admission';
import { getCsrfToken } from '@/lib/client/csrf';
import { SlackSection } from './SlackSection';

const fixture = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  data: {
    scope: 'personal',
    activeWorkspaceId: 'personal',
    activeOrganizationId: null as string | null,
  },
  listeners: new Set<() => void>(),
  confirmations: [] as Array<{ onConfirm: () => unknown; onCancel?: () => void }>,
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  useConfirmAction: () => ({
    confirm: (request: (typeof fixture.confirmations)[number]) => {
      fixture.confirmations.push(request);
    },
    dialog: null,
  }),
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => () => fixture.session,
}));
vi.mock('@/features/workspaces/hooks/use-workspaces', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/features/workspaces/hooks/use-workspaces')>();
  const { observeWorkspaceOwner, admitWorkspace } =
    await import('@/features/workspaces/lib/workspace-admission');
  return {
    ...original,
    useAccountWorkspaces: () => {
      const owner = observeWorkspaceOwner(fixture.session);
      if (owner?.phase === 'resolving')
        admitWorkspace(
          owner,
          owner.epoch,
          JSON.stringify([
            fixture.data.scope,
            fixture.data.activeWorkspaceId,
            fixture.data.activeOrganizationId,
          ]),
        );
      return {
        data: fixture.data,
        isLoading: false,
        requiresReload: owner?.phase === 'uncertain',
        refetch: vi.fn(),
      };
    },
  };
});
const overview = () => ({
  available: true,
  planAllowed: true,
  requiredPlans: 'Pro',
  installations: [
    { id: 'installation-a', teamId: 'T123', teamName: 'Acme', installedAt: '2026-11-01' },
  ],
  links: [
    {
      id: 'link-a',
      teamName: 'Acme',
      slackUserName: 'Alice',
      workspaceName: null,
      linkedAt: '2026-11-01',
    },
  ],
  approvals: [
    {
      runId: 'run-a',
      teamName: 'Acme',
      surface: 'channel',
      taskPath: null,
      requestedAt: '2026-11-01',
      expiresAt: '2026-11-08',
      toolCalls: [{ id: 'tool-a', name: 'web', summary: 'Search', input: null }],
    },
  ],
});
const policies = () => ({
  teamId: 'T123',
  channels: [{ channelId: 'C111', mode: 'task', tools: null, seen: true, updatedAt: null }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function session(userId = 'a', sessionId = 'session-a') {
  const candidate: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => fixture.session === candidate,
    getToken: vi.fn(async () => `token-${userId}`),
    subscribe: (listener) => {
      fixture.listeners.add(listener);
      return () => {
        fixture.listeners.delete(listener);
      };
    },
  };
  fixture.session = candidate;
  return candidate;
}
let caseNumber = 0;
const fetchMock = vi.fn<typeof fetch>();
const mutations = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== 'GET');
beforeEach(() => {
  observeWorkspaceOwner(null);
  session(`account-${++caseNumber}`, `session-${caseNumber}`);
  fixture.data = { scope: 'personal', activeWorkspaceId: 'personal', activeOrganizationId: null };
  fixture.confirmations.length = 0;
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
  fetchMock
    .mockReset()
    .mockImplementation(async (url) =>
      json(String(url).endsWith('/channels') ? policies() : overview()),
    );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  const owner = observeWorkspaceOwner(fixture.session);
  if (owner?.phase === 'uncertain') finishWorkspaceSwitch(owner, owner.epoch, false);
  fixture.session = null;
  fixture.listeners.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

it('shares confirmation admission with approvals and channel editors, and cancellation releases it', async () => {
  render(<SlackSection />);
  const select = await screen.findByRole('combobox');
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(select).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  act(() => fixture.confirmations[0]!.onCancel?.());
  expect(select).not.toBeDisabled();
  expect(mutations()).toHaveLength(0);
});

it.each(['session', 'same-session-id', 'workspace', 'close'])(
  'rejects retained confirmation after %s replacement',
  async (change) => {
    const { rerender } = render(<SlackSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const pending = fixture.confirmations[0]!;
    if (change === 'session') session('b', 'session-b');
    if (change === 'same-session-id') session(fixture.session!.userId, fixture.session!.sessionId);
    if (change === 'workspace') {
      act(() => {
        const owner = observeWorkspaceOwner(fixture.session)!;
        const epoch = beginWorkspaceSwitch(owner, owner.epoch);
        finishWorkspaceSwitch(owner, epoch, false);
        fixture.data = {
          scope: 'organization',
          activeWorkspaceId: 'org-a',
          activeOrganizationId: 'org-a',
        };
      });
    }
    rerender(<SlackSection active={change !== 'close'} />);
    await act(async () => {
      await pending.onConfirm();
    });
    expect(mutations()).toHaveLength(0);
  },
);

it('reconciles a silently replaced session when an old confirmation is accepted', async () => {
  render(<SlackSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  session('b', 'session-b');
  await act(async () => {
    await fixture.confirmations[0]!.onConfirm();
  });
  expect(mutations()).toHaveLength(0);
  expect(screen.queryByText('Alice in Acme')).not.toBeInTheDocument();
});

it('keeps an unmatched removal receipt uncertain instead of retrying or reporting success', async () => {
  fetchMock.mockImplementation(async (url, init) =>
    init?.method === 'DELETE'
      ? json({ removed: 'different-installation' })
      : json(String(url).endsWith('/channels') ? policies() : overview()),
  );
  render(<SlackSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  await act(async () => {
    await fixture.confirmations[0]!.onConfirm();
  });
  expect(screen.getByRole('alert')).toHaveTextContent('result could not be confirmed');
  expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  expect(mutations()).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/slack')).toHaveLength(1);
});

it('holds admission through refresh after a matching receipt and does not restart an old confirmation', async () => {
  const refresh = deferred<Response>();
  let reads = 0;
  fetchMock.mockImplementation(async (url, init) => {
    if (init?.method === 'DELETE') return json({ removed: 'installation-a' });
    if (url === '/api/slack') return ++reads === 1 ? json(overview()) : refresh.promise;
    return json(policies());
  });
  render(<SlackSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  const confirmation = fixture.confirmations[0]!;
  let pending: unknown;
  act(() => {
    pending = confirmation.onConfirm();
  });
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => {
    await confirmation.onConfirm();
  });
  expect(mutations()).toHaveLength(1);
  const next = overview();
  next.installations = [];
  await act(async () => {
    refresh.resolve(json(next));
    await pending;
  });
  expect(screen.getByRole('status')).toHaveTextContent('service confirmed');
  expect(screen.getByRole('button', { name: 'Approve' })).not.toBeDisabled();
});

it('retires a deferred mutation body on close and suppresses its notice and refresh', async () => {
  const body = deferred<unknown>();
  fetchMock.mockImplementation(async (url, init) =>
    init?.method === 'DELETE'
      ? ({ ok: true, json: () => body.promise } as Response)
      : json(String(url).endsWith('/channels') ? policies() : overview()),
  );
  const { rerender } = render(<SlackSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  let pending: unknown;
  act(() => {
    pending = fixture.confirmations[0]!.onConfirm();
  });
  await waitFor(() => expect(mutations()).toHaveLength(1));
  rerender(<SlackSection active={false} />);
  await act(async () => {
    body.resolve({ removed: 'installation-a' });
    await pending;
  });
  expect(screen.queryByText(/service confirmed/)).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/slack')).toHaveLength(1);
});

it('supports StrictMode effect replay without exposing the retired read', async () => {
  render(
    <StrictMode>
      <SlackSection />
    </StrictMode>,
  );
  expect(await screen.findByRole('button', { name: 'Remove' })).toBeEnabled();
  expect(await screen.findByRole('combobox')).toBeEnabled();
});

it.each(['link', 'run', 'decision'])('refuses a mismatched %s mutation receipt', async (kind) => {
  fetchMock.mockImplementation(async (url, init) => {
    if (init?.method === 'DELETE') return json({ removed: 'other-link' });
    if (init?.method === 'POST')
      return json({
        runId: kind === 'run' ? 'other-run' : 'run-a',
        decision: kind === 'decision' ? 'rejected' : 'approved',
        status: 'resuming',
      });
    return json(String(url).endsWith('/channels') ? policies() : overview());
  });
  render(<SlackSection />);
  if (kind === 'link') {
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    await act(async () => {
      await fixture.confirmations[0]!.onConfirm();
    });
  } else {
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  }
  await screen.findByText(/The result could not be confirmed/);
  expect(mutations()).toHaveLength(1);
  expect(screen.queryByText(/Approval accepted/)).not.toBeInTheDocument();
});

it('does not dispatch a confirmed removal when CSRF completes after close', async () => {
  const pause = deferred<string>();
  const { rerender } = render(<SlackSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
  vi.mocked(getCsrfToken).mockReturnValueOnce(pause.promise);
  let pending: unknown;
  act(() => {
    pending = fixture.confirmations[0]!.onConfirm();
  });
  rerender(<SlackSection active={false} />);
  await act(async () => {
    pause.resolve('late-csrf');
    await pending;
  });
  expect(mutations()).toHaveLength(0);
});

it('fails closed on duplicate overview resource IDs before rendering actionable rows', async () => {
  const duplicate = overview();
  duplicate.installations.push({ ...duplicate.installations[0]!, teamName: 'Conflicting team' });
  fetchMock.mockImplementation(async () => json(duplicate));
  render(<SlackSection />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
});
