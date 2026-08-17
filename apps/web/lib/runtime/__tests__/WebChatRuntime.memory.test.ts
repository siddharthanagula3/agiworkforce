import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMemoryStore } from '@agiworkforce/unified-chat';

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'test-token'),
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (h: HeadersInit) => h,
}));

import { WebChatRuntime } from '../WebChatRuntime';
import { resetMemoryCapabilityCache } from '../memory-capability';
import { useChatStore } from '@shared/stores/web-chat-store';

function stubFetch(opts?: { memory?: boolean }): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: unknown) => {
    if (typeof url === 'string' && url.includes('/api/settings/preferences')) {
      return { ok: true, json: async () => ({ settings: { memory: opts?.memory ?? false } }) };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

function completionsBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('/chat/completions'),
  );
  const init = call?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('WebChatRuntime memory injection', () => {
  beforeEach(() => {
    useMemoryStore.getState().clear();
    useChatStore.getState().setConversations([]);
    resetMemoryCapabilityCache();
    vi.restoreAllMocks();
  });

  it('prepends saved memory facts as a system message in the request body', async () => {
    useMemoryStore.getState().add('Prefers concise answers');
    useMemoryStore.getState().add('Works in fintech');
    const fetchMock = stubFetch({ memory: true });

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'hello', { messageHistory: [] });

    const messages = completionsBody(fetchMock)['messages'] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('- Prefers concise answers');
    expect(messages[0]?.content).toContain('- Works in fintech');
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'hello' });
  });

  it('omits the system message when no facts are saved', async () => {
    const fetchMock = stubFetch({ memory: true });

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'hello', { messageHistory: [] });

    const messages = completionsBody(fetchMock)['messages'] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages.every((m) => m.role !== 'system')).toBe(true);
    expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('omits saved facts when the Memory capability toggle is off', async () => {
    useMemoryStore.getState().add('Prefers concise answers');
    const fetchMock = stubFetch({ memory: false });

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'hello', { messageHistory: [] });

    const messages = completionsBody(fetchMock)['messages'] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages.every((m) => m.role !== 'system')).toBe(true);
    expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('omits saved facts in a temporary chat even with the Memory toggle on', async () => {
    useMemoryStore.getState().add('Prefers concise answers');
    useChatStore.getState().setConversations([
      {
        id: 'conv-1',
        title: 'Temporary',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isTemporary: true,
      },
    ]);
    const fetchMock = stubFetch({ memory: true });

    await new WebChatRuntime().sendMessage('conv-1', 'hello', { messageHistory: [] });

    expect(completionsBody(fetchMock)['messages']).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('still injects saved facts in a non-temporary conversation', async () => {
    useMemoryStore.getState().add('Prefers concise answers');
    useChatStore.getState().setConversations([
      {
        id: 'conv-1',
        title: 'Normal',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isTemporary: false,
      },
    ]);
    const fetchMock = stubFetch({ memory: true });

    await new WebChatRuntime().sendMessage('conv-1', 'hello', { messageHistory: [] });

    const messages = completionsBody(fetchMock)['messages'] as Array<{
      role: string;
      content: string;
    }>;
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('- Prefers concise answers');
  });

  it('fails closed when the capability preference cannot be loaded', async () => {
    useMemoryStore.getState().add('Never leak this fact');
    const fetchMock = vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.includes('/api/settings/preferences')) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await new WebChatRuntime().sendMessage('conv-1', 'hello', { messageHistory: [] });

    expect(completionsBody(fetchMock)['messages']).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('advertises Research and sends the exact research field to the managed API', async () => {
    const fetchMock = stubFetch();

    const runtime = new WebChatRuntime();
    expect(runtime.supportsResearch).toBe(true);

    await runtime.sendMessage('conv-1', 'investigate', {
      messageHistory: [],
      research: true,
    });

    expect(completionsBody(fetchMock)).toEqual(expect.objectContaining({ research: true }));
  });

  it('sends the browser time zone with managed chat requests', async () => {
    const fetchMock = stubFetch();

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'What date is it?', { messageHistory: [] });

    expect(completionsBody(fetchMock)['client_timezone']).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it('keeps permission mode separate from the managed Cloud work mode', async () => {
    const fetchMock = stubFetch();

    const runtime = new WebChatRuntime();
    await runtime.sendMessage('conv-1', 'build this', {
      messageHistory: [],
      agentMode: 'auto',
      workMode: 'agiwork',
    });

    expect(completionsBody(fetchMock)).toEqual(expect.objectContaining({ work_mode: 'agiwork' }));
    expect(completionsBody(fetchMock)['agent_mode']).toBeUndefined();
  });
});
