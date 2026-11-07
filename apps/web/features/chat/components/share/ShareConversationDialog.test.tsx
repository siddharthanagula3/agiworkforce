import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render as renderUi, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import type { AccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  admitWorkspace, beginWorkspaceSwitch, finishWorkspaceSwitch, observeWorkspaceOwner,
  workspaceQueryKey,
} from '@/features/workspaces/lib/workspace-admission';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ShareConversationDialog } from './ShareConversationDialog';

const identity = vi.hoisted(() => ({ session: null as SessionAuthority | null, serial: 0 }));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => () => identity.session,
}));

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const personalWorkspace: AccountWorkspaces = {
  workspaces: [], activeWorkspaceId: null, activeOrganizationId: null, scope: 'personal',
};
let client: QueryClient;

function replaceSession() {
  const serial = ++identity.serial;
  const session: SessionAuthority = {
    userId: `dialog-account-${serial}`, sessionId: `dialog-session-${serial}`,
    isCurrent: () => identity.session === session,
    getToken: async () => `dialog-bearer-${serial}`,
  };
  identity.session = session;
  return session;
}

function admit(scope: AccountWorkspaces = personalWorkspace) {
  const owner = observeWorkspaceOwner(identity.session)!;
  admitWorkspace(owner, owner.epoch, JSON.stringify([
    scope.scope, scope.activeWorkspaceId, scope.activeOrganizationId,
  ]));
  client.setQueryData(workspaceQueryKey(owner), scope);
  return owner;
}

function completeEmptyListing() {
  return new Response(JSON.stringify({ shares: [], workspace: null, complete: true }), { status: 200 });
}

function render(element: ReactElement) {
  return renderUi(element, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  replaceSession();
  admit();
});

