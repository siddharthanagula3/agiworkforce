import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

const persistence = vi.hoisted(() => ({ persist: vi.fn() }));
vi.mock('@/lib/server/generated-file-persist', () => ({
  persistGeneratedFileBytes: persistence.persist,
  MAX_GENERATED_FILE_BYTES: 20 * 1024 * 1024,
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

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

function officeToolCallStream(): ReadableStream<Uint8Array> {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_office_1',
                type: 'function',
                function: {
                  name: 'create_office_file',
                  arguments: JSON.stringify({
                    format: 'docx',
                    filename: 'release-plan',
                    title: 'Release plan',
                    content: '# Order\n\n- Website\n- Mobile\n- Desktop',
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
      choices: [{ delta: { content: 'The Word document is attached.' }, index: 0 }],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'test-model' },
  ]);
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-office',
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

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

function activity(output: string) {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      const event = parseAgentEventDelta(payload.choices?.[0]?.delta?.x_agent_event);
      return event ? [event.event] : [];
    });
}

describe('managed Office file tool loop', () => {
  beforeEach(() => {
    provider.stream.mockReset();
    persistence.persist.mockReset();
  });

  it('creates, persists, and emits a real Office file from a genuine tool call', async () => {
    provider.stream
      .mockResolvedValueOnce(officeToolCallStream())
      .mockResolvedValueOnce(finalStream());
    persistence.persist.mockResolvedValue({
      ok: true,
      file: {
        id: 'asset-office',
        file_name: 'release-plan.docx',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uri: '/api/files/asset-office',
        byte_count: 4096,
        kind: 'docx',
        checksum_sha256: 'a'.repeat(64),
        surface: 'file',
        previewable: true,
      },
    });

    const output = await collect(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1' }),
    );

    expect(provider.stream).toHaveBeenCalledTimes(2);
    const firstRequest = provider.stream.mock.calls[0]?.[2] as ProcessedRequest['llmRequest'];
    expect(firstRequest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: 'create_office_file' }),
        }),
      ]),
    );
    expect(JSON.stringify(firstRequest.messages)).not.toContain('word/document.xml');

    expect(persistence.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: '11111111-1111-4111-8111-111111111111',
        filename: 'release-plan.docx',
        provider: 'agi-managed-office',
        origin: 'managed-office-tool',
      }),
    );
    const persisted = persistence.persist.mock.calls[0]?.[0] as { data: Buffer };
    const archive = await JSZip.loadAsync(persisted.data);
    expect(await archive.file('word/document.xml')?.async('string')).toContain('Website');

    const secondRequest = provider.stream.mock.calls[1]?.[2] as ProcessedRequest['llmRequest'];
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call_office_1',
          content: expect.stringContaining('/api/files/asset-office'),
        }),
      ]),
    );
    expect(output).toContain('Creating Office file');
    expect(output).toContain('x_generated_files');
    expect(output).toContain('/api/files/asset-office');
    expect(activity(output)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool-execution-start',
          name: 'create_office_file',
          category: 'artifact',
        }),
        expect.objectContaining({ type: 'tool-execution-end', name: 'create_office_file' }),
        expect.objectContaining({ type: 'artifact-produced', artifactId: 'asset-office' }),
      ]),
    );
  });

  it('fails closed without an authenticated file owner', async () => {
    provider.stream
      .mockResolvedValueOnce(officeToolCallStream())
      .mockResolvedValueOnce(finalStream());

    const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(persistence.persist).not.toHaveBeenCalled();
    expect(output).toContain('An authenticated file owner is required.');
    expect(output).not.toContain('x_generated_files');
  });
});
