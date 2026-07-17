import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMemoryStore } from '@agiworkforce/unified-chat';

// Hermetic auth + csrf so the runtime can build a request without network/env.
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'test-token'),
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (h: HeadersInit) => h,
}));

import { WebChatRuntime } from '../WebChatRuntime';

function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('WebChatRuntime memory injection', () => {
  beforeEach(() => {
    useMemoryStore.getState().clear();
    vi.restoreAllMocks();
  });

  it('prepends saved memory facts as a system message in the request body', async () => {
    useMemoryStore.getState().add('Prefers concise answers');
    useMemoryStore.getState().add('Works in fintech');

    // Non-ok response so sendMessage returns right after the fetch — we only
    // need to inspect the outgoing body, not consume a stream.
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'hello', { messageHistory: [] });

    const body = bodyOf(fetchMock as unknown as ReturnType<typeof vi.fn>);
    const messages = body['messages'] as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('- Prefers concise answers');
    expect(messages[0]?.content).toContain('- Works in fintech');
    // The user turn is still present after the injected system message.
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'hello' });
  });

  it('omits the system message when no facts are saved', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'hello', { messageHistory: [] });

    const body = bodyOf(fetchMock as unknown as ReturnType<typeof vi.fn>);
    const messages = body['messages'] as Array<{ role: string; content: string }>;
    expect(messages.every((m) => m.role !== 'system')).toBe(true);
    expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('advertises Research and sends the exact research field to the managed API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new WebChatRuntime();
    expect(runtime.supportsResearch).toBe(true);

    await runtime.sendMessage('conv-1', 'investigate', {
      messageHistory: [],
      research: true,
    });

    expect(bodyOf(fetchMock as unknown as ReturnType<typeof vi.fn>)).toEqual(
      expect.objectContaining({ research: true }),
    );
  });
});