afterEach(() => {
  cleanup();
  client.clear();
  identity.session = null;
  observeWorkspaceOwner(null);
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

describe('ShareConversationDialog', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messages: [
        {
          id: 'fixture-message',
          role: 'user',
          content: 'Private planning notes',
          createdAt: '2026-08-11T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ activeConversationId: null, messages: [] });
  });

  it('does not publish until explicit confirmation and sends the selected expiry', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          shareUrl: 'https://agiworkforce.com/share/fixture-token',
          token: 'fixture-token',
          expiresAt: '2026-08-12T00:00:00.000Z',
          messageCount: 1,
        }),
        { status: 201 },
      ),
    );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-1"
        conversationTitle="Private plan"
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('Anyone with the link can read the snapshot without signing in.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /1 day/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create public link · 1 day' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.expires_in_days).toBe(1);
    expect(
      await screen.findByDisplayValue('https://agiworkforce.com/share/fixture-token'),
    ).toBeInTheDocument();
  });

  it('revokes the chat’s link from the result state', async () => {
    useChatStore.setState({ activeConversationId: '5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c' });
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(completeEmptyListing())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareUrl: 'https://agiworkforce.com/share/fixture-token',
            token: 'fixture-token',
            expiresAt: '2026-08-18T00:00:00.000Z',
            messageCount: 1,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, revoked: 1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ shares: [], workspace: null, complete: true })));

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c"
        conversationTitle="Private plan"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke share' }));
    // Revoking kills the share for everyone holding it, so it confirms first.
    // Assert the dialog by its own title, or this test could pass by clicking
    // the trigger twice.
    expect(await screen.findByText('Revoke this share?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button:last-of-type')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share?conversation_id=5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeInTheDocument();
  });

  it('always lets the user dismiss and abort a request that never resolves', async () => {
    const onOpenChange = vi.fn();
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    render(
      <ShareConversationDialog
        open
        onOpenChange={onOpenChange}
        conversationId="conv-1"
        conversationTitle="Private plan"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);

    expect(signal?.aborted).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ShareConversationDialog temporary chat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ messages: [], conversations: [] });
  });

  it('explains the refusal and offers no create control for a temporary chat', () => {
    useChatStore.setState({
      messages: [
        { id: 'm1', role: 'user', content: 'scratch', createdAt: '2026-08-11T00:00:00.000Z' },
      ],
      conversations: [{ id: 'conv-temp', title: 'Scratch', isTemporary: true } as never],
    });
    const fetchMock = vi.spyOn(global, 'fetch');

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-temp"
        conversationTitle="Scratch"
      />,
    );

    expect(screen.getByTestId('share-temporary-notice')).toHaveTextContent(
      /temporary chat cannot be shared/i,
    );
    const create = screen.getByRole('button', { name: /Create public link/ });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ShareConversationDialog audience', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: '5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c',
      messages: [
        {
          id: 'fixture-message',
          role: 'user',
          content: 'Private planning notes',
          createdAt: '2026-08-11T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ activeConversationId: null, messages: [] });
  });

  function createdShare(extra: Record<string, unknown>) {
    return new Response(
      JSON.stringify({
        shareUrl: 'https://agiworkforce.com/share/fixture-token',
        token: 'fixture-token',
        expiresAt: '2026-08-18T00:00:00.000Z',
        messageCount: 1,
        ...extra,
      }),
      { status: 201 },
    );
  }

  it('offers no audience choice when the sharer belongs to no workspace', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(completeEmptyListing()).mockResolvedValueOnce(createdShare({ workspace: null }));

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c"
        conversationTitle="Plan"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });

    expect(await screen.findByRole('button', { name: 'Revoke share' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Who can open this')).toBeNull();
  });

  it('asks before closing the link, naming who loses access and who gains it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(completeEmptyListing()).mockResolvedValueOnce(
      createdShare({ workspace: { memberCount: 4 } }),
    );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c"
        conversationTitle="Plan"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });

    const select = await screen.findByLabelText('Who can open this');
    fireEvent.change(select, { target: { value: 'organization' } });

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Limit this to your workspace?');
    expect(dialog).toHaveTextContent('Your 4 members can open it instead');
  });

  it('sends the audience change only after the confirmation is accepted', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(completeEmptyListing())
      .mockResolvedValueOnce(createdShare({ workspace: { memberCount: 4 } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: 'fixture-token',
            shareUrl: 'https://agiworkforce.com/share/fixture-token',
            visibility: 'organization',
            organizationId: '11111111-1111-4111-8111-111111111111',
            expiresAt: '2026-08-18T00:00:00.000Z',
          }),
          { status: 200 },
        ),
      );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c"
        conversationTitle="Plan"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });

    const select = await screen.findByLabelText('Who can open this');
    fireEvent.change(select, { target: { value: 'organization' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Share with workspace' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/share/fixture-token',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visibility: 'organization' }),
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Shared with your workspace' }),
    ).toBeInTheDocument();
    expect(select).toHaveValue('organization');
    expect(screen.getByRole('textbox', { name: 'Conversation link' })).toHaveValue(
      'https://agiworkforce.com/share/fixture-token',
    );
  });

  it('keeps the public audience when the update response violates the shared contract', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(completeEmptyListing())
      .mockResolvedValueOnce(createdShare({ workspace: { memberCount: 4 } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ visibility: 'organization' }), { status: 200 }),
      );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c"
        conversationTitle="Plan"
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });
    const select = await screen.findByLabelText('Who can open this');
    fireEvent.change(select, { target: { value: 'organization' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Share with workspace' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public link ready' })).toBeInTheDocument();
    expect(select).toHaveValue('public');
    expect(
      screen.queryByRole('heading', { name: 'Shared with your workspace' }),
    ).not.toBeInTheDocument();
  });

  it('warns that reopening the link cannot recall a copy somebody already took', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(completeEmptyListing()).mockResolvedValueOnce(
      createdShare({ workspace: { memberCount: 2 }, visibility: 'organization' }),
    );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c"
        conversationTitle="Plan"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });

    const select = await screen.findByLabelText('Who can open this');
    fireEvent.change(select, { target: { value: 'public' } });

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Make this readable by anyone with the link?');
    expect(dialog).toHaveTextContent('cannot un-share a copy somebody has already taken');
  });
});

