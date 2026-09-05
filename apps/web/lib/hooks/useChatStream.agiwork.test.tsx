import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getTokenMock = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { useChatStream } from './useChatStream';
import { useChatStore } from '@shared/stores/web-chat-store';

const encoder = new TextEncoder();

function sse(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function contentDelta(text: string) {
  return { choices: [{ delta: { content: text }, index: 0 }] };
}

function agiWorkPlan(steps: Array<{ id: string; description: string; status: string }>) {
  return { choices: [{ delta: { x_agiwork_plan: { steps } }, index: 0 }] };
}

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];

function installFetch(events: unknown[]) {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      fetchCalls.push({ url, init });
      if (url.includes('/api/llm/v1/chat/completions')) {
        const queue = [...events.map((e) => sse(e)), encoder.encode('data: [DONE]\n\n')];
        const body = new ReadableStream({
          pull(controller) {
            const next = queue.shift();
            if (next) controller.enqueue(next);
            else controller.close();
          },
        });
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          body,
          json: async () => ({}),
        } as unknown as Response;
      }
      const parsed = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ message: { id: parsed['id'] ?? 'saved-id' } }),
      } as unknown as Response;
    }),
  );
}

function seedConversation() {
  useChatStore.setState({
    messages: [],
    messagesByConversation: { 'conv-1': [] },
    activeConversationId: 'conv-1',
    conversations: [
      {
        id: 'conv-1',
        title: 'AGI Work chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as never,
    isStreaming: false,
    streamingMessageId: null,
  } as never);
}

function assistantMessage() {
  return useChatStore.getState().messages.find((m) => m.role === 'assistant');
}

function completionBody(): Record<string, unknown> {
  const call = fetchCalls.find((c) => c.url.includes('/api/llm/v1/chat/completions'));
  return JSON.parse(call!.init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  let tokenCounter = 0;
  getTokenMock.mockReset();
  getTokenMock.mockImplementation(async () => `token-${++tokenCounter}`);
  seedConversation();
});

describe('useChatStream AGI Work plan handling', () => {
  it('populates agiWorkPlan from the additive x_agiwork_plan delta (whole-plan replace)', async () => {
    installFetch([
      agiWorkPlan([
        { id: 'agiwork-plan-1', description: 'gather', status: 'in_progress' },
        { id: 'agiwork-plan-2', description: 'write', status: 'pending' },
      ]),
      contentDelta('Working on it'),
      agiWorkPlan([
        { id: 'agiwork-plan-1', description: 'gather', status: 'completed' },
        { id: 'agiwork-plan-2', description: 'write', status: 'completed' },
      ]),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('do the work', {
        workMode: 'agiwork',
        agiWorkGoal: { goal: 'do the work' },
      });
    });

    expect(assistantMessage()?.metadata?.agiWorkPlan).toEqual([
      { id: 'agiwork-plan-1', description: 'gather', status: 'completed' },
      { id: 'agiwork-plan-2', description: 'write', status: 'completed' },
    ]);
  });

  it('is a no-op for a stream that never sends the delta (additive guard)', async () => {
    installFetch([contentDelta('plain answer, no plan')]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hello', {
        workMode: 'agiwork',
        agiWorkGoal: { goal: 'hello' },
      });
    });

    const msg = assistantMessage();
    expect(msg?.content).toBe('plain answer, no plan');
    expect(msg?.metadata?.agiWorkPlan).toBeUndefined();
  });
});

describe('useChatStream AGI Work goal request', () => {
  it('carries the structured goal as agi_work_goal on an AGI Work send', async () => {
    installFetch([contentDelta('ok')]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('build a spreadsheet', {
        workMode: 'agiwork',
        agiWorkGoal: {
          goal: 'build a spreadsheet',
          constraints: 'no macros',
          deliverable: 'an .xlsx file',
        },
      });
    });

    expect(completionBody()['agi_work_goal']).toEqual({
      goal: 'build a spreadsheet',
      constraints: 'no macros',
      deliverable: 'an .xlsx file',
    });
  });

  it('never attaches agi_work_goal to a non-AGI-Work send', async () => {
    installFetch([contentDelta('plain answer')]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hello', {
        agiWorkGoal: { goal: 'hello' },
      });
    });

    expect(completionBody()['agi_work_goal']).toBeUndefined();
  });
});
