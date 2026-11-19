import { act, renderHook } from '@testing-library/react-native';
import { AGENT_EVENT_SCHEMA_VERSION, AgentTaskStateSchema } from '@agiworkforce/cloud-contracts';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import { SYNTHETIC_CLOUD_MODEL_ID } from '../test-utils/modelFixtures';

const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockMarkConversationForSync = jest.fn();
const mockMarkMessageForSync = jest.fn();
const mockSyncNow = jest.fn(async () => undefined);
jest.mock('@/services/cloudSyncEngine', () => ({
  markConversationForSync: (...args: unknown[]) => mockMarkConversationForSync(...args),
  markMessageForSync: (...args: unknown[]) => mockMarkMessageForSync(...args),
  syncNow: () => mockSyncNow(),
}));

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: jest.fn((cb: () => void) => cb()),
    rehydrateWhenMmkvReady: jest.fn(),
    mmkvStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
      clearAll: () => values.clear(),
    },
  };
});

import { storage } from '@/lib/mmkv';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { finishedRunAnswer, restoreFinishedRunAnswer } from '@/src/features/chat/finishedRunAnswer';
import {
  IN_FLIGHT_TURN_RECHECK_MS,
  useInFlightTurnRecovery,
} from '@/src/features/chat/inFlightTurnRecovery';
import {
  forgetInFlightTurnRun,
  inFlightTurnFor,
  recordInFlightTurnRun,
  recordInFlightTurnSend,
} from '@/src/features/chat/inFlightTurnRun';
import { hasUnfinishedRun } from '@/src/features/chat/utils/agentActivity';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import type { ChatMessage } from '@/types/chat';

const CONVERSATION_ID = 'conversation-1';
const QUESTION_ID = '01a1e712-6f5a-7001-9bb3-05395af293a2';
const ANSWER_ID = '01a1e712-6f5a-7001-9bb3-05395af293a3';
const RUN_ID = 'b5f2f046-81ba-4c34-a171-f8984ff97903';
const ROOT_ID = '01a1e712-6f5a-7001-9bb3-05395af29300';
const MOBILE_REQUEST_ID = createManagedChatIdempotencyKey({
  surface: 'mobile',
  purpose: 'send',
  operationId: ANSWER_ID,
});
const SENT_AT = '2026-11-16T18:00:00.000Z';
const FINISHED_AT = '2026-11-16T18:00:42.000Z';
const SOURCE_URL = 'https://example.com/report';

function run(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: MOBILE_REQUEST_ID,
    conversationId: CONVERSATION_ID,
    originSurface: 'mobile',
    workMode: 'chat',
    state: 'ready_for_review',
    provider: 'fixture-provider',
    model: SYNTHETIC_CLOUD_MODEL_ID,
    lastEventSequence: 6,
    cancellationRequestedAt: null,
    completedAt: FINISHED_AT,
    createdAt: SENT_AT,
    updatedAt: FINISHED_AT,
    ...overrides,
  };
}

function envelope(sequence: number, event: AgentEventEnvelope['event']): AgentEventEnvelope {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: ANSWER_ID,
    turnId: MOBILE_REQUEST_ID,
    sequence,
    emittedAtMs: Date.parse(SENT_AT) + sequence * 1_000,
    event,
  } as AgentEventEnvelope;
}

const finishedEvents: AgentEventEnvelope[] = [
  envelope(0, { type: 'task-state-changed', state: 'queued', taskId: MOBILE_REQUEST_ID }),
  envelope(1, { type: 'task-state-changed', state: 'running', taskId: MOBILE_REQUEST_ID }),
  envelope(2, { type: 'lifecycle', phase: 'started' }),
  envelope(3, { type: 'text-delta', delta: 'The answer the server ' }),
  envelope(4, {
    type: 'source-list',
    sources: [{ url: SOURCE_URL, title: 'Quarterly report' }],
  }),
  envelope(5, { type: 'text-delta', delta: 'finished after the app closed.' }),
  envelope(6, { type: 'task-state-changed', state: 'ready_for_review', taskId: MOBILE_REQUEST_ID }),
  envelope(7, { type: 'stop', reason: 'end-turn' }),
] as AgentEventEnvelope[];

