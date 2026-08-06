/**
 * Deep Research client-side stream handling tests:
 *   - x_research_status events populate message.metadata.research
 *   - cumulative x_search_results land in metadata.searchResults
 *   - the finished run persists research metadata with a FRESH auth token
 *     resolved at save time (long runs outlive the send-time JWT)
 *   - cancellation marks the run interrupted and persists partial content
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getTokenMock = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { useChatStream } from './useChatStream';
import { useChatStore } from '@shared/stores/web-chat-store';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function sse(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function researchStatus(phase: string, extra: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        delta: {
          x_research_status: {
            phase,
            label: `label:${phase}`,
            iteration: 1,
            max_iterations: 6,
            searches: 2,
            sources: 2,
            elapsed_ms: 1500,
            ...extra,
          },
        },
        index: 0,
      },
    ],
  };
}

const searchResults = {
  choices: [
    {
      delta: {
        x_search_results: {
          content: [
            { type: 'web_search_result', url: 'https://a.com', title: 'A', position: 1 },
            { type: 'web_search_result', url: 'https://b.com', title: 'B', position: 2 },
          ],
        },
      },
      index: 0,
    },
  ],
};

function contentDelta(text: string) {
  return { choices: [{ delta: { content: text }, index: 0 }] };
}

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let saveBodies: Array<Record<string, unknown>> = [];

/**
 * Install a fetch mock: the completions call streams `events` then [DONE]
 * (unless `hang` is set, in which case it stalls after the events until the
 * abort signal fires); message-save calls are recorded and succeed.
 */
