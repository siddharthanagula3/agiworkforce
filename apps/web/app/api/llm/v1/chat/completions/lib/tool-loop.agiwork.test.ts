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

function makeAgiWorkProcessed(goal?: {
  goal: string;
  constraints?: string;
  deliverable?: string;
}): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-agiwork',
    chatRequest: {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'do the work' }],
      stream: true,
      work_mode: 'agiwork',
      ...(goal ? { agi_work_goal: goal } : {}),
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

function deltas(output: string): Array<Record<string, unknown>> {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice('data: '.length)))
    .flatMap((payload: { choices?: Array<{ delta?: Record<string, unknown> }> }) =>
      payload.choices?.[0]?.delta ? [payload.choices[0].delta] : [],
    );
}

beforeEach(() => {
  mockBuildToolLoopStream.mockReset();
});

describe('runToolLoop AGI Work planning turn', () => {
  it('runs a tool-free plan turn, emitting the goal, plan steps, and x_agiwork_plan', async () => {
    const planTurn = sseStreamFrom([
      chunk({ content: '["Research the topic", "Draft the summary", "Review it"]' }),
      chunk({}, 'stop'),
    ]);
    const workTurn = sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(planTurn).mockResolvedValueOnce(workTurn);

    const output = await drain(
      runToolLoop(makeAgiWorkProcessed({ goal: 'Summarise the topic' }), {
        approvalMode: 'auto',
      }),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    const planRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as { tools?: unknown };
    expect(planRequest.tools).toBeUndefined();

    const allDeltas = deltas(output);

    const planFrame = allDeltas.find((d) => 'x_agiwork_plan' in d);
    expect(planFrame).toBeDefined();
    const steps = (planFrame as { x_agiwork_plan: { steps: unknown[] } }).x_agiwork_plan.steps;
    expect(steps).toHaveLength(3);

    const progressSummaries = allDeltas
      .flatMap((d) => ('x_agent_event' in d ? [d['x_agent_event']] : []))
      .map((e) => (e as { event?: { type?: string; progressId?: string; summary?: string } }).event)
      .filter(
        (e): e is { type: string; progressId: string; summary: string } =>
          e?.type === 'progress-update',
      );
    expect(progressSummaries.some((p) => p.progressId === 'agiwork:goal')).toBe(true);
    expect(progressSummaries.some((p) => p.progressId.startsWith('agiwork:plan:'))).toBe(true);
  });

  it('is non-fatal when the plan turn yields no parseable steps, the run still completes', async () => {
    const planTurn = sseStreamFrom([chunk({ content: 'let me get started' }), chunk({}, 'stop')]);
    const workTurn = sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(planTurn).mockResolvedValueOnce(workTurn);

    const output = await drain(
      runToolLoop(makeAgiWorkProcessed({ goal: 'Summarise the topic' }), { approvalMode: 'auto' }),
    );

    expect(deltas(output).some((d) => 'x_agiwork_plan' in d)).toBe(false);
    expect(output).toContain('Done.');
    expect(output.includes('[DONE]')).toBe(true);
  });

  it('does not run a plan turn when the run carries no goal', async () => {
    const workTurn = sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(workTurn);

    const output = await drain(runToolLoop(makeAgiWorkProcessed(), { approvalMode: 'auto' }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(deltas(output).some((d) => 'x_agiwork_plan' in d)).toBe(false);
  });
});

describe('runToolLoop AGI Work failover', () => {
  function overloaded(): Error {
    return Object.assign(new Error('{"type":"overloaded_error"}'), { status: 529 });
  }

  it('offers the planning turn to the failover ladder as the first dispatch', async () => {
    const contexts: Array<{ step: number } | undefined> = [];
    const rotated = makeAgiWorkProcessed({ goal: 'Summarise the topic' });
    rotated.provider = 'anthropic';
    mockBuildToolLoopStream
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: '["A","B","C"]' }), chunk({}, 'stop')]),
      )
      .mockResolvedValueOnce(sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]));

    const output = await drain(
      runToolLoop(makeAgiWorkProcessed({ goal: 'Summarise the topic' }), {
        approvalMode: 'auto',
        failover: {
          next: (_error, context) => {
            contexts.push(context);
            return contexts.length === 1 ? { provider: 'anthropic', processed: rotated } : null;
          },
        },
      }),
    );

    expect(contexts).toEqual([{ step: 0 }]);
    expect(mockBuildToolLoopStream.mock.calls[1]?.[0]).toBe('anthropic');
    expect(deltas(output).some((d) => 'x_agiwork_plan' in d)).toBe(true);
    expect(output).toContain('Done.');
  });

  it('fails the work step over when the primary is overloaded', async () => {
    const rotated = makeAgiWorkProcessed();
    rotated.provider = 'anthropic';
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: '["A","B","C"]' }), chunk({}, 'stop')]),
      )
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValueOnce(sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]));

    let rotations = 0;
    const output = await drain(
      runToolLoop(makeAgiWorkProcessed({ goal: 'Summarise the topic' }), {
        approvalMode: 'auto',
        failover: {
          next: () => {
            rotations += 1;
            return rotations === 1 ? { provider: 'anthropic', processed: rotated } : null;
          },
        },
      }),
    );

    expect(rotations).toBe(1);
    expect(output).toContain('Done.');
    expect(output).not.toContain('provider_overloaded');
  });
});