function snapshot(
  runRow: CloudAgentRun,
  events: readonly AgentEventEnvelope[],
  nextAfterSequence = events.length > 0 ? events[events.length - 1]!.sequence : -1,
) {
  return { ok: true, json: async () => ({ run: runRow, events, nextAfterSequence }) };
}

function runsResponse(runs: unknown[]) {
  return { ok: true, json: async () => ({ runs }) };
}

function lookupResponse(runs: CloudAgentRun[]) {
  return { ok: true, json: async () => ({ runs, nextCursor: null }) };
}

const question: ChatMessage = {
  id: QUESTION_ID,
  conversationId: CONVERSATION_ID,
  role: 'user',
  content: 'What changed this quarter?',
  createdAt: SENT_AT,
  parentId: ROOT_ID,
  metadata: { requestedModel: SYNTHETIC_CLOUD_MODEL_ID },
} as ChatMessage;

function seedQuestion(): void {
  useChatCloudMessageStore.setState({
    conversations: [
      {
        id: CONVERSATION_ID,
        title: 'Quarter',
        activeLeafMessageId: QUESTION_ID,
      } as never,
    ],
    messages: { [CONVERSATION_ID]: [question] },
  });
}

function storedRows(): ChatMessage[] {
  return useChatCloudMessageStore.getState().messages[CONVERSATION_ID] ?? [];
}

function renderRecovery(onFinished = jest.fn()) {
  return renderHook(() =>
    useInFlightTurnRecovery({
      conversationId: CONVERSATION_ID,
      isCloud: true,
      isStreaming: false,
      isOnline: true,
      messages: storedRows(),
      onFinished,
    }),
  );
}

function inFlightTurnRunFor(conversationId: string, questionId: string): string | null {
  return inFlightTurnFor(conversationId, questionId)?.runId ?? null;
}

function requestedPaths(): string[] {
  return mockApiFetch.mock.calls.map((call) => String(call[0]));
}

function requestedMethods(): string[] {
  return mockApiFetch.mock.calls.map((call) => String((call[1] as { method?: string }).method));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse(FINISHED_AT) + 60_000);
  mockApiFetch.mockReset();
  mockMarkConversationForSync.mockReset();
  mockMarkMessageForSync.mockReset();
  mockSyncNow.mockClear();
  storage.clearAll();
  seedQuestion();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the run a sent question started', () => {
  it('is kept per conversation and read back only for the question that started it', () => {
    recordInFlightTurnRun({
      conversationId: CONVERSATION_ID,
      questionId: QUESTION_ID,
      runId: RUN_ID,
    });
    expect(inFlightTurnRunFor(CONVERSATION_ID, QUESTION_ID)).toBe(RUN_ID);
    expect(inFlightTurnRunFor(CONVERSATION_ID, 'another-question')).toBeNull();

    recordInFlightTurnRun({
      conversationId: CONVERSATION_ID,
      questionId: 'next-question',
      runId: 'next-run',
    });
    expect(inFlightTurnRunFor(CONVERSATION_ID, QUESTION_ID)).toBeNull();
    expect(inFlightTurnRunFor(CONVERSATION_ID, 'next-question')).toBe('next-run');

    forgetInFlightTurnRun(CONVERSATION_ID, QUESTION_ID);
    expect(inFlightTurnRunFor(CONVERSATION_ID, 'next-question')).toBe('next-run');

    forgetInFlightTurnRun(CONVERSATION_ID, 'next-question');
    expect(inFlightTurnRunFor(CONVERSATION_ID, 'next-question')).toBeNull();

    recordInFlightTurnRun({
      conversationId: CONVERSATION_ID,
      questionId: QUESTION_ID,
      runId: RUN_ID,
    });
    forgetInFlightTurnRun(CONVERSATION_ID);
    expect(inFlightTurnRunFor(CONVERSATION_ID, QUESTION_ID)).toBeNull();
  });

  it('reads as nothing when what is stored cannot be parsed', () => {
    storage.set('agi-in-flight-turn-runs-v1', '{not json');
    expect(inFlightTurnRunFor(CONVERSATION_ID, QUESTION_ID)).toBeNull();
  });
});

