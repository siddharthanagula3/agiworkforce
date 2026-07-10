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

vi.mock('../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.example',
  sendCloudMessage: (...args: unknown[]) => sendCloudMessage(...args),
  listCloudConversations: vi.fn(),
  createCloudConversation: vi.fn(),
  getCloudConversation: vi.fn(),
  deleteCloudConversation: vi.fn(),
  updateCloudConversationTitle: vi.fn(),
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
      },
    ]);
  });

  it('passes absolute uris through unchanged and drops malformed entries', () => {
    const entries = mapGeneratedFilesPayload({
      files: [{ ...wireFile, uri: 'https://media.example/x.pdf' }, { id: 'broken' }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.uri).toBe('https://media.example/x.pdf');
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
