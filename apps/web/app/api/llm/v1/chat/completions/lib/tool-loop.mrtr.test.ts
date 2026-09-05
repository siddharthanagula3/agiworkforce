import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

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

const mockExecuteWebMcpTool = vi.fn();
vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/mcp-tool-executor')>('@/lib/mcp-tool-executor');
  return {
    ...actual,
    executeWebMcpTool: (...args: unknown[]) => mockExecuteWebMcpTool(...args),
    getWebMcpCatalog: vi.fn(),
  };
});

import { runToolLoop, type ConnectorToolExecutor } from './tool-loop';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
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

const CONNECTOR_TOOL = 'mcp__custom-abc123__create_task';

const connectorToolDef: WebMcpToolDef = {
  qualifiedName: CONNECTOR_TOOL,
  serverId: 'custom-abc123',
  toolName: 'create_task',
  description: 'create a task',
  origin: 'connector',
  inputSchema: { type: 'object' },
};

function toolCallStep(): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [{ index: 0, id: 'call_1', function: { name: CONNECTOR_TOOL, arguments: '' } }],
    }),
    chunk({
      tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ title: 'ship it' }) } }],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-1',
    chatRequest: { model: 'gpt-test', messages: [], stream: true } as never,
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
      messages: [{ role: 'user', content: 'create a task' }],
      max_tokens: 1000,
      stream: true,
    },
  } as unknown as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function agentEvents(output: string): AgentEventEnvelope[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      const event = parseAgentEventDelta(payload.choices?.[0]?.delta?.x_agent_event);
      return event ? [event] : [];
    });
}

const INPUT_REQUIRED = {
  inputRequests: { priority: { type: 'string' } },
  requestState: 'token-1',
};

function makeResumeProcessed(): ProcessedRequest {
  const base = makeProcessed();
  return {
    ...base,
    llmRequest: {
      ...base.llmRequest,
      messages: [
        { role: 'user', content: 'create a task' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: CONNECTOR_TOOL, arguments: JSON.stringify({ title: 'ship it' }) },
            },
          ],
        },
      ],
    },
  } as unknown as ProcessedRequest;
}

// The `input_required` pause ships behind a kill-switch that is off by default
// (no client calls /resume-input yet). These tests cover the gated feature, so
// they enable it for this file only; every other suite keeps the default-off path.
beforeEach(() => {
  vi.stubEnv('AGI_MCP_INPUT_PAUSE', '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runToolLoop, MRTR input_required suspend', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('suspends on a connector input_required without appending a completed tool result', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(toolCallStep());

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'the connector needs more input',
      isError: true,
      inputRequired: INPUT_REQUIRED,
    }));
    const onInputCheckpoint = vi.fn(async (_checkpoint: unknown) => undefined);

    const output = await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
        onInputCheckpoint,
      }),
    );

    // The tool ran exactly once; the loop did NOT take another provider step.
    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    // Attended runs opt the connector call into input_required.
    expect(connectorExecutor).toHaveBeenCalledWith(
      'custom-abc123',
      'create_task',
      { title: 'ship it' },
      expect.objectContaining({ allowInputRequired: true }),
    );

    // The client-facing pause frame and the durable pause events are present.
    expect(output).toContain('x_tool_input_request');
    expect(output).toContain('"tool_call_id":"call_1"');
    expect(output).toContain('data: [DONE]');

    const events = agentEvents(output).map((entry) => entry.event);
    const inputRequested = events.find((event) => event.type === 'input-requested');
    expect(inputRequested).toMatchObject({
      toolCallId: 'call_1',
      connectorId: 'custom-abc123',
      toolName: 'create_task',
      inputRequests: { priority: { type: 'string' } },
      requestState: 'token-1',
      round: 0,
    });
    expect(
      events.some(
        (event) => event.type === 'task-state-changed' && event.state === 'awaiting_input',
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === 'lifecycle' && event.phase === 'paused')).toBe(
      true,
    );

    // The checkpoint carries the paused call and its bounded, untrusted requests,
    // and its messages must NOT contain a completed role:'tool' result for it.
    expect(onInputCheckpoint).toHaveBeenCalledTimes(1);
    const checkpoint = onInputCheckpoint.mock.calls[0]![0] as {
      completedSteps: number;
      pendingToolCalls: Array<{ id: string; qualifiedName: string; args: Record<string, unknown> }>;
      inputRequests: Record<string, unknown>;
      requestState: Record<string, { requestState?: string; round: number }>;
      messages: Array<{ role: string; tool_call_id?: string }>;
    };
    expect(checkpoint.completedSteps).toBe(1);
    expect(checkpoint.pendingToolCalls).toEqual([
      { id: 'call_1', qualifiedName: CONNECTOR_TOOL, args: { title: 'ship it' } },
    ]);
    expect(checkpoint.inputRequests).toEqual({ call_1: { priority: { type: 'string' } } });
    expect(checkpoint.requestState).toEqual({ call_1: { requestState: 'token-1', round: 0 } });
    expect(checkpoint.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'call_1')).toBe(
      false,
    );
  });

  it('fails safe on an unattended run: settles the call as an error and never pauses', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(toolCallStep())
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Done without it.' }), chunk({}, 'stop')]),
      );

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'the connector needs more input',
      isError: true,
      inputRequired: INPUT_REQUIRED,
    }));
    const onInputCheckpoint = vi.fn(async (_checkpoint: unknown) => undefined);

    const output = await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        unattended: true,
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
        onInputCheckpoint,
      }),
    );

    // Unattended runs never advertise input_required to the connector.
    expect(connectorExecutor).toHaveBeenCalledWith(
      'custom-abc123',
      'create_task',
      { title: 'ship it' },
      expect.not.objectContaining({ allowInputRequired: true }),
    );
    // No pause: it settled the call as an error and continued to a final step.
    expect(onInputCheckpoint).not.toHaveBeenCalled();
    expect(output).not.toContain('x_tool_input_request');
    expect(agentEvents(output).some((entry) => entry.event.type === 'input-requested')).toBe(false);
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);

    // The fail-safe error result was appended so the model can move on.
    const contRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const toolResult = contRequest.messages.find(
      (m) => m.role === 'tool' && m.tool_call_id === 'call_1',
    );
    expect(toolResult?.content).toMatch(/no interactive session|not completed/i);
    expect(output).toContain('Done without it.');
  });
});