describe('an answer rebuilt from a finished run', () => {
  it('has the text, sources, model and row id the phone would have saved', () => {
    const answer = finishedRunAnswer({
      conversationId: CONVERSATION_ID,
      question,
      run: run(),
      events: finishedEvents,
    });

    expect(answer).not.toBeNull();
    expect(answer!.id).toBe(ANSWER_ID);
    expect(answer!.role).toBe('assistant');
    expect(answer!.parentId).toBe(QUESTION_ID);
    expect(answer!.content).toBe('The answer the server finished after the app closed.');
    expect(answer!.model).toBe(SYNTHETIC_CLOUD_MODEL_ID);
    expect(answer!.metadata?.finishReason).toBe('stop');
    expect(answer!.metadata?.['requestedModel']).toBe(SYNTHETIC_CLOUD_MODEL_ID);
    expect(answer!.citations?.map((source) => source.url)).toEqual([SOURCE_URL]);
    expect(answer!.isStreaming).toBeUndefined();
    expect(hasUnfinishedRun(answer!)).toBe(false);
    expect(Date.parse(answer!.createdAt)).toBeGreaterThan(Date.parse(SENT_AT));
  });

  it.each([
    ['the run was not started by this phone', { requestId: 'agi.chat.web.send.op-1' }],
    ['the run belongs to another conversation', { conversationId: 'conversation-2' }],
    ['the run is still working', { state: 'running' as const }],
  ])('is not built when %s', (_case, overrides) => {
    expect(
      finishedRunAnswer({
        conversationId: CONVERSATION_ID,
        question,
        run: run(overrides),
        events: finishedEvents,
      }),
    ).toBeNull();
  });

  it.each([
    ['it wrote no text', finishedEvents.filter((event) => event.event.type !== 'text-delta')],
    [
      'it stopped on an error',
      [...finishedEvents.slice(0, 6), envelope(7, { type: 'stop', reason: 'error' })],
    ],
  ])('is not built when %s', (_case, events) => {
    expect(
      finishedRunAnswer({ conversationId: CONVERSATION_ID, question, run: run(), events }),
    ).toBeNull();
  });

  it('is written under its question once and queued for sync once', () => {
    const answer = finishedRunAnswer({
      conversationId: CONVERSATION_ID,
      question,
      run: run(),
      events: finishedEvents,
    })!;

    expect(restoreFinishedRunAnswer(CONVERSATION_ID, QUESTION_ID, answer)).toBe(true);
    expect(restoreFinishedRunAnswer(CONVERSATION_ID, QUESTION_ID, answer)).toBe(false);

    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
    expect(useChatCloudMessageStore.getState().conversations[0]?.activeLeafMessageId).toBe(
      ANSWER_ID,
    );
    expect(mockMarkMessageForSync).toHaveBeenCalledTimes(1);
    expect(mockMarkMessageForSync).toHaveBeenCalledWith(CONVERSATION_ID, ANSWER_ID);
    expect(mockMarkConversationForSync).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
  });

  it('is added at the end of a thread with no branches, which keeps no leaf', () => {
    const linearQuestion = { ...question, parentId: undefined } as ChatMessage;
    useChatCloudMessageStore.setState({
      conversations: [{ id: CONVERSATION_ID, title: 'Quarter' } as never],
      messages: { [CONVERSATION_ID]: [linearQuestion] },
    });
    const answer = finishedRunAnswer({
      conversationId: CONVERSATION_ID,
      question: linearQuestion,
      run: run(),
      events: finishedEvents,
    })!;

    expect(answer.parentId).toBeUndefined();
    expect(restoreFinishedRunAnswer(CONVERSATION_ID, QUESTION_ID, answer)).toBe(true);
    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
    expect(
      useChatCloudMessageStore.getState().conversations[0]?.activeLeafMessageId,
    ).toBeUndefined();
  });
});

