import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

import {
  CLARIFY_TOOL_NAME,
  createClarifyToolDefinition,
} from '@/lib/services/clarify-tool-service';

import type { ProcessedRequest } from './request-processor';
import { runToolLoop } from './tool-loop';
import { withheldToolResultMessage } from './turn-tool-offer';

const MODEL = 'model-under-test';
const USER_TURN = 'Summarize the attached quarterly report.';

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
    model: MODEL,
  })}\n\n`;
}

function answerStep(text: string): ReadableStream {
  return sseStreamFrom([chunk({ content: text }), chunk({}, 'stop')]);
}

function clarifyCallStep(): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        {
          index: 0,
          id: 'call_clarify',
          function: {
            name: CLARIFY_TOOL_NAME,
            arguments: JSON.stringify({
              questions: [
                {
                  header: 'Scope',
                  question: 'Which part of the report?',
                  options: [{ label: 'Revenue' }, { label: 'Costs' }],
                },
              ],
            }),
          },
        },
      ],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(turnWithheldTools: readonly string[]): ProcessedRequest {
  return {
    chatSurface: 'chrome' as const,
    requestId: 'req-withheld',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: USER_TURN }],
      stream: true,
      x_interactive_cards: { supported: ['clarify.v1'], canRespond: true },
    } as never,
    conversationId: undefined,
    requestedModel: MODEL,
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: MODEL,
    resolvedTaskType: 'simple_chat' as never,
    executionRequirement: { required: false, source: null },
    executionEnforcement: { mode: 'none', attachedTool: null },
    ...(turnWithheldTools.length > 0 ? { turnWithheldTools } : {}),
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: USER_TURN }],
      max_tokens: 1000,
      stream: true,
      tools: [createClarifyToolDefinition()],
    },
  } as unknown as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function stepRequest(stepIndex: number) {
  return mockBuildToolLoopStream.mock.calls[stepIndex]?.[2] as
    { tools?: unknown[]; messages: Array<{ role: string; content: string }> } | undefined;
}

describe('runToolLoop, a tool offered for the conversation but withheld on this turn', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockGetE2BExecutor.mockResolvedValue(null);
  });

  it('refuses the call with a tool error naming why, and the model answers instead', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(clarifyCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Revenue rose 12 percent.'));

    const output = await drain(
      runToolLoop(makeProcessed([CLARIFY_TOOL_NAME]), { approvalMode: 'auto', userId: 'user-1' }),
    );

    expect(output).not.toContain('"kind":"clarify.v1"');
    expect(output).toContain('Revenue rose 12 percent.');
    const toolResult = stepRequest(1)?.messages.find((message) => message.role === 'tool');
    expect(toolResult?.content).toContain(withheldToolResultMessage(CLARIFY_TOOL_NAME));
  });

  it('keeps the withheld tool in every step of the turn so the cached prefix holds', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(clarifyCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Done.'));

    await drain(
      runToolLoop(makeProcessed([CLARIFY_TOOL_NAME]), { approvalMode: 'auto', userId: 'user-1' }),
    );

    expect(JSON.stringify(stepRequest(1)?.tools)).toBe(JSON.stringify(stepRequest(0)?.tools));
  });

  it('runs the same call on a turn that does not withhold it', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(clarifyCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Waiting for your answer.'));

    const output = await drain(
      runToolLoop(makeProcessed([]), { approvalMode: 'auto', userId: 'user-1' }),
    );

    expect(output).not.toContain(withheldToolResultMessage(CLARIFY_TOOL_NAME));
  });
});