function installFetch(events: unknown[], opts: { hang?: boolean } = {}) {
  fetchCalls = [];
  saveBodies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      fetchCalls.push({ url, init });
      if (url.includes('/api/llm/v1/chat/completions')) {
        const queue = [...events.map((e) => sse(e))];
        if (!opts.hang) queue.push(encoder.encode('data: [DONE]\n\n'));
        const signal = init.signal as AbortSignal | undefined;
        const body = new ReadableStream({
          async pull(controller) {
            const next = queue.shift();
            if (next) {
              controller.enqueue(next);
              return;
            }
            if (!opts.hang) {
              controller.close();
              return;
            }
            // Stall until aborted, then reject like a real aborted fetch read.
            await new Promise((_, reject) => {
              const fail = () => reject(new DOMException('Aborted', 'AbortError'));
              if (signal?.aborted) fail();
              signal?.addEventListener('abort', fail);
            });
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
      // Message persistence endpoint.
      const parsed = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      saveBodies.push({
        ...parsed,
        __auth: (init.headers as Record<string, string>)['Authorization'],
      });
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
        title: 'Research chat',
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

beforeEach(() => {
  vi.restoreAllMocks();
  let tokenCounter = 0;
  getTokenMock.mockReset();
  getTokenMock.mockImplementation(async () => `token-${++tokenCounter}`);
  seedConversation();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useChatStream deep research handling', () => {
  it('tracks research phases, sources, and report content from the stream', async () => {
    installFetch([
      researchStatus('planning'),
      researchStatus('searching'),
      searchResults,
      researchStatus('synthesizing'),
      contentDelta('Final report [1][2]'),
      researchStatus('complete'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    const msg = assistantMessage();
    expect(msg?.content).toBe('Final report [1][2]');
    expect(msg?.metadata?.research).toMatchObject({
      phase: 'complete',
      label: 'label:complete',
      searches: 2,
      sources: 2,
      elapsedMs: 1500,
    });
    expect(msg?.metadata?.searchResults).toEqual([
      { url: 'https://a.com', title: 'A', snippet: '' },
      { url: 'https://b.com', title: 'B', snippet: '' },
    ]);
  });

  it('persists the research metadata with a save-time (fresh) auth token', async () => {
    installFetch([
      researchStatus('searching'),
      searchResults,
      contentDelta('Report body'),
      researchStatus('complete'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    await waitFor(() => {
      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      expect(assistantSave).toBeDefined();
    });
    const assistantSave = saveBodies.find((b) => b['role'] === 'assistant')!;
    expect(assistantSave['content']).toBe('Report body');
    const metadata = assistantSave['metadata'] as Record<string, unknown>;
    expect(metadata['research']).toMatchObject({ phase: 'complete' });
    // Token 1 was minted at send time; every save resolves a fresh token
    // afterwards, so the persistence write must NOT reuse token-1.
    expect(assistantSave['__auth']).not.toBe('Bearer token-1');
  });

  it('marks the run interrupted and persists partial content on cancel', async () => {
    installFetch([researchStatus('searching'), searchResults, contentDelta('Partial repo')], {
      hang: true,
    });

    const { result } = renderHook(() => useChatStream());
    let sendPromise: Promise<boolean>;
    await act(async () => {
      sendPromise = result.current.sendMessage('research the topic', { research: true });
      // Let the stream deliver its events, then cancel mid-run.
      await waitFor(() => {
        expect(assistantMessage()?.metadata?.research?.phase).toBe('searching');
      });
      result.current.stopGeneration();
      await sendPromise;
    });

    const msg = assistantMessage();
    expect(msg?.metadata?.research?.phase).toBe('interrupted');
    expect(msg?.content).toBe('Partial repo');

    await waitFor(() => {
      const assistantSave = saveBodies.find((b) => b['role'] === 'assistant');
      expect(assistantSave).toBeDefined();
    });
    const assistantSave = saveBodies.find((b) => b['role'] === 'assistant')!;
    expect(assistantSave['content']).toBe('Partial repo');
    expect((assistantSave['metadata'] as Record<string, unknown>)['research']).toMatchObject({
      phase: 'interrupted',
    });
  });
});

// ─── CAP-045 slice 2/4: plan surface + retry ─────────────────────────────────

function researchPlan(steps: Array<Record<string, unknown>>) {
  return { choices: [{ delta: { x_research_plan: { steps } }, index: 0 }] };
}

describe('useChatStream research plan reduction', () => {
  it('stores the plan and replaces it wholesale as steps advance', async () => {
    installFetch([
      researchStatus('planning'),
      researchPlan([
        { id: 'plan-1', type: 'search', description: 'alpha', status: 'pending' },
        { id: 'plan-2', type: 'search', description: 'beta', status: 'pending' },
      ]),
      researchStatus('searching'),
      researchPlan([
        { id: 'plan-1', type: 'search', description: 'alpha', status: 'completed' },
        { id: 'plan-2', type: 'search', description: 'beta', status: 'completed' },
        { id: 'synthesize', type: 'synthesize', description: 'Write report', status: 'running' },
      ]),
      contentDelta('Report'),
      researchStatus('complete'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    expect(assistantMessage()?.metadata?.research?.steps).toEqual([
      { id: 'plan-1', type: 'search', description: 'alpha', status: 'completed' },
      { id: 'plan-2', type: 'search', description: 'beta', status: 'completed' },
      { id: 'synthesize', type: 'synthesize', description: 'Write report', status: 'running' },
    ]);
    // A later status event must not wipe the plan.
    expect(assistantMessage()?.metadata?.research?.phase).toBe('complete');
  });

  it('ignores a malformed plan event rather than erasing a good plan', async () => {
    installFetch([
      researchPlan([{ id: 'plan-1', type: 'search', description: 'alpha', status: 'running' }]),
      researchPlan([{ id: 'plan-2', type: 'nonsense', description: 'bad', status: 'running' }]),
      contentDelta('Report'),
      researchStatus('complete'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    expect(assistantMessage()?.metadata?.research?.steps).toEqual([
      { id: 'plan-1', type: 'search', description: 'alpha', status: 'running' },
    ]);
  });

  it('keeps the gathered sources on the research state for a later retry', async () => {
    installFetch([
      researchStatus('searching'),
      searchResults,
      researchStatus('error'),
      contentDelta('Deep research failed'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    expect(assistantMessage()?.metadata?.research?.sourcesForRetry).toEqual([
      { url: 'https://a.com', title: 'A', snippet: '' },
      { url: 'https://b.com', title: 'B', snippet: '' },
    ]);
  });
});

describe('useChatStream research retry request', () => {
  function completionBodies(): Array<Record<string, unknown>> {
    return fetchCalls
      .filter((call) => call.url.includes('/api/llm/v1/chat/completions'))
      .map((call) => JSON.parse(call.init.body as string) as Record<string, unknown>);
  }

  it('sends carried sources and completed steps as research_resume', async () => {
    installFetch([contentDelta('Retried report'), researchStatus('complete')]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', {
        research: true,
        researchResume: {
          sources: [{ url: 'https://a.com', title: 'A' }],
          steps: [{ id: 'plan-1', type: 'search', description: 'alpha', status: 'completed' }],
        },
      });
    });

    const bodies = completionBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.['research']).toBe(true);
    expect(bodies[0]?.['research_resume']).toEqual({
      sources: [{ url: 'https://a.com', title: 'A' }],
      steps: [{ id: 'plan-1', type: 'search', description: 'alpha', status: 'completed' }],
    });
  });

  it('never attaches resume material to a non-research send', async () => {
    installFetch([contentDelta('plain answer')]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hello', {
        researchResume: { sources: [{ url: 'https://a.com' }], steps: [] },
      });
    });

    expect(completionBodies()[0]?.['research_resume']).toBeUndefined();
  });

  it('bills the retry as a NEW request: its own idempotency key, no reuse of the original', async () => {
    installFetch([contentDelta('first attempt'), researchStatus('error')]);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });
    const firstKey = fetchCalls.find((c) => c.url.includes('/api/llm/v1/chat/completions'))?.init
      .headers as Record<string, string> | undefined;

    installFetch([contentDelta('second attempt'), researchStatus('complete')]);
    await act(async () => {
      await result.current.sendMessage('research the topic', {
        research: true,
        researchResume: { sources: [{ url: 'https://a.com', title: 'A' }], steps: [] },
      });
    });
    const secondKey = fetchCalls.find((c) => c.url.includes('/api/llm/v1/chat/completions'))?.init
      .headers as Record<string, string> | undefined;

    // A distinct Idempotency-Key means the server opens a NEW managed-usage
    // reservation; it can neither settle nor re-charge the original one.
    expect(firstKey?.['Idempotency-Key']).toBeTruthy();
    expect(secondKey?.['Idempotency-Key']).toBeTruthy();
    expect(secondKey?.['Idempotency-Key']).not.toBe(firstKey?.['Idempotency-Key']);
  });
});