describe('reopening a chat whose answer the server finished after the app was ended', () => {
  beforeEach(() => {
    recordInFlightTurnRun({
      conversationId: CONVERSATION_ID,
      questionId: QUESTION_ID,
      runId: RUN_ID,
    });
  });

  it('shows the answer from the run with no notice and never sends the question again', async () => {
    mockApiFetch.mockResolvedValue(snapshot(run(), finishedEvents));
    const onFinished = jest.fn();
    const { result } = renderRecovery(onFinished);

    await act(async () => {});

    expect(result.current).toBe('idle');
    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
    expect(storedRows()[1]?.content).toBe('The answer the server finished after the app closed.');
    expect(requestedMethods()).toEqual(['GET']);
    expect(requestedPaths()[0]).toBe(
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=-1&limit=1`,
    );
    expect(onFinished).not.toHaveBeenCalled();
    expect(inFlightTurnRunFor(CONVERSATION_ID, QUESTION_ID)).toBeNull();
  });

  it('reads every page of a long answer before showing it', async () => {
    mockApiFetch
      .mockResolvedValueOnce(snapshot(run({ lastEventSequence: 7 }), finishedEvents.slice(0, 1)))
      .mockResolvedValueOnce(snapshot(run({ lastEventSequence: 7 }), finishedEvents.slice(1, 4)))
      .mockResolvedValueOnce(snapshot(run({ lastEventSequence: 7 }), finishedEvents.slice(4)));
    const { result } = renderRecovery();

    await act(async () => {});

    expect(result.current).toBe('idle');
    expect(requestedPaths()).toEqual([
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=-1&limit=1`,
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=0&limit=500`,
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=3&limit=500`,
    ]);
    expect(storedRows()[1]?.content).toBe('The answer the server finished after the app closed.');
  });

  it('keeps following a run that is still working and shows its answer once it finishes', async () => {
    mockApiFetch
      .mockResolvedValueOnce(
        snapshot(run({ state: 'running', staleForMs: 10, completedAt: null }), []),
      )
      .mockResolvedValue(snapshot(run(), finishedEvents));
    const { result } = renderRecovery();

    await act(async () => {});
    expect(result.current).toBe('running');
    expect(storedRows()).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });
    expect(result.current).toBe('idle');
    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
  });

  it('asks only for the state of a run that is still working, not its events', async () => {
    mockApiFetch.mockResolvedValue(
      snapshot(
        run({ state: 'running', staleForMs: 10, completedAt: null }),
        finishedEvents.slice(0, 1),
      ),
    );
    const { result } = renderRecovery();

    await act(async () => {});
    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });

    expect(result.current).toBe('running');
    expect(requestedPaths()).toEqual([
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=-1&limit=1`,
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=-1&limit=1`,
    ]);
  });

  it('shows the answer of a run that finished with a failed step', async () => {
    mockApiFetch.mockResolvedValue(snapshot(run({ state: 'partial' }), finishedEvents));
    const { result } = renderRecovery();

    await act(async () => {});

    expect(result.current).toBe('idle');
    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
  });

  it.each([['failed' as const], ['cancelled' as const], ['timed_out' as const]])(
    'shows the stopped notice when the run %s',
    async (state) => {
      mockApiFetch.mockResolvedValue(snapshot(run({ state }), finishedEvents));
      const { result } = renderRecovery();

      await act(async () => {});

      expect(result.current).toBe('stalled');
      expect(storedRows()).toHaveLength(1);
      expect(mockMarkMessageForSync).not.toHaveBeenCalled();
    },
  );

  it('shows the stopped notice when a finished run wrote no answer', async () => {
    mockApiFetch.mockResolvedValue(
      snapshot(
        run(),
        finishedEvents.filter((event) => event.event.type !== 'text-delta'),
      ),
    );
    const { result } = renderRecovery();

    await act(async () => {});

    expect(result.current).toBe('stalled');
    expect(storedRows()).toHaveLength(1);
  });

  it('reloads the chat for an answer another device started', async () => {
    mockApiFetch.mockResolvedValue(
      snapshot(run({ requestId: 'agi.chat.web.send.op-1' }), finishedEvents),
    );
    const onFinished = jest.fn();
    const { result } = renderRecovery(onFinished);

    await act(async () => {});

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(result.current).toBe('checking');
    expect(storedRows()).toHaveLength(1);
  });

  it('falls back to the list of working runs when the run cannot be read', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(runsResponse([{ state: 'running', staleForMs: 10 }]));
    const { result } = renderRecovery();

    await act(async () => {});

    expect(result.current).toBe('running');
    expect(requestedPaths()[1]).toBe(
      `/api/llm/v1/chat/completions/runs?conversationId=${CONVERSATION_ID}`,
    );
  });
});

