/**
 * WebRuntime unit tests — mock-only, no live backend.
 *
 * Pins the `x_generated_files` stream-delta handling: wire descriptors are
 * validated against the shared cloud contract, relative `/api/files/{id}`
 * uris are resolved against the cloud API base, and a `generated_files`
 * StreamEvent is emitted for the unified-chat useChat hook to thread onto
 * the assistant message (same path as search_results).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamEvent } from '@agiworkforce/unified-chat';

const sendCloudMessage = vi.fn();
const getCloudConversation = vi.fn();
const updateConversation = vi.fn().mockResolvedValue(undefined);
const saveMessage = vi.fn().mockResolvedValue({ id: 'message-1' });

vi.mock('../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.example',
  cloudFetch: vi.fn(),
  sendCloudMessage: (...args: unknown[]) => sendCloudMessage(...args),
  listCloudConversations: vi.fn(),
  createCloudConversation: vi.fn(),
  getCloudConversation: (...args: unknown[]) => getCloudConversation(...args),
  deleteCloudConversation: vi.fn(),
  updateCloudConversationTitle: vi.fn(),
  createCloudChatPersistenceClient: () => ({
    updateConversation,
    saveMessage,
  }),
}));

vi.mock('../../services/cloudChat', () => ({
  ensureCloudConversation: vi.fn().mockResolvedValue({ id: 'conv_1' }),
}));

import { WebRuntime, mapGeneratedFilesPayload } from '../WebRuntime';

const wireFile = {
  id: 'gf-1',
  file_name: 'report.pdf',
  mime_type: 'application/pdf',
  uri: '/api/files/gf-1',
  byte_count: 2048,
  kind: 'pdf',
  checksum_sha256: 'a'.repeat(64),
};

function collectEvents(runtime: WebRuntime): StreamEvent[] {
  const events: StreamEvent[] = [];
  runtime.onStream((event) => events.push(event));
  return events;
}

describe('mapGeneratedFilesPayload', () => {
  it('maps wire descriptors to UI entries with the uri resolved against the cloud base', () => {
    expect(mapGeneratedFilesPayload({ files: [wireFile] })).toEqual([
      {
        id: 'gf-1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        uri: 'https://cloud.example/api/files/gf-1',
        byteCount: 2048,
        kind: 'pdf',
        checksumSha256: 'a'.repeat(64),
        // Contract defaults for a pre-classification wire payload.
        surface: 'file',
        previewable: false,
      },
    ]);
  });

  it('passes the server-derived surface/previewable classification through', () => {
    const entries = mapGeneratedFilesPayload({
      files: [
        {
          ...wireFile,
          file_name: 'page.html',
          mime_type: 'text/html',
          kind: 'html',
          surface: 'artifact',
          previewable: true,
        },
      ],
    });
    expect(entries[0]?.surface).toBe('artifact');
    expect(entries[0]?.previewable).toBe(true);
  });

  it('drops unowned absolute uris and malformed entries', () => {
    const entries = mapGeneratedFilesPayload({
      files: [{ ...wireFile, uri: 'https://media.example/x.pdf' }, { id: 'broken' }],
    });
    expect(entries).toEqual([]);
  });

  it('returns [] for absent/malformed payloads', () => {
    expect(mapGeneratedFilesPayload(undefined)).toEqual([]);
    expect(mapGeneratedFilesPayload({})).toEqual([]);
    expect(mapGeneratedFilesPayload({ files: 'nope' })).toEqual([]);
  });
});

describe('WebRuntime x_generated_files stream handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateConversation.mockResolvedValue(undefined);
    saveMessage.mockResolvedValue({ id: 'message-1' });
  });

  it('forwards Research, Cloud work mode, and a server-owned skill selection', async () => {
    const runtime = new WebRuntime();
    expect(runtime.supportsResearch).toBe(true);
    sendCloudMessage.mockResolvedValue(undefined);

    await runtime.sendMessage('conv_research', 'investigate', {
      research: true,
      agentMode: 'auto',
      workMode: 'agiwork',
      skillName: 'frontend-design',
    });

    expect(sendCloudMessage.mock.calls[0]?.[13]).toEqual({
      research: true,
      workMode: 'agiwork',
      skillName: 'frontend-design',
    });
  });

  it('emits a generated_files event when the delta carries x_generated_files', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onChunk('Here is your file.');
        onPayload({
          choices: [{ delta: { x_generated_files: { files: [wireFile] } }, index: 0 }],
        });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'make me a pdf');

    const generated = events.find((e) => e.type === 'generated_files');
    expect(generated).toBeDefined();
    if (generated?.type !== 'generated_files') throw new Error('unreachable');
    expect(generated.files).toEqual([
      expect.objectContaining({
        id: 'gf-1',
        fileName: 'report.pdf',
        uri: 'https://cloud.example/api/files/gf-1',
      }),
    ]);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('finishes a server-executed tool from x_tool_result (same tool_call_id as the tool_calls delta)', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        _onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onPayload({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'execute_code', arguments: '{"language":"python"}' },
                  },
                ],
              },
              index: 0,
            },
          ],
        });
        onPayload({
          choices: [
            {
              delta: {
                x_tool_result: {
                  tool_call_id: 'call_1',
                  name: 'execute_code',
                  content: '<stdout>ok</stdout>',
                  is_error: false,
                },
              },
              index: 0,
            },
          ],
        });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'run this');

    const toolCall = events.find((e) => e.type === 'tool_call');
    expect(toolCall).toBeDefined();
    if (toolCall?.type !== 'tool_call') throw new Error('unreachable');
    expect(toolCall.toolCall).toMatchObject({ id: 'call_1', name: 'execute_code' });

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type !== 'tool_result') throw new Error('unreachable');
    expect(toolResult.toolCallId).toBe('call_1');
    expect(toolResult.result).toBe('<stdout>ok</stdout>');
    expect(toolResult.error).toBeUndefined();
  });

  it('surfaces a failed x_tool_result as a tool_result error', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        _onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onPayload({
          choices: [
            {
              delta: {
                x_tool_result: {
                  tool_call_id: 'call_9',
                  name: 'execute_code',
                  content: 'Sandbox unavailable',
                  is_error: true,
                },
              },
              index: 0,
            },
          ],
        });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'run this');

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type !== 'tool_result') throw new Error('unreachable');
    expect(toolResult.toolCallId).toBe('call_9');
    expect(toolResult.error).toBe('Sandbox unavailable');
  });

  it('ignores x_tool_result deltas without a tool_call_id', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        _onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onPayload({
          choices: [{ delta: { x_tool_result: { name: 'execute_code', content: 'x' } }, index: 0 }],
        });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'run this');

    expect(events.some((e) => e.type === 'tool_result')).toBe(false);
  });

  it('captures the OpenAI-wire finish_reason and emits it on the done event (Continue-Generation)', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onChunk('partial answer that got cut');
        // Server tool loops emit an intermediate 'tool_calls' reason before the
        // final one — the LAST reason seen must win.
        onPayload({ choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }] });
        onPayload({ choices: [{ delta: {}, finish_reason: 'length', index: 0 }] });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'write a long essay');

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    if (done?.type !== 'done') throw new Error('unreachable');
    expect(done.finishReason).toBe('length');
  });

  it('omits finishReason on the done event when the stream carries no finish_reason', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onChunk('answer');
        onPayload({ choices: [{ delta: { content: 'answer' }, index: 0 }] });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'hi');

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    if (done?.type !== 'done') throw new Error('unreachable');
    expect(done.finishReason).toBeUndefined();
  });

  it('emits no generated_files event for deltas without x_generated_files', async () => {
    const runtime = new WebRuntime();
    const events = collectEvents(runtime);

    sendCloudMessage.mockImplementation(
      async (
        _conversationId: string,
        _content: string,
        _model: string,
        onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (err: Error) => void,
        _signal: AbortSignal,
        onPayload: (payload: Record<string, unknown>) => void,
      ) => {
        onChunk('plain answer');
        onPayload({ choices: [{ delta: { content: 'plain answer' }, index: 0 }] });
        onDone();
      },
    );

    await runtime.sendMessage('conv_1', 'hello');

    expect(events.some((e) => e.type === 'generated_files')).toBe(false);
  });
});

describe('WebRuntime.hasLiveApprovalTurn', () => {
  it('hydrates a server-owned approval checkpoint on a fresh runtime instance', () => {
    const runtime = new WebRuntime();
    expect(
      runtime.hasLiveApprovalTurn('conv_1', {
        assistantMessageId: 'assistant-1',
        runId: '0190a000-0000-7000-8000-000000000099',
        model: 'gpt-5',
        assistantContent: '',
        calls: [{ toolCallId: 'call_1', name: 'read_file', args: {} }],
      }),
    ).toBe(true);
  });
});

describe('WebRuntime persisted approval loading', () => {
  it('maps validated Cloud approval metadata into inline tool cards', async () => {
    const runId = '0190a000-0000-7000-8000-000000000099';
    getCloudConversation.mockResolvedValue({
      id: 'conv_1',
      user_id: 'user_1',
      title: 'Chat',
      model: 'gpt-5',
      created_at: '2026-07-17T00:00:00.000Z',
      updated_at: '2026-07-17T00:00:00.000Z',
      messages: [
        {
          id: 'message_1',
          conversation_id: 'conv_1',
          role: 'assistant',
          content: 'Waiting.',
          model: 'gpt-5',
          created_at: '2026-07-17T00:00:00.000Z',
          metadata: {
            cloudAgentRun: {
              runId,
              runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
              lastSequence: 2,
            },
            cloudApproval: {
              schemaVersion: 1,
              runId,
              calls: [{ toolCallId: 'call_1', name: 'shell', input: '{"command":"pwd"}' }],
            },
          },
        },
      ],
    });

    const [message] = await new WebRuntime().getMessages('conv_1');

    expect(message?.toolCalls).toEqual([
      {
        id: 'call_1',
        name: 'shell',
        args: { command: 'pwd' },
        status: 'awaiting_approval',
        requiresApproval: true,
      },
    ]);
  });
});
