import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useShareConversation } from './use-share-conversation';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const MESSAGE = {
  id: 'msg-1',
  role: 'user' as const,
  content: 'hello',
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('useShareConversation', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [MESSAGE] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStore.setState({ messages: [] });
  });

  it('posts to /api/share (not the legacy /api/shared route) and stores the returned token', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          shareUrl: 'https://agiworkforce.com/share/abc123',
          token: 'abc123',
          expiresAt: '2026-07-08T00:00:00.000Z',
          messageCount: 1,
        }),
        { status: 201 },
      ),
    );

    const { result } = renderHook(() => useShareConversation('My session'));

    await act(async () => {
      await result.current.share(30);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.expires_in_days).toBe(30);
    expect(body.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(result.current.activeShare?.token).toBe('abc123');
  });

  it('revokes the active share via DELETE /api/share/[token]', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareUrl: 'https://agiworkforce.com/share/abc123',
            token: 'abc123',
            expiresAt: '2026-07-08T00:00:00.000Z',
            messageCount: 1,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const { result } = renderHook(() => useShareConversation('My session'));

    await act(async () => {
      await result.current.share(7);
    });
    await act(async () => {
      await result.current.revoke();
    });

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/share/abc123',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.current.activeShare).toBeNull();
  });
});
