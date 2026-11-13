import type { WebFetch } from '@/test/fetch';
import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_WORKSPACES_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import type { ConfirmDialogProps } from '@agiworkforce/ui';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
  dialogs: [] as ConfirmDialogProps[],
  replace: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: fixture.replace }) }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf',
  })),
}));
vi.mock('@agiworkforce/ui', async (original) => ({
  ...(await original<ImportedModule1>()),
  ConfirmDialog: (props: ConfirmDialogProps) => {
    fixture.dialogs.push(props);
    return (
      <div role="alertdialog">
        <p>{props.title}</p>
        <p>{props.description}</p>
        <button onClick={props.onConfirm}>Confirm bulk action</button>
        <button onClick={props.onCancel}>Cancel bulk action</button>
      </div>
    );
  },
}));

import { useChatStore } from '@shared/stores/web-chat-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { BulkConversationControls } from './BulkConversationControls';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const personal = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const stats = {
  historyStats: { conversationCount: 812, activeConversationCount: 640, messageCount: 9001 },
};
const row = {
  id: 'chat-a',
  title: 'Plan',
  model: 'auto',
  projectId: null,
  isPinned: true,
  isStarred: false,
  isArchived: false,
  isTemporary: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const counts = () => fetchMock.mock.calls.filter(([path]) => String(path).includes('statsOnly'));
const latestDialog = () => fixture.dialogs[fixture.dialogs.length - 1]!;
let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  observeWorkspaceOwner(null);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fixture.auth = { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' };
  fixture.sdk.loaded = true;
  fixture.sdk.user = { id: 'a' };
  fixture.sdk.session = { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' };
  fixture.dialogs = [];
  fixture.replace.mockReset();
  useChatStore.setState({
    conversations: [row],
    streamingConversationIds: [],
    loadingConversationIds: [],
    activeConversationId: null,
  });
  fetchMock.mockReset().mockImplementation(async (path, init) => {
    if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
    if (String(path).includes('statsOnly')) return json(stats);
    return json({ success: true, action: JSON.parse(String(init?.body)).action, affectedCount: 1 });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => ({ ...headers, 'x-csrf-token': 'csrf' }));
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

async function open(action = 'Archive all') {
  await waitFor(() => expect(screen.getByRole('button', { name: action })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: action }));
  await screen.findByRole('alertdialog');
  return latestDialog();
}

describe('owned bulk chat settings', () => {
  it('reserves one count and exact confirmation, including repeated confirm and cancel callbacks', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH
        ? json(personal)
        : init?.method === 'POST'
          ? pending.promise
          : json(stats),
    );
    render(<BulkConversationControls />, { wrapper });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive all' })).toBeEnabled());
    const archive = screen.getByRole('button', { name: 'Archive all' });
    const remove = screen.getByRole('button', { name: 'Delete all' });
    act(() => {
      archive.click();
      remove.click();
      archive.click();
    });
    await screen.findByRole('alertdialog');
    expect(counts()).toHaveLength(1);
    const dialog = latestDialog();
    expect(dialog.description).toContain('640');
    expect(dialog.description).not.toContain('812');
    act(() => {
      dialog.onConfirm();
      dialog.onConfirm();
      dialog.onCancel?.();
      dialog.onOpenChange(false);
    });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Archiving…' })).toBeDisabled();
    await act(async () =>
      pending.resolve(json({ success: true, action: 'archive_all', affectedCount: 1 })),
    );
    await screen.findByText('Archived 1 chat.');
    expect(useChatStore.getState().conversations[0]).toMatchObject({
      isArchived: true,
      isPinned: false,
    });
    for (const [, init] of [...counts(), ...posts()]) {
      expect(init?.credentials).toBe('omit');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-a');
      expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
    }
    expect(new Headers(posts()[0]![1]?.headers).get('x-csrf-token')).toBe('csrf');
    act(() => dialog.onConfirm());
    expect(posts()).toHaveLength(1);
  });

  it('a cancelled dialog cannot confirm or cancel a newer intent', async () => {
    render(<BulkConversationControls />, { wrapper });
    const old = await open();
    act(() => old.onCancel?.());
    const fresh = await open('Delete all');
    expect(fresh.description).toContain('812');
    expect(fresh.description).toContain('for 30 days');
    expect(fresh.description).not.toMatch(/cannot be undone/i);
    expect(fresh.description).toContain('Memories learned from these chats stay');
    act(() => {
      old.onConfirm();
      old.onCancel?.();
      old.onOpenChange(false);
    });
    expect(posts()).toHaveLength(0);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    act(() => fresh.onConfirm());
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(fixture.replace).toHaveBeenCalledWith('/chat'));
  });

  it.each(['Archive all', 'Delete all'])(
    'uses unnumbered scope on an owned count failure for %s',
    async (action) => {
      fetchMock.mockImplementation(async (path) => {
        if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
        throw new Error('offline');
      });
      render(<BulkConversationControls />, { wrapper });
      const dialog = await open(action);
      expect(dialog.description).toContain('Every chat in the current workspace');
      expect(dialog.description).not.toContain('in your account');
      expect(dialog.description).not.toMatch(/\ball \d+ chat/i);
    },
  );

  it('does not turn a count settling after unmount into a confirmation', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (path) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH ? json(personal) : pending.promise,
    );
    const mounted = render(<BulkConversationControls />, { wrapper });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive all' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Archive all' }));
    await waitFor(() => expect(counts()).toHaveLength(1));
    mounted.unmount();
    await act(async () => pending.resolve(json(stats)));
    expect(fixture.dialogs).toHaveLength(0);
    expect(posts()).toHaveLength(0);
  });

  it('retires an old confirmation on a workspace epoch round trip before rerender', async () => {
    render(<BulkConversationControls />, { wrapper });
    const old = await open();
    const owner = observeWorkspaceOwner({
      userId: 'a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'unused',
    })!;
    act(() => {
      const epoch = beginWorkspaceSwitch(owner, owner.epoch);
      finishWorkspaceSwitch(owner, epoch, false);
      old.onConfirm();
    });
    expect(posts()).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('refuses a same-account SDK session replacement during CSRF acquisition', async () => {
    const csrf = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    render(<BulkConversationControls />, { wrapper });
    const old = await open();
    act(() => old.onConfirm());
    fixture.sdk.session = { ...fixture.sdk.session };
    await act(async () => csrf.resolve({}));
    expect(posts()).toHaveLength(0);
  });

  it('checks streaming at POST dispatch after a delayed token', async () => {
    const token = deferred<string>();
    render(<BulkConversationControls />, { wrapper });
    const dialog = await open('Delete all');
    const tokenRead = vi.fn(() => token.promise);
    fixture.sdk.session.getToken = tokenRead;
    act(() => dialog.onConfirm());
    await waitFor(() => expect(tokenRead).toHaveBeenCalled());
    act(() => useChatStore.setState({ streamingConversationIds: ['new-reply'] }));
    await act(async () => token.resolve('token-a'));
    expect(posts()).toHaveLength(0);
    expect(
      await screen.findByText('Finish or stop active replies before deleting all chats.'),
    ).toBeInTheDocument();
  });

  it('suppresses a delayed body receipt after leaving the view', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockImplementation(async (path, init) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH
        ? json(personal)
        : init?.method === 'POST'
          ? Object.assign(new Response(null), { json: readBody })
          : json(stats),
    );
    const mounted = render(<BulkConversationControls />, { wrapper });
    const dialog = await open('Delete all');
    act(() => dialog.onConfirm());
    await waitFor(() => expect(readBody).toHaveBeenCalled());
    mounted.unmount();
    await act(async () => body.resolve({ success: true, action: 'delete_all', affectedCount: 1 }));
    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(fixture.replace).not.toHaveBeenCalled();
  });

  it('does not call an opposite-action receipt success or change the sidebar', async () => {
    fetchMock.mockImplementation(async (path, init) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH
        ? json(personal)
        : init?.method === 'POST'
          ? json({ success: true, action: 'delete_all', affectedCount: 1 })
          : json(stats),
    );
    render(<BulkConversationControls />, { wrapper });
    const dialog = await open();
    act(() => dialog.onConfirm());
    await screen.findByText(/We could not confirm whether your chats were updated/);
    expect(useChatStore.getState().conversations[0]?.isArchived).toBe(false);
    expect(posts()).toHaveLength(1);
  });

  it('does not remove a chat loaded after delete dispatch', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH
        ? json(personal)
        : init?.method === 'POST'
          ? pending.promise
          : json(stats),
    );
    render(<BulkConversationControls />, { wrapper });
    const dialog = await open('Delete all');
    act(() => dialog.onConfirm());
    await waitFor(() => expect(posts()).toHaveLength(1));
    act(() => useChatStore.setState({ conversations: [row, { ...row, id: 'created-later' }] }));
    await act(async () =>
      pending.resolve(json({ success: true, action: 'delete_all', affectedCount: 1 })),
    );
    await screen.findByText('Deleted 1 chat.');
    expect(useChatStore.getState().conversations.map((item) => item.id)).toEqual(['created-later']);
  });

  it('does not publish an old account receipt or release a replacement account operation', async () => {
    const oldBody = deferred<unknown>();
    const readOldBody = vi.fn(() => oldBody.promise);
    const nextResponse = deferred<Response>();
    let writes = 0;
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === MANAGED_CLOUD_WORKSPACES_PATH) return json(personal);
      if (init?.method !== 'POST') return json(stats);
      if (++writes === 1) return Object.assign(new Response(null), { json: readOldBody });
      return nextResponse.promise;
    });
    const mounted = render(<BulkConversationControls />, { wrapper });
    const old = await open('Delete all');
    act(() => old.onConfirm());
    await waitFor(() => expect(readOldBody).toHaveBeenCalled());
    fixture.auth = { ...fixture.auth, userId: 'b', sessionId: 'session-b' };
    fixture.sdk.user = { id: 'b' };
    fixture.sdk.session = { id: 'session-b', user: { id: 'b' }, getToken: async () => 'token-b' };
    act(() => useChatStore.setState({ conversations: [{ ...row, id: 'chat-b' }] }));
    mounted.rerender(<BulkConversationControls />);
    const fresh = await open();
    act(() => fresh.onConfirm());
    await waitFor(() => expect(posts()).toHaveLength(2));
    await act(async () =>
      oldBody.resolve({ success: true, action: 'delete_all', affectedCount: 1 }),
    );
    expect(screen.getByRole('button', { name: 'Archiving…' })).toBeDisabled();
    expect(useChatStore.getState().conversations[0]?.id).toBe('chat-b');
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(new Headers(posts()[1]![1]?.headers).get('Authorization')).toBe('Bearer token-b');
    await act(async () =>
      nextResponse.resolve(json({ success: true, action: 'archive_all', affectedCount: 1 })),
    );
    await screen.findByText('Archived 1 chat.');
  });

  it('keeps a matching receipt confirmed when local reconciliation throws', async () => {
    const original = useChatStore.getState().updateConversation;
    render(<BulkConversationControls />, { wrapper });
    const dialog = await open();
    try {
      act(() =>
        useChatStore.setState({
          updateConversation: () => {
            throw new Error('view unavailable');
          },
        }),
      );
      act(() => dialog.onConfirm());
      await screen.findByText(/Your chat update was confirmed, but this view could not refresh/);
      expect(screen.queryByText(/We could not confirm whether/)).toBeNull();
      expect(posts()).toHaveLength(1);
    } finally {
      act(() => useChatStore.setState({ updateConversation: original }));
    }
  });

  it('pins the admitted organization on both requests instead of relying on saved selection', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const organization = {
      scope: 'organization',
      activeWorkspaceId: 'team-a',
      activeOrganizationId: organizationId,
      workspaces: [
        {
          id: 'team-a',
          kind: 'organization',
          organizationId,
          name: 'Team A',
          slug: 'team-a',
          isPrimary: false,
          role: 'member',
        },
      ],
    };
    fetchMock.mockImplementation(async (path, init) =>
      String(path) === MANAGED_CLOUD_WORKSPACES_PATH
        ? json(organization)
        : init?.method === 'POST'
          ? json({ success: true, action: 'archive_all', affectedCount: 1 })
          : json(stats),
    );
    render(<BulkConversationControls />, { wrapper });
    const dialog = await open();
    act(() => dialog.onConfirm());
    await screen.findByText('Archived 1 chat.');
    for (const [, init] of [...counts(), ...posts()]) {
      expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        organizationId,
      );
    }
  });

  it('reacquires usable controls after StrictMode cleanup and setup', async () => {
    render(
      <StrictMode>
        <BulkConversationControls />
      </StrictMode>,
      { wrapper },
    );
    const dialog = await open();
    act(() => dialog.onConfirm());
    await screen.findByText('Archived 1 chat.');
    expect(posts()).toHaveLength(1);
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
type ImportedModule1 = typeof import('@agiworkforce/ui');
