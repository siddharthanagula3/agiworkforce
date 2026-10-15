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

import { EXECUTE_CODE_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';

import type { ProcessedRequest } from './request-processor';
import { runToolLoop } from './tool-loop';
import type { TurnToolProhibition } from './turn-tool-prohibition';

const MODEL = 'model-under-test';
const USER_TURN = 'Draft the email. Do not browse, run code, or use external tools.';
const CONNECTOR_TOOL: WebMcpToolDef = {
  qualifiedName: 'mcp__mail__send_email',
  serverId: 'mail',
  toolName: 'send_email',
  description: 'Send an email',
  origin: 'connector',
  inputSchema: { type: 'object', properties: {} },
};

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

function codeCallStep(): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        {
          index: 0,
          id: 'call_noop',
          function: {
            name: EXECUTE_CODE_TOOL,
            arguments: JSON.stringify({ language: 'python', code: 'print("skipped")' }),
          },
        },
      ],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(prohibition: TurnToolProhibition): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-prohibition',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: USER_TURN }],
      stream: true,
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
    turnToolProhibition: prohibition,
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
      tools: e2bExecutionToolDefs(),
    },
  } as unknown as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function stepToolNames(stepIndex: number): string[] {
  const request = mockBuildToolLoopStream.mock.calls[stepIndex]?.[2] as
    { tools?: Array<{ function?: { name?: string } }> } | undefined;
  return (request?.tools ?? []).map((tool) => tool.function?.name ?? '');
}

describe('runToolLoop, a tool the user ruled out for the turn', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockGetE2BExecutor.mockResolvedValue(null);
  });

  it('refuses a ruled-out code call at dispatch and still lets the model answer', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(codeCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Hi Alex, see you Thursday.'));

    const output = await drain(
      runToolLoop(makeProcessed({ allTools: false, codeExecution: true, webSearch: false }), {
        approvalMode: 'auto',
        userId: 'user-1',
      }),
    );

    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(output).toContain('was not run: the user asked not to use it on this turn');
    expect(output).not.toContain('"status":"running"');
    expect(output).toContain('Hi Alex, see you Thursday.');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
  });

  it('offers no connector tool when the user ruled out every tool', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Plain answer.'));

    await drain(
      runToolLoop(makeProcessed({ allTools: true, codeExecution: true, webSearch: true }), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [CONNECTOR_TOOL],
      }),
    );

    expect(stepToolNames(0)).not.toContain(CONNECTOR_TOOL.qualifiedName);
  });

  it('runs the same call when nothing was ruled out', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(codeCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Done.'));

    const output = await drain(
      runToolLoop(makeProcessed({ allTools: false, codeExecution: false, webSearch: true }), {
        approvalMode: 'auto',
        userId: 'user-1',
      }),
    );

    expect(output).not.toContain('the user asked not to use it');
    expect(output).toContain('"status":"running"');
  });
});
