import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(async () => null),
  pauseE2BSession: vi.fn(),
}));
vi.mock('@/lib/server/generated-file-persist', () => ({
  persistGeneratedFileBytes: vi.fn(),
  MAX_GENERATED_FILE_BYTES: 20 * 1024 * 1024,
}));
vi.mock('@/lib/server/container-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/container-files')>();
  return { ...actual, persistGeneratedFiles: vi.fn(async () => ({ files: [], failedCount: 0 })) };
});

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

function makeProcessed(goal?: string): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-work',
    chatRequest: {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'do the work' }],
      stream: true,
      work_mode: 'agiwork',
      ...(goal ? { agi_work_goal: { goal } } : {}),
    } as never,
    conversationId: undefined,
    requestedModel: 'gpt-test',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'do the work' }],
      max_tokens: 1000,
      stream: true,
    },
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function agentEvents(output: string): Array<Record<string, unknown>> {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice('data: '.length)))
    .flatMap(
      (payload: { choices?: Array<{ delta?: { x_agent_event?: { event?: unknown } } }> }) => {
        const event = payload.choices?.[0]?.delta?.x_agent_event?.event;
        return event ? [event as Record<string, unknown>] : [];
      },
    );
}

function taskStates(output: string): unknown[] {
  return agentEvents(output)
    .filter((event) => event['type'] === 'task-state-changed')
    .map((event) => event['state']);
}

beforeEach(() => {
  mockBuildToolLoopStream.mockReset();
});

describe('runToolLoop Work states', () => {
  it('reports planning while the AGI Work plan turn runs, then running', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: '["Research", "Summarise"]' }), chunk({}, 'stop')]),
      )
      .mockResolvedValueOnce(sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]));

    const output = await drain(
      runToolLoop(makeProcessed('Summarise the topic'), { approvalMode: 'auto' }),
    );

    expect(taskStates(output)).toEqual([
      'queued',
      'running',
      'planning',
      'running',
      'ready_for_review',
    ]);
  });

  it('pauses at the step boundary, storing the transcript and a boundary the service accepts', async () => {
    const onPauseCheckpoint = vi.fn().mockResolvedValue(undefined);
    const isPauseRequested = vi.fn().mockResolvedValue(true);

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', isPauseRequested, onPauseCheckpoint }),
    );

    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(taskStates(output)).toEqual(['queued', 'running', 'paused']);
    expect(agentEvents(output).at(-1)).toEqual({ type: 'lifecycle', phase: 'paused' });
    expect(output).toContain('data: [DONE]');
    expect(onPauseCheckpoint).toHaveBeenCalledTimes(1);
    const checkpoint = onPauseCheckpoint.mock.calls[0]![0] as {
      nextEventSequence: number;
      completedSteps: number;
      events: Array<{ sequence: number; event: Record<string, unknown> }>;
      messages: unknown[];
    };
    expect(checkpoint.completedSteps).toBe(0);
    expect(checkpoint.messages).toEqual([{ role: 'user', content: 'do the work' }]);
    expect(checkpoint.events.map((envelope) => envelope.event)).toEqual([
      expect.objectContaining({
        type: 'task-state-changed',
        state: 'paused',
        previousState: 'running',
      }),
      { type: 'lifecycle', phase: 'paused' },
    ]);
    expect(checkpoint.events.at(-1)!.sequence + 1).toBe(checkpoint.nextEventSequence);
  });

  it('keeps working when a pause is requested but the caller has nowhere to store it', async () => {
    const isPauseRequested = vi.fn().mockResolvedValue(true);
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]),
    );

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', isPauseRequested }),
    );

    expect(isPauseRequested).not.toHaveBeenCalled();
    expect(taskStates(output).at(-1)).toBe('ready_for_review');
  });

  it('resumes a paused run as running and hands the model the user guidance', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Pricing next.' }), chunk({}, 'stop')]),
    );

    const output = await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        invocationContinuation: true,
        initialEventSequence: 9,
        initialCompletedSteps: 2,
        resumedFromPause: { guidance: 'Focus on pricing.' },
      }),
    );

    const events = agentEvents(output);
    expect(events.slice(0, 3)).toEqual([
      expect.objectContaining({ type: 'task-state-changed', state: 'running' }),
      { type: 'lifecycle', phase: 'resumed' },
      expect.objectContaining({ type: 'progress-update', detail: 'Focus on pricing.' }),
    ]);
    const request = mockBuildToolLoopStream.mock.calls[0]![2] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.messages.at(-1)).toEqual({
      role: 'user',
      content: 'do the work\n\nFocus on pricing.',
    });
  });

  it('ends a run that spent its step budget as partial rather than failed', async () => {
    const output = await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto', maxSteps: 0 }));

    expect(output).toContain('max_agent_steps_reached');
    expect(taskStates(output).at(-1)).toBe('partial');
  });
});
