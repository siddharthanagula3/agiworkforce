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

  it('revokes the exact link from the result state', async () => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

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
      '/api/share/fixture-token',
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

    fireEvent.click(screen.getByRole('alertdialog').querySelector('button:last-of-type')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/share/fixture-token',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ visibility: 'organization' }),
      }),
    );
    expect(await screen.findByText(/Shared with your workspace/)).toBeInTheDocument();
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