describe('ShareConversationDialog on a chat that is already shared', () => {
  const SAVED_CONVERSATION_ID = '5d7f3c1a-9b2e-4f6d-8a1c-3e5b7d9f0a2c';

  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: SAVED_CONVERSATION_ID,
      messages: [
        {
          id: 'fixture-message',
          role: 'user',
          content: 'Private planning notes',
          createdAt: '2026-08-11T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ activeConversationId: null, messages: [] });
  });

  function liveShare(token: string, extra: Record<string, unknown> = {}) {
    return {
      token,
      title: 'Private plan',
      shareUrl: `https://agiworkforce.com/share/${token}`,
      modelId: null,
      provider: null,
      messageCount: 1,
      visibility: 'public',
      createdAt: '2026-08-11T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      expired: false,
      ...extra,
    };
  }

  function listed(shares: unknown[]) {
    return new Response(JSON.stringify({ shares, workspace: null, complete: true }), { status: 200 });
  }

  function renderSavedChat() {
    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId={SAVED_CONVERSATION_ID}
        conversationTitle="Private plan"
      />,
    );
  }

  it.each([false, undefined])('offers confirmed bulk revoke with no visible links and completeness %s', async (complete) => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ shares: [], workspace: null, complete })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, revoked: 0 })))
      .mockResolvedValueOnce(completeEmptyListing());
    renderSavedChat();
    const revoke = await screen.findByRole('button', { name: 'Revoke every link' });
    expect(screen.getByRole('status')).toHaveTextContent('The full list of links could not be confirmed.');
    expect(screen.queryByTestId('share-link-count')).toBeNull();
    expect(screen.queryByText(/Nobody else can/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(revoke);
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Revoke every link to this chat?');
    expect(confirmation).toHaveTextContent('Revoked links cannot be restored.');
    expect(confirmation).toHaveTextContent('It does not prevent someone from creating another link.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Revoke all links' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke every link' })).toBeNull());
    expect(screen.queryByText(/full list of links could not be confirmed/i)).toBeNull();
  });

  it('qualifies visible workspace links and disables actions when older links are unknown', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      shares: [liveShare('workspace-one', { visibility: 'organization' }),
        liveShare('workspace-two', { visibility: 'organization' })],
      workspace: { memberCount: 3 }, complete: false,
    })));
    renderSavedChat();
    expect(await screen.findByRole('heading', { name: 'Conversation links' })).toBeInTheDocument();
    expect(screen.queryByText(/Nobody else can/)).toBeNull();
    expect(screen.queryByTestId('share-link-count')).toBeNull();
    const audience = screen.getByLabelText('Who can open this');
    const update = screen.getByRole('button', { name: 'Update link' });
    expect(audience).toBeDisabled();
    expect(update).toBeDisabled();
    fireEvent.change(audience, { target: { value: 'public' } });
    fireEvent.click(update);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown-inventory guidance after an acknowledged revoke with failed refresh', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ shares: [], workspace: null, complete: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, revoked: 0 })))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    renderSavedChat();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke every link' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Revoke all links' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The revocation request succeeded, but the remaining links could not be checked.');
    expect(screen.getByRole('status')).toHaveTextContent('The full list of links could not be confirmed.');
    expect(screen.getByRole('button', { name: 'Revoke every link' })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retires an incomplete empty-inventory revoke confirmation on close and reopen', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ shares: [], workspace: null, complete: false })));
    const view = (open: boolean) => <ShareConversationDialog open={open} onOpenChange={vi.fn()}
      conversationId={SAVED_CONVERSATION_ID} conversationTitle="Private plan" />;
    const rendered = render(view(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke every link' }));
    const confirmation = await screen.findByRole('alertdialog');
    const oldConfirm = within(confirmation).getByRole('button', { name: 'Revoke all links' });
    rendered.rerender(view(false));
    rendered.rerender(view(true));
    await screen.findByRole('button', { name: 'Revoke every link' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(oldConfirm);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
  });

  it('shows the live link with Copy and Revoke instead of offering a new one', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        listed([liveShare('live-token'), liveShare('lapsed-token', { expired: true })]),
      );

    renderSavedChat();

    expect(
      await screen.findByDisplayValue('https://agiworkforce.com/share/live-token'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/share?conversation_id=${SAVED_CONVERSATION_ID}`,
      expect.objectContaining({ credentials: 'omit' }),
    );
    const lookupHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(lookupHeaders.get('Authorization')).toBe(`Bearer dialog-bearer-${identity.serial}`);
    expect(lookupHeaders.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(screen.getByRole('heading', { name: 'Public link ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Revoke share' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Create public link/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' }).parentElement).not.toHaveClass('sm:gap-0');
  });

  it('shows a public link under public copy when a newer link is workspace-only', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      listed([
        liveShare('workspace-token', { visibility: 'organization' }),
        liveShare('public-token'),
      ]),
    );

    renderSavedChat();

    expect(
      await screen.findByDisplayValue('https://agiworkforce.com/share/public-token'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public link ready' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://agiworkforce.com/share/workspace-token')).toBeNull();
    expect(screen.getByTestId('share-link-count')).toHaveTextContent('This chat has 2 live links.');
  });

  it('offers no second link while it is still checking for the first', () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() => new Promise<Response>(() => {}));

    renderSavedChat();

    expect(screen.getByText('Checking whether this chat is already shared')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
  });

  it('announces the check in a status region rather than a bare loading label', () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() => new Promise<Response>(() => {}));

    renderSavedChat();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking whether this chat is already shared',
    );
  });

  it('moves focus to the live link when the check finds one, never onto Revoke share', async () => {
    let answerLookup: (response: Response) => void = () => undefined;
    vi.spyOn(global, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          answerLookup = resolve;
        }),
    );

    renderSavedChat();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toHaveFocus());

    await act(async () => {
      answerLookup(listed([liveShare('live-token')]));
    });

    const link = await screen.findByRole('textbox', { name: 'Conversation link' });
    await waitFor(() => expect(link).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Revoke share' })).not.toHaveFocus();
  });

  it('returns focus to the dialog once a revoke has removed the button that asked', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([liveShare('live-token')]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, revoked: 1 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ shares: [], workspace: null, complete: true })));

    renderSavedChat();
    const revoke = await screen.findByRole('button', { name: 'Revoke share' });
    revoke.focus();
    fireEvent.click(revoke);
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Revoke share' }));

    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  });

  it('revokes every live link to the chat at once, saying how many stop working', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([liveShare('newest-token'), liveShare('older-token')]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, revoked: 2 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ shares: [], workspace: null, complete: true })));

    renderSavedChat();

    expect(await screen.findByTestId('share-link-count')).toHaveTextContent(
      'This chat has 2 live links.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke share' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Revoke all 2 links?');
    expect(confirmation).toHaveTextContent(
      'This chat has 2 live links, and all of them stop working',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke all links' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/share?conversation_id=${SAVED_CONVERSATION_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://agiworkforce.com/share/older-token')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('updates the chat’s link in place, keeping its address and expiry', async () => {
    useChatStore.setState({
      messages: [
        {
          id: 'fixture-message',
          role: 'user',
          content: 'Private planning notes',
          createdAt: '2026-08-11T00:00:00.000Z',
        },
        {
          id: 'fixture-answer',
          role: 'assistant',
          content: 'A plan.',
          createdAt: '2026-08-11T00:00:01.000Z',
        },
      ],
    });
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([liveShare('newest-token'), liveShare('older-token')]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            refreshed: 2,
            tokens: ['newest-token', 'older-token'],
            messageCount: 2,
          }),
          { status: 200 },
        ),
      );

    renderSavedChat();

    fireEvent.click(await screen.findByRole('button', { name: 'Update link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update all links' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`/api/share?conversation_id=${SAVED_CONVERSATION_ID}`);
    expect(init).toEqual(expect.objectContaining({ method: 'PUT' }));
    const body = JSON.parse(init?.body as string);
    expect(body.tokens).toEqual(['newest-token', 'older-token']);
    expect(body.messages).toHaveLength(2);
    expect('expires_in_days' in body).toBe(false);
    expect(await screen.findByText(/this 2-message snapshot/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Conversation link' })).toHaveValue(
      'https://agiworkforce.com/share/newest-token',
    );
    expect(screen.getByTestId('share-link-count')).toHaveTextContent('2 live links');
  });

  it('asks before updating, naming the new messages, who reads them and that it is final', async () => {
    useChatStore.setState({
      messages: ['first', 'second', 'third'].map((content, index) => ({
        id: `fixture-${index}`,
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content,
        createdAt: `2026-08-11T00:00:0${index}.000Z`,
      })),
    });
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([liveShare('live-token')]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ refreshed: 1, tokens: ['live-token'], messageCount: 3 }), {
          status: 200,
        }),
      );

    renderSavedChat();

    fireEvent.click(await screen.findByRole('button', { name: 'Update link' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Update the shared link?');
    expect(confirmation).toHaveTextContent(
      'Anyone with the link will see this chat as it is now, including 2 messages added since it was shared.',
    );
    expect(confirmation).toHaveTextContent('replaced and cannot be restored');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Update link' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/share?conversation_id=${SAVED_CONVERSATION_ID}`,
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('warns that every link changes when the chat was shared more than once', async () => {
    useChatStore.setState({
      messages: ['first', 'second', 'third'].map((content, index) => ({
        id: `fixture-${index}`,
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content,
        createdAt: `2026-08-11T00:00:0${index}.000Z`,
      })),
    });
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        listed([
          liveShare('newest-token', { messageCount: 2 }),
          liveShare('older-token', { messageCount: 1 }),
        ]),
      );

    renderSavedChat();

    fireEvent.click(await screen.findByRole('button', { name: 'Update link' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Update all 2 links?');
    expect(confirmation).toHaveTextContent(
      'This chat has 2 live links, which may have gone to different people, and all of them change.',
    );
    expect(confirmation).toHaveTextContent(
      'including up to 2 messages added since they were shared',
    );
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('moves every live link to the chosen audience', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            complete: true,
            shares: [liveShare('newest-token'), liveShare('older-token')],
            workspace: { memberCount: 3 },
          }),
          { status: 200 },
        ),
      )
      .mockImplementation(async (input) => {
        const token = String(input).split('/').pop();
        return new Response(
          JSON.stringify({
            token,
            shareUrl: `https://agiworkforce.com/share/${token}`,
            visibility: 'organization',
            organizationId: '11111111-1111-4111-8111-111111111111',
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
          { status: 200 },
        );
      });

    renderSavedChat();

    fireEvent.change(await screen.findByLabelText('Who can open this'), {
      target: { value: 'organization' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share with workspace' }));

    expect(
      await screen.findByRole('heading', { name: 'Shared with your workspace' }),
    ).toBeInTheDocument();
    const patched = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([input]) => String(input));
    expect(patched).toEqual(['/api/share/newest-token', '/api/share/older-token']);
  });

  it('names every link a workspace limit closes before it closes them', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          complete: true,
          shares: [liveShare('newest-token'), liveShare('older-token')],
          workspace: { memberCount: 3 },
        }),
        { status: 200 },
      ),
    );

    renderSavedChat();

    fireEvent.change(await screen.findByLabelText('Who can open this'), {
      target: { value: 'organization' },
    });
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Limit all 2 links to your workspace?');
    expect(confirmation).toHaveTextContent(
      'All 2 links stop opening, so anyone outside your workspace who already has one loses access.',
    );
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('names every link that opening to anyone would publish', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          complete: true,
          shares: [
            liveShare('newest-token', { visibility: 'organization' }),
            liveShare('older-token', { visibility: 'organization' }),
          ],
          workspace: { memberCount: 3 },
        }),
        { status: 200 },
      ),
    );

    renderSavedChat();

    fireEvent.change(await screen.findByLabelText('Who can open this'), {
      target: { value: 'public' },
    });
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Make all 2 links readable by anyone who has one?');
    expect(confirmation).toHaveTextContent(
      'Anyone holding one of the 2 links can read the transcript without signing in',
    );
    expect(within(confirmation).getByRole('button', { name: 'Open all links' })).toBeEnabled();
  });

  it('waits for the check made on reopening before offering a link again', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([]))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const view = (open: boolean) => (
      <ShareConversationDialog
        open={open}
        onOpenChange={vi.fn()}
        conversationId={SAVED_CONVERSATION_ID}
        conversationTitle="Private plan"
      />
    );
    const { rerender } = render(view(true));
    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeEnabled();

    rerender(view(false));
    rerender(view(true));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Checking whether this chat is already shared')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
  });

  it('drops the failed check’s alert when the dialog is reopened and the check succeeds', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(listed([liveShare('live-token')]));
    const view = (open: boolean) => (
      <ShareConversationDialog
        open={open}
        onOpenChange={vi.fn()}
        conversationId={SAVED_CONVERSATION_ID}
        conversationTitle="Private plan"
      />
    );
    const { rerender } = render(view(true));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check whether this chat already has a shared link.',
    );

    rerender(view(false));
    rerender(view(true));

    expect(
      await screen.findByDisplayValue('https://agiworkforce.com/share/live-token'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says when it could not check, and still lets the user create a link', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));

    renderSavedChat();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check whether this chat already has a shared link.',
    );
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled();
  });

  it('names every link to the chat when revoking after a check that failed', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareUrl: 'https://agiworkforce.com/share/new-token',
            token: 'new-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
            messageCount: 1,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, revoked: 3 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ shares: [], workspace: null, complete: true })));

    renderSavedChat();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check whether this chat already has a shared link.',
    );
    fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    await screen.findByDisplayValue('https://agiworkforce.com/share/new-token');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke every link' }));

    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('Revoke every link to this chat?');
    expect(confirmation).toHaveTextContent(
      'This request revokes the existing live links to this chat, including older ones that could not be checked, and withdraws their workspace grants.',
    );
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Revoke all links' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/share?conversation_id=${SAVED_CONVERSATION_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeInTheDocument();
  });
});

