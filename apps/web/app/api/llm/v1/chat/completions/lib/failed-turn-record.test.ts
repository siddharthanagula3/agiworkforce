import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const persistence = vi.hoisted(() => ({
  persistAssistantTurn: vi.fn(async () => undefined),
}));

vi.mock('./assistant-turn-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assistant-turn-persistence')>()),
  persistAssistantTurn: persistence.persistAssistantTurn,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { listCanonicalModels } from '@agiworkforce/types';
import { recordFailedTurn } from './failed-turn-record';
import type { ProcessedRequest } from './request-processor';

const CONVERSATION_ID = 'e0e2b0d6-6d1f-4a3b-9a5e-2a1f0c8b4d11';
const ASSISTANT_MESSAGE_ID = 'a1b2c3d4-6d1f-4a3b-9a5e-2a1f0c8b4d22';
const USER_ID = 'user-1';

const ZERO_COST_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) => candidate.inputCost === 0 && candidate.outputCost === 0 && candidate.apiModelId,
  );
  if (!model) throw new Error('The catalog must expose a zero-cost model with an api id');
  return model;
})();

function processedRequest(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    conversationId: CONVERSATION_ID,
    assistantMessageId: ASSISTANT_MESSAGE_ID,
    conversationIsTemporary: false,
    provider: 'openrouter',
    requestId: 'request-1',
    chatRequest: { model: ZERO_COST_MODEL.id },
    llmRequest: { model: ZERO_COST_MODEL.apiModelId },
    ...overrides,
  } as unknown as ProcessedRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Until this existed the server kept no record of a turn that failed before it
 * produced anything, so a reload showed the user's own message trailing with
 * nothing after it, and the transcript inferred "no response" from a stopwatch.
 */
describe('recording a turn that produced nothing', () => {
  it('writes the outcome through the assistant turn owner', async () => {
    await recordFailedTurn(processedRequest(), USER_ID, new AbortController().signal);

    expect(persistence.persistAssistantTurn).toHaveBeenCalledTimes(1);
    expect(persistence.persistAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        snapshot: {
          content: '',
          truncated: true,
          model: ZERO_COST_MODEL.id,
          provider: 'openrouter',
          inputTokens: 0,
          outputTokens: 0,
        },
      }),
    );
  });

  it('records nothing for a turn the user stopped', async () => {
    const stopped = new AbortController();
    stopped.abort();

    await recordFailedTurn(processedRequest(), USER_ID, stopped.signal);

    expect(persistence.persistAssistantTurn).not.toHaveBeenCalled();
  });

  it('records nothing for a temporary conversation', async () => {
    await recordFailedTurn(
      processedRequest({ conversationIsTemporary: true }),
      USER_ID,
      new AbortController().signal,
    );

    expect(persistence.persistAssistantTurn).not.toHaveBeenCalled();
  });

  it('records nothing when the turn carries no row to write', async () => {
    await recordFailedTurn(
      processedRequest({ assistantMessageId: undefined }),
      USER_ID,
      new AbortController().signal,
    );

    expect(persistence.persistAssistantTurn).not.toHaveBeenCalled();
  });

  it('never lets a failed write mask the failure being reported', async () => {
    persistence.persistAssistantTurn.mockRejectedValueOnce(new Error('database is gone'));

    await expect(
      recordFailedTurn(processedRequest(), USER_ID, new AbortController().signal),
    ).resolves.toBeUndefined();
  });
});

/**
 * The recorder is only useful if the transcript reads what it writes. These two
 * are the client-side predicates a reloaded conversation runs against the
 * persisted row, asserted here so the pair cannot drift apart silently.
 */
describe('the recorded outcome is the one the transcript reads', () => {
  it('is treated as a turn that did not complete, not as a healthy answer', async () => {
    const { isIncompleteTurn } = await import('@/features/chat/lib/turn-error-notice');
    const recorded = {
      id: ASSISTANT_MESSAGE_ID,
      role: 'assistant' as const,
      content: '',
      metadata: { serverPersisted: true, truncated: true },
    };

    expect(isIncompleteTurn(recorded as never)).toBe(true);
  });

  it('stops the transcript inferring the outcome from a trailing user message', async () => {
    const { resolveTurnErrorNotice } = await import('@/features/chat/lib/turn-error-notice');

    const fromTheRecord = resolveTurnErrorNotice({
      lastMessage: {
        id: ASSISTANT_MESSAGE_ID,
        role: 'assistant',
        content: '',
        metadata: { serverPersisted: true, truncated: true },
      } as never,
      isLoading: false,
      reportedTurnError: null,
      pastGracePeriod: false,
    });

    expect(fromTheRecord).toBeTruthy();
  });
});
