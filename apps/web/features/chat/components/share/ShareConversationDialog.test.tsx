import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ShareConversationDialog } from './ShareConversationDialog';

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
    useChatStore.setState({ messages: [] });
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
    const fetchMock = vi
      .spyOn(global, 'fetch')
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
      );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-1"
        conversationTitle="Private plan"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke share' }));
    // Revoking kills the share for everyone holding it, so it confirms first.
    // Assert the dialog by its own title, or this test could pass by clicking
    // the trigger twice.
    expect(await screen.findByText('Revoke this share?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('alertdialog').querySelector('button:last-of-type')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/share?conversation_id=conv-1',
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
    useChatStore.setState({ messages: [] });
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
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(createdShare({ workspace: null }));

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-1"
        conversationTitle="Plan"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });

    expect(await screen.findByRole('button', { name: 'Revoke share' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Who can open this')).toBeNull();
  });

  it('asks before closing the link, naming who loses access and who gains it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createdShare({ workspace: { memberCount: 4 } }),
    );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-1"
        conversationTitle="Plan"
      />,
    );

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
        conversationId="conv-1"
        conversationTitle="Plan"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });

    const select = await screen.findByLabelText('Who can open this');
    fireEvent.change(select, { target: { value: 'organization' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Share with workspace' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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
      .mockResolvedValueOnce(createdShare({ workspace: { memberCount: 4 } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ visibility: 'organization' }), { status: 200 }),
      );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-1"
        conversationTitle="Plan"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });
    const select = await screen.findByLabelText('Who can open this');
    fireEvent.change(select, { target: { value: 'organization' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Share with workspace' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public link ready' })).toBeInTheDocument();
    expect(select).toHaveValue('public');
    expect(
      screen.queryByRole('heading', { name: 'Shared with your workspace' }),
    ).not.toBeInTheDocument();
  });

  it('warns that reopening the link cannot recall a copy somebody already took', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      createdShare({ workspace: { memberCount: 2 }, visibility: 'organization' }),
    );

    render(
      <ShareConversationDialog
        open
        onOpenChange={vi.fn()}
        conversationId="conv-1"
        conversationTitle="Plan"
      />,
    );

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
    useChatStore.setState({ messages: [] });
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
    return new Response(JSON.stringify({ shares, workspace: null }), { status: 200 });
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
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(screen.getByRole('heading', { name: 'Public link ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Revoke share' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Create public link/ })).toBeNull();
  });

  it('offers no second link while it is still checking for the first', () => {
    vi.spyOn(global, 'fetch').mockImplementationOnce(() => new Promise<Response>(() => {}));

    renderSavedChat();

    expect(screen.getByText('Checking whether this chat is already shared')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeDisabled();
  });

  it('revokes every live link to the chat at once, saying how many stop working', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(listed([liveShare('newest-token'), liveShare('older-token')]))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, revoked: 2 }), { status: 200 }),
      );

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
      expect(fetchMock).toHaveBeenLastCalledWith(
        `/api/share?conversation_id=${SAVED_CONVERSATION_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://agiworkforce.com/share/older-token')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('moves every live link to the chosen audience', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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

  it('says when it could not check, and still lets the user create a link', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));

    renderSavedChat();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check whether this chat already has a shared link.',
    );
    expect(screen.getByRole('button', { name: /Create public link/ })).toBeEnabled();
  });
});
