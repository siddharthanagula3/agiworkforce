import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';

type ToolLoopAnthropicModule = typeof import('./tool-loop-anthropic');
type RuntimeModule = typeof import('@/lib/e2b/runtime');
type GeneratedFilePersistModule = typeof import('@/lib/server/generated-file-persist');

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<ToolLoopAnthropicModule>()),
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<RuntimeModule>()),
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

const persistence = vi.hoisted(() => ({ persist: vi.fn() }));
vi.mock('@/lib/server/generated-file-persist', async (importOriginal) => ({
  ...(await importOriginal<GeneratedFilePersistModule>()),
  persistGeneratedFileBytes: persistence.persist,
  MAX_GENERATED_FILE_BYTES: 20 * 1024 * 1024,
}));

import { runToolLoop, type ConnectorToolExecutor } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';

const ATTACH_FAILURE = 'The Office file could not be attached.';
const REPEATED_FAILURE = 'Repeated failure: create_office_file was already tried';
const CLOSED = 'create_office_file is closed for this turn and was not run.';

function stream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')),
      );
      controller.close();
    },
  });
}

function officeCall(id: string, title: string): ReadableStream<Uint8Array> {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: 'function',
                function: {
                  name: 'create_office_file',
                  arguments: JSON.stringify({
                    format: 'docx',
                    filename: 'release-plan',
                    title,
                    content: '# Order\n\n- Website\n- Mobile',
                  }),
                },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'test-model' },
  ]);
}

function finalStream(): ReadableStream<Uint8Array> {
  return stream([
    {
      choices: [{ delta: { content: 'The document could not be attached.' }, index: 0 }],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'test-model' },
  ]);
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-repeated-failure',
    chatRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Create a Word release plan.' }],
      stream: true,
      office_creation: true,
    },
    conversationId: undefined,
    requestedModel: 'test-model',
    provider: 'openai',
    organizationId: '11111111-1111-4111-8111-111111111111',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'test-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Create a Word release plan.' }],
      max_tokens: 512,
      stream: true,
      tools: [createManagedOfficeFileToolDefinition()],
    },
  } as ProcessedRequest;
}

async function drain(generator: AsyncGenerator<Uint8Array>): Promise<void> {
  for await (const chunk of generator) void chunk;
}

function toolResult(callId: string): string {
  const lastRequest = provider.stream.mock.calls.at(-1)?.[2] as ProcessedRequest['llmRequest'];
  const message = lastRequest.messages.find(
    (entry) =>
      (entry as { role?: string; tool_call_id?: string }).role === 'tool' &&
      (entry as { tool_call_id?: string }).tool_call_id === callId,
  ) as { content?: unknown } | undefined;
  return typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content);
}

describe('a failing tool call repeated with identical arguments', () => {
  beforeEach(() => {
    provider.stream.mockReset();
    persistence.persist.mockReset();
    persistence.persist.mockResolvedValue({ ok: false, error: 'storage unavailable' });
  });

  it('closes the tool on the second identical failure, so a third call does not run', async () => {
    provider.stream
      .mockResolvedValueOnce(officeCall('call_1', 'Release plan'))
      .mockResolvedValueOnce(officeCall('call_2', 'Release plan'))
      .mockResolvedValueOnce(officeCall('call_3', 'Release plan'))
      .mockResolvedValueOnce(finalStream());

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1' }));

    expect(persistence.persist).toHaveBeenCalledTimes(2);
    expect(provider.stream).toHaveBeenCalledTimes(4);
    expect(toolResult('call_1')).toBe(ATTACH_FAILURE);
    expect(toolResult('call_1')).not.toContain(REPEATED_FAILURE);
    expect(toolResult('call_2')).toContain(ATTACH_FAILURE);
    expect(toolResult('call_2')).toContain(REPEATED_FAILURE);
    expect(toolResult('call_3')).toContain(CLOSED);
  });

  it('still runs the tool when the model changes the arguments', async () => {
    provider.stream
      .mockResolvedValueOnce(officeCall('call_1', 'Release plan'))
      .mockResolvedValueOnce(officeCall('call_2', 'Release plan, revised'))
      .mockResolvedValueOnce(finalStream());

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1' }));

    expect(persistence.persist).toHaveBeenCalledTimes(2);
    expect(toolResult('call_1')).toBe(ATTACH_FAILURE);
    expect(toolResult('call_2')).toBe(ATTACH_FAILURE);
  });
});

const RENAME_TOOL = 'mcp__files__rename_file';

const RENAME_TOOL_DEF: WebMcpToolDef = {
  qualifiedName: RENAME_TOOL,
  serverId: 'files',
  toolName: 'rename_file',
  description: 'rename_file',
  origin: 'connector',
  inputSchema: { type: 'object' },
};

const OFFICE_ARGUMENTS = {
  format: 'docx',
  filename: 'release-plan',
  title: 'Release plan',
  content: '# Order\n\n- Website\n- Mobile',
};

function toolCalls(
  ...calls: Array<{ id: string; name: string; args: Record<string, unknown> }>
): ReadableStream<Uint8Array> {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: calls.map(({ id, name, args }, index) => ({
              index,
              id,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            })),
          },
          index: 0,
        },
      ],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'test-model' },
  ]);
}

describe('a call to a tool already closed for the turn', () => {
  beforeEach(() => {
    provider.stream.mockReset();
    persistence.persist.mockReset();
    persistence.persist.mockResolvedValue({ ok: false, error: 'storage unavailable' });
  });

  it('does not clear the failures of another tool, which still closes on its repeat', async () => {
    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'The file was not found.',
      isError: true,
    }));
    const rename = { name: RENAME_TOOL, args: { path: 'notes.txt' } };
    const office = { name: 'create_office_file', args: OFFICE_ARGUMENTS };
    provider.stream
      .mockResolvedValueOnce(toolCalls({ id: 'call_1', ...rename }))
      .mockResolvedValueOnce(toolCalls({ id: 'call_2', ...rename }))
      .mockResolvedValueOnce(toolCalls({ id: 'call_3', ...office }))
      .mockResolvedValueOnce(toolCalls({ id: 'call_4', ...rename }, { id: 'call_5', ...office }))
      .mockResolvedValueOnce(finalStream());

    await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [RENAME_TOOL_DEF],
        connectorExecutor,
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(2);
    expect(persistence.persist).toHaveBeenCalledTimes(2);
    expect(toolResult('call_2')).toContain('Repeated failure: mcp__files__rename_file');
    expect(toolResult('call_3')).toBe(ATTACH_FAILURE);
    expect(toolResult('call_4')).toContain('is closed for this turn and was not run');
    expect(toolResult('call_5')).toContain(REPEATED_FAILURE);
  });
});
