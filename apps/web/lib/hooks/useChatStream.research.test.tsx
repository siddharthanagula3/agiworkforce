import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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

const secondSearchResults = {
  choices: [
    {
      delta: {
        x_search_results: {
          content: [
            { type: 'web_search_result', url: 'https://a.com', title: 'A', position: 1 },
            { type: 'web_search_result', url: 'https://c.com', title: 'C', position: 2 },
          ],
        },
      },
      index: 0,
    },
  ],
};

const trackingDuplicateSearchResults = {
  choices: [
    {
      delta: {
        x_search_results: {
          content: [
            {
              type: 'web_search_result',
              url: 'https://a.com/?utm_source=newsletter&utm_campaign=weekly',
              title: 'A via newsletter',
              position: 1,
            },
            { type: 'web_search_result', url: 'https://d.com', title: 'D', position: 2 },
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

  it('merges sources across multiple search calls in one turn instead of replacing them', async () => {
    installFetch([
      researchStatus('searching'),
      searchResults,
      researchStatus('searching'),
      secondSearchResults,
      researchStatus('synthesizing'),
      contentDelta('Final report [1][2][3]'),
      researchStatus('complete'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    const msg = assistantMessage();
    expect(msg?.metadata?.searchResults).toEqual([
      { url: 'https://a.com', title: 'A', snippet: '' },
      { url: 'https://b.com', title: 'B', snippet: '' },
      { url: 'https://c.com', title: 'C', snippet: '' },
    ]);
  });

  it('dedupes sources that only differ by tracking query parameters', async () => {
    installFetch([
      researchStatus('searching'),
      searchResults,
      researchStatus('searching'),
      trackingDuplicateSearchResults,
      researchStatus('synthesizing'),
      contentDelta('Final report [1][2][3]'),
      researchStatus('complete'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    const msg = assistantMessage();
    expect(msg?.metadata?.searchResults).toEqual([
      { url: 'https://a.com', title: 'A', snippet: '' },
      { url: 'https://b.com', title: 'B', snippet: '' },
      { url: 'https://d.com', title: 'D', snippet: '' },
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

  it('keeps a plan paused for approval instead of dropping the phase', async () => {
    installFetch([researchStatus('planning'), researchStatus('awaiting_approval')]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', { research: true });
    });

    expect(assistantMessage()?.metadata?.research?.phase).toBe('awaiting_approval');
  });

  it('sends the approved plan back as research_resume.approved_steps', async () => {
    installFetch([contentDelta('Report'), researchStatus('complete')]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('research the topic', {
        research: true,
        researchResume: {
          sources: [],
          steps: [],
          approvedSteps: [
            { id: 'plan-1', type: 'search', description: 'alpha', status: 'pending' },
          ],
        },
      });
    });

    expect(completionBodies()[0]?.['research_resume']).toEqual({
      sources: [],
      steps: [],
      approved_steps: [{ id: 'plan-1', type: 'search', description: 'alpha', status: 'pending' }],
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

    expect(firstKey?.['Idempotency-Key']).toBeTruthy();
    expect(secondKey?.['Idempotency-Key']).toBeTruthy();
    expect(secondKey?.['Idempotency-Key']).not.toBe(firstKey?.['Idempotency-Key']);
  });
});

function citationDelta(url: string, title: string) {
  return { choices: [{ delta: { x_citation: { url, title } }, index: 0 }] };
}

describe('useChatStream native web search citation annotations', () => {
  it('accumulates each x_citation event in first-appearance order, deduped by url', async () => {
    installFetch([
      citationDelta('https://openai.com/index/expanding-daybreak/', 'Expanding Daybreak'),
      citationDelta(
        'https://blog.google/products/pixel-watch-5/',
        'Pixel Watch 5: Proactive assistance',
      ),
      citationDelta('https://openai.com/index/expanding-daybreak/', 'Expanding Daybreak'),
      contentDelta('Two claims, one about OpenAI [1] and one about Google [2].'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('what shipped this week');
    });

    expect(assistantMessage()?.metadata?.citations).toEqual([
      {
        type: 'url_citation',
        url: 'https://openai.com/index/expanding-daybreak/',
        title: 'Expanding Daybreak',
      },
      {
        type: 'url_citation',
        url: 'https://blog.google/products/pixel-watch-5/',
        title: 'Pixel Watch 5: Proactive assistance',
      },
    ]);
  });

  it('dedupes two spellings of one url through the same normalization the inline markers use', async () => {
    installFetch([
      citationDelta('https://openai.com/index/expanding-daybreak/', 'Expanding Daybreak'),
      citationDelta(
        'https://www.openai.com/index/expanding-daybreak?utm_source=share',
        'Expanding Daybreak (shared)',
      ),
      contentDelta('One claim about OpenAI [1].'),
    ]);

    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('what shipped this week');
    });

    expect(assistantMessage()?.metadata?.citations).toEqual([
      {
        type: 'url_citation',
        url: 'https://openai.com/index/expanding-daybreak/',
        title: 'Expanding Daybreak',
      },
    ]);
  });
});