describe('reopening a chat ended right after Send, before the run id arrived', () => {
  const LOOKUP_PATH = `/api/llm/v1/chat/completions/runs?${[
    ...AgentTaskStateSchema.options.map((state) => `state=${state}`),
    `requestId=${encodeURIComponent(MOBILE_REQUEST_ID)}`,
    'limit=1',
  ].join('&')}`;

  beforeEach(() => {
    recordInFlightTurnSend({
      conversationId: CONVERSATION_ID,
      questionId: QUESTION_ID,
      operationId: ANSWER_ID,
    });
  });

  it('finds the run by the request id the phone sent and shows its answer', async () => {
    mockApiFetch
      .mockResolvedValueOnce(lookupResponse([run()]))
      .mockResolvedValue(snapshot(run(), finishedEvents));
    const onFinished = jest.fn();
    const { result } = renderRecovery(onFinished);

    await act(async () => {});

    expect(result.current).toBe('idle');
    expect(requestedPaths()[0]).toBe(LOOKUP_PATH);
    expect(requestedPaths()[1]).toBe(
      `/api/llm/v1/chat/completions/runs/${RUN_ID}?after=-1&limit=1`,
    );
    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
    expect(requestedMethods().every((method) => method === 'GET')).toBe(true);
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('keeps the run it found, so a later check reads the run directly', async () => {
    mockApiFetch
      .mockResolvedValueOnce(lookupResponse([run()]))
      .mockResolvedValue(
        snapshot(run({ state: 'running', staleForMs: 10, completedAt: null }), []),
      );
    const { result } = renderRecovery();

    await act(async () => {});

    expect(result.current).toBe('running');
    expect(inFlightTurnRunFor(CONVERSATION_ID, QUESTION_ID)).toBe(RUN_ID);
    expect(inFlightTurnFor(CONVERSATION_ID, QUESTION_ID)?.operationId).toBe(ANSWER_ID);
  });

  it('shows the stopped notice with Retry when that run failed', async () => {
    mockApiFetch
      .mockResolvedValueOnce(lookupResponse([run({ state: 'failed' })]))
      .mockResolvedValue(snapshot(run({ state: 'failed' }), finishedEvents));
    const { result } = renderRecovery();

    await act(async () => {});

    expect(result.current).toBe('stalled');
    expect(storedRows()).toHaveLength(1);
  });

  it('falls back to the working runs when the server finds no run by that id', async () => {
    mockApiFetch.mockResolvedValueOnce(lookupResponse([])).mockResolvedValueOnce(runsResponse([]));
    const { result } = renderRecovery();

    await act(async () => {});

    expect(requestedPaths()).toEqual([
      LOOKUP_PATH,
      `/api/llm/v1/chat/completions/runs?conversationId=${CONVERSATION_ID}`,
    ]);
    expect(result.current).toBe('waiting');
    expect(storedRows()).toHaveLength(1);
  });
});

describe('reopening while the answer is still being written, with no run kept on the phone', () => {
  it('follows the run the server lists and shows its answer once it finishes', async () => {
    mockApiFetch
      .mockResolvedValueOnce(runsResponse([{ id: RUN_ID, state: 'running', staleForMs: 10 }]))
      .mockResolvedValue(snapshot(run(), finishedEvents));
    const onFinished = jest.fn();
    const { result } = renderRecovery(onFinished);

    await act(async () => {});
    expect(result.current).toBe('running');

    await act(async () => {
      jest.advanceTimersByTime(IN_FLIGHT_TURN_RECHECK_MS);
    });

    expect(result.current).toBe('idle');
    expect(storedRows().map((row) => row.id)).toEqual([QUESTION_ID, ANSWER_ID]);
    expect(onFinished).not.toHaveBeenCalled();
  });
});

describe('reopening a chat whose answer was saved', () => {
  it('asks the server nothing and shows no notice', async () => {
    recordInFlightTurnRun({
      conversationId: CONVERSATION_ID,
      questionId: QUESTION_ID,
      runId: RUN_ID,
    });
    const saved = finishedRunAnswer({
      conversationId: CONVERSATION_ID,
      question,
      run: run(),
      events: finishedEvents,
    })!;
    useChatCloudMessageStore.setState({
      messages: { [CONVERSATION_ID]: [question, saved] },
    });

    const { result } = renderRecovery();
    await act(async () => {});

    expect(result.current).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