describe('ShareConversationDialog confirmation ownership', () => {
  const conversationId = '0b8e2f4a-6c1d-4e3f-9a5b-7d2c4e6f8a1b';
  const otherConversationId = '9c4a6e2b-1d3f-4b5a-8e7c-2f4a6b8d0c3e';
  const message = {
    id: 'owned-message', role: 'user' as const, content: 'Owned transcript',
    createdAt: '2026-10-01T00:00:00.000Z',
  };
  const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
  const listing = () => response({
    complete: true,
    shares: [{
      token: 'owned-token', title: 'Owned chat',
      shareUrl: 'https://agiworkforce.com/share/owned-token',
      modelId: null, provider: null, messageCount: 1, visibility: 'public',
      createdAt: '2026-10-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      expired: false,
    }],
    workspace: { memberCount: 3 },
  });
  const view = (open = true, id = conversationId) => (
    <ShareConversationDialog open={open} onOpenChange={vi.fn()} conversationId={id}
      conversationTitle="Owned chat" />
  );
  const actions = ['audience', 'update', 'revoke'] as const;
  type Action = (typeof actions)[number];
  async function prompt(action: Action) {
    if (action === 'audience') {
      fireEvent.change(await screen.findByLabelText('Who can open this'), {
        target: { value: 'organization' },
      });
    } else {
      fireEvent.click(await screen.findByRole('button', {
        name: action === 'update' ? 'Update link' : 'Revoke share',
      }));
    }
    return screen.findByRole('alertdialog');
  }
  const confirmationLabel = (action: Action) => action === 'audience'
    ? 'Share with workspace' : action === 'update' ? 'Update link' : 'Revoke share';
  const writes = (fetcher: { mock: { calls: Array<[unknown, RequestInit?]> } }) => fetcher.mock.calls.filter(
    ([, init]) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init?.method ?? ''),
  );

  beforeEach(() => {
    useChatStore.setState({ activeConversationId: conversationId, messages: [message], conversations: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ activeConversationId: null, messages: [] });
  });

  for (const action of actions) {
    it.each(['workspace', 'session', 'close/reopen', 'conversation'] as const)(
      `retires the ${action} prompt across %s and never resurrects it`, async (change) => {
        const fetcher = vi.spyOn(global, 'fetch').mockImplementation(async () => listing());
        const rendered = render(view());
        const oldPrompt = await prompt(action);
        expect(oldPrompt).toBeInTheDocument();

        act(() => {
          if (change === 'workspace') {
            const owner = observeWorkspaceOwner(identity.session)!;
            const epoch = beginWorkspaceSwitch(owner, owner.epoch);
            finishWorkspaceSwitch(owner, epoch, false);
            admit({ ...personalWorkspace, scope: 'organization',
              workspaces: [{ id: ORGANIZATION, organizationId: ORGANIZATION,
                kind: 'organization', name: 'Team', slug: 'team', isPrimary: true, role: 'owner' }],
              activeOrganizationId: ORGANIZATION, activeWorkspaceId: ORGANIZATION });
          } else if (change === 'session') {
            replaceSession();
            admit();
          } else if (change === 'conversation') {
            useChatStore.setState({ activeConversationId: otherConversationId, messages: [message] });
          }
        });
        rendered.rerender(view(change !== 'close/reopen',
          change === 'conversation' ? otherConversationId : conversationId));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(oldPrompt).not.toBeInTheDocument();
        rendered.rerender(view(false));
        rendered.rerender(view());
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(writes(fetcher)).toHaveLength(0);
        expect(toast.success).not.toHaveBeenCalled();
      },
    );

    it(`ignores a deferred ${action} completion after a replacement dialog opens`, async () => {
      let resolve!: (response: Response) => void;
      const pending = new Promise<Response>((done) => { resolve = done; });
      const fetcher = vi.spyOn(global, 'fetch').mockImplementation(async (_input, init) =>
        init?.method ? pending : listing());
      const rendered = render(view());
      const confirmation = await prompt(action);
      fireEvent.click(within(confirmation).getByRole('button', { name: confirmationLabel(action) }));
      await waitFor(() => expect(writes(fetcher)).toHaveLength(1));
      rendered.rerender(view(false));
      rendered.rerender(view());
      await screen.findByDisplayValue('https://agiworkforce.com/share/owned-token');
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      focus.mockClear();
      await act(async () => {
        resolve(response(action === 'update'
          ? { refreshed: 1, tokens: ['owned-token'], messageCount: 1 }
          : action === 'revoke' ? { success: true, revoked: 1 }
            : { token: 'owned-token', shareUrl: 'https://agiworkforce.com/share/owned-token',
                visibility: 'organization', organizationId: ORGANIZATION,
                expiresAt: '2099-01-01T00:00:00.000Z' }));
        await pending;
      });
      expect(toast.success).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Conversation link' })).toHaveValue(
        'https://agiworkforce.com/share/owned-token',
      );
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  }

  it('disables creation while workspace admission is pending, then shows finite failure guidance', async () => {
    replaceSession();
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const fetcher = vi.spyOn(global, 'fetch').mockReturnValue(pending);
    render(view());
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/workspace/i);
    await act(async () => { resolve(new Response('{}', { status: 503 })); await pending; });
    expect(await screen.findByRole('alert')).toHaveTextContent(/workspace|account/i);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
    expect(writes(fetcher)).toHaveLength(0);
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('/api/share'))).toBe(false);
  });

  it('hides old links and offers finite reload guidance after an uncertain workspace switch', async () => {
    const fetcher = vi.spyOn(global, 'fetch').mockImplementation(async () => listing());
    render(view());
    await screen.findByDisplayValue('https://agiworkforce.com/share/owned-token');
    act(() => {
      const owner = observeWorkspaceOwner(identity.session)!;
      const epoch = beginWorkspaceSwitch(owner, owner.epoch);
      finishWorkspaceSwitch(owner, epoch, true);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/reload/i);
    expect(screen.queryByRole('textbox', { name: 'Conversation link' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
    expect(writes(fetcher)).toHaveLength(0);
  });
});

describe('ShareConversationDialog on a chat the store has not opened', () => {
  const OPEN_CHAT_ID = '0b8e2f4a-6c1d-4e3f-9a5b-7d2c4e6f8a1b';
  const SHARED_CHAT_ID = '9c4a6e2b-1d3f-4b5a-8e7c-2f4a6b8d0c3e';
  const openChatMessages = [
    {
      id: 'open-question',
      role: 'user' as const,
      content: 'Open chat: salary numbers, never share',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'open-answer',
      role: 'assistant' as const,
      content: 'Open chat: noted',
      createdAt: '2026-10-01T00:00:01.000Z',
    },
  ];
  const sharedChatMessages = [
    {
      id: 'shared-question',
      role: 'user' as const,
      content: 'Shared chat: question',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'shared-answer',
      role: 'assistant' as const,
      content: 'Shared chat: answer',
      createdAt: '2026-10-01T00:00:01.000Z',
    },
  ];

  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: OPEN_CHAT_ID,
      messagesByConversation: { [OPEN_CHAT_ID]: openChatMessages },
      messages: openChatMessages,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ activeConversationId: null, messagesByConversation: {}, messages: [] });
  });

  function listed(tokens: string[]) {
    return new Response(
      JSON.stringify({
        complete: true,
        shares: tokens.map((token) => ({
          token,
          title: 'Shared chat',
          shareUrl: `https://agiworkforce.com/share/${token}`,
          modelId: null,
          provider: null,
          messageCount: 1,
          visibility: 'public',
          createdAt: '2026-10-01T00:00:00.000Z',
          expiresAt: '2099-01-01T00:00:00.000Z',
          expired: false,
        })),
        workspace: null,
      }),
      { status: 200 },
    );
  }

  function renderSharedChat() {
    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId={SHARED_CHAT_ID}
        conversationTitle="Shared chat"
      />,
    );
  }

  function openSharedChat() {
    act(() => {
      useChatStore
        .getState()
        .setActiveConversationWithMessages(SHARED_CHAT_ID, sharedChatMessages, null);
    });
  }

  async function settle() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  function sentBodies(fetchMock: { mock: { calls: Array<[unknown, RequestInit?]> } }) {
    return fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT')
      .map(
        ([, init]) => JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> },
      );
  }

  it('says the chat is still loading once the share check is done, not that it is checking', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(listed(['shared-token']));

    renderSharedChat();
    await settle();

    expect(screen.getByRole('status')).toHaveTextContent('Loading this chat');
    expect(screen.queryByText('Checking whether this chat is already shared')).toBeNull();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
  });

  it('shows why the chat could not load instead of a status that never ends', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(listed(['shared-token']));

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId={SHARED_CHAT_ID}
        conversationTitle="Shared chat"
        conversationLoadError="This conversation is unavailable. It may have been deleted."
      />,
    );
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This conversation is unavailable. It may have been deleted.',
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update link' })).toBeNull();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
  });

  it('holds Update link until the named chat loads, then sends only that chat', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed(['shared-token']))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ refreshed: 1, tokens: ['shared-token'], messageCount: 2 }), {
          status: 200,
        }),
      );

    renderSharedChat();
    await settle();

    expect(screen.getByText('Loading this chat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update link' })).toBeNull();

    openSharedChat();
    fireEvent.click(await screen.findByRole('button', { name: 'Update link' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('including 1 message added since it was shared');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Update link' }));

    await waitFor(() => expect(sentBodies(fetchMock)).toHaveLength(1));
    expect(sentBodies(fetchMock)[0]?.messages.map((message) => message.content)).toEqual([
      'Shared chat: question',
      'Shared chat: answer',
    ]);
  });

  it('holds Create public link until the named chat loads, then publishes only that chat', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([]))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareUrl: 'https://agiworkforce.com/share/new-token',
            token: 'new-token',
            expiresAt: '2099-01-01T00:00:00.000Z',
            messageCount: 2,
          }),
          { status: 201 },
        ),
      );

    renderSharedChat();
    await settle();

    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();

    openSharedChat();
    const create = screen.getByRole('button', { name: /Create public link/ });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    await waitFor(() => expect(sentBodies(fetchMock)).toHaveLength(1));
    expect(sentBodies(fetchMock)[0]?.messages.map((message) => message.content)).toEqual([
      'Shared chat: question',
      'Shared chat: answer',
    ]);
  });

  it('refuses an update confirmed after the store moved to another chat', async () => {
    openSharedChat();
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed(['shared-token']))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ refreshed: 1, tokens: ['shared-token'], messageCount: 2 }), {
          status: 200,
        }),
      );

    renderSharedChat();
    fireEvent.click(await screen.findByRole('button', { name: 'Update link' }));
    const confirmation = await screen.findByRole('alertdialog');
    act(() => {
      useChatStore
        .getState()
        .setActiveConversationWithMessages(OPEN_CHAT_ID, openChatMessages, null);
    });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Update link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This chat is still loading.');
    expect(sentBodies(fetchMock)).toEqual([]);
  });
});
