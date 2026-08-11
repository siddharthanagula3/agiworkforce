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
      <ShareConversationDialog open onOpenChange={vi.fn()} conversationTitle="Private plan" />,
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
      <ShareConversationDialog open onOpenChange={vi.fn()} conversationTitle="Private plan" />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create public link/ }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/share/fixture-token',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(await screen.findByRole('button', { name: /Create public link/ })).toBeInTheDocument();
  });
});
