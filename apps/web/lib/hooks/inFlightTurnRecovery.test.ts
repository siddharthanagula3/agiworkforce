import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '@shared/stores/web-chat-store';
import { askWhetherTurnIsRunning, shouldAskWhetherTurnIsRunning } from './inFlightTurnRecovery';

const CONVERSATION_ID = '8f2d3f5a-1c4e-4c3a-9f2b-6b0f9d3c1a77';

function message(overrides: Partial<Message>): Message {
  return {
    id: 'm1',
    role: 'user',
    content: 'hi',
    createdAt: '2026-09-08T03:43:15.000Z',
    ...overrides,
  } as Message;
}

function question(overrides: Partial<Parameters<typeof shouldAskWhetherTurnIsRunning>[0]> = {}) {
  return {
    conversationId: CONVERSATION_ID,
    messages: [message({})],
    isLoading: false,
    isTemporaryConversation: false,
    ...overrides,
  };
}

/**
 * The founder's second frame: after a reload the transcript ended on their own
 * message, and the only thing it had to reason from was a stopwatch. The server
 * held a run row saying `running` the whole time.
 */
describe('deciding whether to ask the server', () => {
  it('asks when the reader is left looking at their own message', () => {
    expect(shouldAskWhetherTurnIsRunning(question())).toBe(true);
  });

  it('does not ask when this tab is already streaming the answer', () => {
    expect(shouldAskWhetherTurnIsRunning(question({ isLoading: true }))).toBe(false);
    expect(
      shouldAskWhetherTurnIsRunning(
        question({ messages: [message({ role: 'assistant', isStreaming: true })] }),
      ),
    ).toBe(false);
  });

  it('does not ask when an answer is already there', () => {
    expect(
      shouldAskWhetherTurnIsRunning(
        question({ messages: [message({}), message({ id: 'm2', role: 'assistant' })] }),
      ),
    ).toBe(false);
  });

  it('does not ask about a conversation the server has never seen', () => {
    expect(shouldAskWhetherTurnIsRunning(question({ isTemporaryConversation: true }))).toBe(false);
    expect(shouldAskWhetherTurnIsRunning(question({ conversationId: null }))).toBe(false);
  });

  it('does not ask about an empty conversation', () => {
    expect(shouldAskWhetherTurnIsRunning(question({ messages: [] }))).toBe(false);
  });
});

describe('asking the server', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scopes the question to one conversation', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

    await askWhetherTurnIsRunning(CONVERSATION_ID, new AbortController().signal);

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      `/api/llm/v1/chat/completions/runs?conversationId=${CONVERSATION_ID}`,
    );
  });

  it('reports a turn in flight when the server has one', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ runs: [{ id: 'run-1', state: 'running' }] }), { status: 200 }),
    );

    await expect(
      askWhetherTurnIsRunning(CONVERSATION_ID, new AbortController().signal),
    ).resolves.toBe(true);
  });

  it('reports none when the server has none', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

    await expect(
      askWhetherTurnIsRunning(CONVERSATION_ID, new AbortController().signal),
    ).resolves.toBe(false);
  });

  it('claims nothing when the server will not answer', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(
      askWhetherTurnIsRunning(CONVERSATION_ID, new AbortController().signal),
    ).resolves.toBe(false);
  });
});
