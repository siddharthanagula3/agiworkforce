import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useChatStream } from './useChatStream';

const authMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: authMocks.getToken }),
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));

const CONVERSATION_ID = 'conv-skill';

function completedStream(): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: new Headers() });
}

describe('useChatStream managed server selections', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useChatStore.setState({
      activeConversationId: CONVERSATION_ID,
      conversations: [
        {
          id: CONVERSATION_ID,
          title: 'Skill chat',
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
          isTemporary: true,
        },
      ],
    });
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completedStream()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends only the selected skill name and does not fabricate completed activity', async () => {
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Review this layout', {
        conversationId: CONVERSATION_ID,
        skillName: 'frontend-design',
      });
    });

    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/llm/v1/chat/completions'));
    expect(completionCall).toBeDefined();
    const request = JSON.parse(String(completionCall?.[1]?.body)) as {
      skill_name?: string;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(request.skill_name).toBe('frontend-design');
    expect(request.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Review this layout' }),
    ]);

    const assistant = useChatStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.metadata?.tools).toBeUndefined();
    expect(
      assistant?.metadata?.agentActivity?.entries.filter((entry) => entry.kind === 'tool') ?? [],
    ).toEqual([]);
  });

  it('sends only the logical Office creation flag', async () => {
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Create a release plan deck', {
        conversationId: CONVERSATION_ID,
        officeCreation: true,
      });
    });

    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/llm/v1/chat/completions'));
    const request = JSON.parse(String(completionCall?.[1]?.body)) as {
      office_creation?: boolean;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(request.office_creation).toBe(true);
    expect(request.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Create a release plan deck' }),
    ]);
    expect(JSON.stringify(request)).not.toContain('PK');
  });

  it('sends the per-conversation disabled connector ids', async () => {
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Check my email', {
        conversationId: CONVERSATION_ID,
        disabledConnectorIds: ['gmail', 'notion'],
      });
    });

    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/llm/v1/chat/completions'));
    const request = JSON.parse(String(completionCall?.[1]?.body)) as {
      disabled_connector_ids?: string[];
    };
    expect(request.disabled_connector_ids).toEqual(['gmail', 'notion']);
  });

  it('omits disabled_connector_ids when nothing is disabled', async () => {
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('Check my email', {
        conversationId: CONVERSATION_ID,
        disabledConnectorIds: [],
      });
    });

    const completionCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/api/llm/v1/chat/completions'));
    const request = JSON.parse(String(completionCall?.[1]?.body)) as {
      disabled_connector_ids?: string[];
    };
    expect(request.disabled_connector_ids).toBeUndefined();
  });
});