describe('runToolLoop, MRTR input resume', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('re-issues the paused call with the collected responses and continues the same transcript', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'All set.' }), chunk({}, 'stop')]),
    );

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'task created',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
        resume: {
          inputResponses: [
            {
              toolCallId: 'call_1',
              inputResponses: { priority: 'high' },
              requestState: 'token-1',
              round: 1,
            },
          ],
        },
        eventSessionId: 'conversation-1',
        eventTurnId: 'original-turn-1',
        initialEventSequence: 7,
        initialCompletedSteps: 1,
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(connectorExecutor).toHaveBeenCalledWith(
      'custom-abc123',
      'create_task',
      { title: 'ship it' },
      expect.objectContaining({
        allowInputRequired: true,
        inputResponses: { priority: 'high' },
        requestState: 'token-1',
      }),
    );
    expect(agentEvents(output).some((entry) => entry.event.type === 'input-resolved')).toBe(true);
    const contRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    expect(
      contRequest.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call_1')?.content,
    ).toContain('task created');
    expect(output).toContain('All set.');
  });

  it('supports a repeated round: a re-issued call can pause again at the next round', async () => {
    const onInputCheckpoint = vi.fn(async (_checkpoint: unknown) => undefined);
    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'still needs input',
      isError: true,
      inputRequired: { inputRequests: { due: { type: 'string' } }, requestState: 'token-2' },
    }));

    await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
        onInputCheckpoint,
        resume: {
          inputResponses: [
            {
              toolCallId: 'call_1',
              inputResponses: { priority: 'high' },
              requestState: 'token-1',
              round: 1,
            },
          ],
        },
        eventSessionId: 'conversation-1',
        eventTurnId: 'original-turn-1',
        initialEventSequence: 7,
        initialCompletedSteps: 1,
      }),
    );

    expect(onInputCheckpoint).toHaveBeenCalledTimes(1);
    const checkpoint = onInputCheckpoint.mock.calls[0]![0] as {
      completedSteps: number;
      requestState: Record<string, { requestState?: string; round: number }>;
    };
    // The re-pause records the attempt round (1), so the next resume advances to 2.
    expect(checkpoint.requestState).toEqual({ call_1: { requestState: 'token-2', round: 1 } });
    expect(checkpoint.completedSteps).toBe(1);
  });
});
