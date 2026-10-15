import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDefaultModelFor,
  getModelMetadataById,
  getModelRegistryFacts,
  listCanonicalModels,
} from '@agiworkforce/types';

type ScanModule0 = typeof import('./tool-loop-anthropic');

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
}));

import { CHAT_SYSTEM_PROMPT_ID } from '@/lib/prompts/chat-system-prompt';

import {
  buildCapabilityPreamble,
  servingModelFor,
  type ModelSelection,
} from './capability-preamble';
import { buildFailoverAttemptView } from './managed-failover';
import type { ProcessedRequest } from './request-processor';
import { runToolLoop, type ConnectorToolExecutor } from './tool-loop';

const IDENTITY_VERSION = 8;
const FAILED_MODEL = getDefaultModelFor('pro', 'chat');
const RESCUER_MODEL = listCanonicalModels().find(
  (model) => model.id !== FAILED_MODEL && getModelRegistryFacts(model.id)?.isRouter !== true,
)?.id;
if (!RESCUER_MODEL) throw new Error('the catalog holds no second concrete model');

const FAILED_NAME = getModelMetadataById(FAILED_MODEL)?.name ?? '';
const RESCUER_NAME = getModelMetadataById(RESCUER_MODEL)?.name ?? '';
const SELECTION: ModelSelection = { kind: 'picked', modelId: FAILED_MODEL };
const DIFF_TOOL = 'mcp__github__get_pull_request_diff';

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
}

function systemPrompt(): string {
  return String(
    buildCapabilityPreamble({
      now: new Date('2026-10-02T12:00:00.000Z'),
      tools: [],
      surface: 'web',
      promptSelection: { variants: { [CHAT_SYSTEM_PROMPT_ID]: IDENTITY_VERSION } },
      servingModel: servingModelFor(FAILED_MODEL, SELECTION),
    }),
  );
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web',
    requestId: 'req-failover-serving-model',
    chatRequest: { model: FAILED_MODEL, messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: FAILED_MODEL,
    provider: 'anthropic',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: FAILED_MODEL,
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    modelSelection: SELECTION,
    llmRequest: {
      model: FAILED_MODEL,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: 'Which model are you? Then summarize PR 7 in acme/app.' },
      ],
      max_tokens: 1000,
      stream: true,
    },
  } as ProcessedRequest;
}

function sentSystem(call: number): string {
  const request = mockBuildToolLoopStream.mock.calls[call]?.[2] as
    { messages: Array<{ role: string; content: unknown }> } | undefined;
  return (request?.messages ?? [])
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content))
    .join('\n\n');
}

function sentModel(call: number): string | undefined {
  return (mockBuildToolLoopStream.mock.calls[call]?.[2] as { model?: string } | undefined)?.model;
}

async function drain(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of generator) out += decoder.decode(value);
  return out;
}

describe('runToolLoop after a managed failover to another model', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
  });

  it('tells every later provider step the model that now answers, not the one that failed', async () => {
    mockBuildToolLoopStream
      .mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 }))
      .mockResolvedValueOnce(
        sse([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                function: {
                  name: DIFF_TOOL,
                  arguments: JSON.stringify({ owner: 'acme', repo: 'app', pull_number: 7 }),
                },
              },
            ],
          }),
          chunk({}, 'tool_calls'),
        ]),
      )
      .mockResolvedValueOnce(
        sse([chunk({ content: 'It renames a function.' }), chunk({}, 'stop')]),
      );

    const processed = makeProcessed();
    const next = vi.fn(() => ({
      model: RESCUER_MODEL,
      provider: 'openai',
      processed: buildFailoverAttemptView(processed, RESCUER_MODEL, 'openai'),
    }));
    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'diff --git a/x b/x\n-old\n+new',
      isError: false,
    }));

    await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        userId: 'user-1',
        connectorExecutor,
        mcpTools: [
          {
            qualifiedName: DIFF_TOOL,
            serverId: 'github',
            toolName: 'get_pull_request_diff',
            description: 'Read a pull request diff',
            origin: 'connector',
            inputSchema: {},
          },
        ],
        failover: { next },
      }),
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(3);
    expect(sentSystem(0)).toContain(`This turn runs on ${FAILED_NAME}`);
    for (const call of [1, 2]) {
      expect(sentModel(call)).toBe(RESCUER_MODEL);
      expect(sentSystem(call)).toContain(`This turn runs on ${RESCUER_NAME}`);
      expect(sentSystem(call)).toContain(`say ${RESCUER_NAME} by`);
      expect(sentSystem(call)).not.toContain(`This turn runs on ${FAILED_NAME}`);
      expect(sentSystem(call)).not.toContain(`say ${FAILED_NAME} by`);
    }
    expect(String(processed.llmRequest.messages[0]?.content)).toContain(
      `This turn runs on ${FAILED_NAME}`,
    );
  });

  it('leaves the serving model text alone when the failover keeps the same model', async () => {
    mockBuildToolLoopStream
      .mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 }))
      .mockResolvedValueOnce(sse([chunk({ content: 'Answered.' }), chunk({}, 'stop')]));

    const processed = makeProcessed();
    const next = vi.fn(() => ({
      model: FAILED_MODEL,
      provider: 'openrouter',
      processed: buildFailoverAttemptView(processed, FAILED_MODEL, 'openrouter'),
    }));

    await drain(runToolLoop(processed, { approvalMode: 'auto', failover: { next } }));

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(sentSystem(1)).toBe(sentSystem(0));
    expect(sentSystem(1)).toContain(`This turn runs on ${FAILED_NAME}`);
  });
});
