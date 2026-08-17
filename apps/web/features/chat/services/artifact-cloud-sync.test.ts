import { describe, expect, it, vi } from 'vitest';
import type {
  ArtifactSyncPushItem,
  ArtifactWireDelta,
  ChatSyncPullResponse,
  ChatSyncPushResponse,
} from '@agiworkforce/cloud-contracts';

import { pullArtifactCloudChanges, pushArtifactCloudChanges } from './artifact-cloud-sync';

function artifact(serverVersion: string): ArtifactWireDelta {
  return {
    id: `00000000-0000-4000-8000-${serverVersion.padStart(12, '0')}`,
    conversation_id: '00000000-0000-4000-8000-000000000001',
    message_id: '00000000-0000-4000-8000-000000000002',
    title: 'Synced artifact',
    artifact_type: 'html',
    language: 'html',
    content: `<main>${serverVersion}</main>`,
    current_version: 1,
    pinned: false,
    tags: [],
    created_at: '2026-07-17T00:00:00.000Z',
    updated_at: '2026-07-17T00:00:00.000Z',
    deleted_at: null,
    server_version: serverVersion,
  };
}

function page(
  cursor: string,
  hasMore: boolean,
  artifacts: ArtifactWireDelta[] = [],
): ChatSyncPullResponse {
  return { conversations: [], messages: [], artifacts, cursor, hasMore };
}

describe('pullArtifactCloudChanges', () => {
  it('validates and applies every page using the server safe cursor', async () => {
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page('4', true, [artifact('3')])), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(page('9', false, [artifact('8')])), { status: 200 }),
      );
    const applyDeltas = vi.fn();

    const cursor = await pullArtifactCloudChanges({
      cursor: '0',
      getToken: async () => 'test-token',
      applyDeltas,
      fetchImpl,
    });

    expect(cursor).toBe('9');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/chat/sync?since=0',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/chat/sync?since=4', expect.any(Object));
    expect(applyDeltas).toHaveBeenNthCalledWith(1, [artifact('3')]);
    expect(applyDeltas).toHaveBeenNthCalledWith(2, [artifact('8')]);
  });

  it('rejects an invalid wire response before applying it', async () => {
    const applyDeltas = vi.fn();

    await expect(
      pullArtifactCloudChanges({
        cursor: '0',
        getToken: async () => 'test-token',
        applyDeltas,
        fetchImpl: vi
          .fn<(input: string, init?: RequestInit) => Promise<Response>>()
          .mockResolvedValue(
            new Response(JSON.stringify({ artifacts: [], cursor: '1', hasMore: false }), {
              status: 200,
            }),
          ),
      }),
    ).rejects.toThrow('invalid artifact sync response');
    expect(applyDeltas).not.toHaveBeenCalled();
  });

  it('stops a saturated page loop whose safe cursor did not advance', async () => {
    await expect(
      pullArtifactCloudChanges({
        cursor: '7',
        getToken: async () => 'test-token',
        applyDeltas: vi.fn(),
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(JSON.stringify(page('7', true)), { status: 200 })),
      }),
    ).rejects.toThrow('cursor did not advance');
  });
});

describe('pushArtifactCloudChanges', () => {
  it('pushes locally created artifacts as a protocol-2 batch', async () => {
    const pushItem: ArtifactSyncPushItem = {
      id: '00000000-0000-4000-8000-0000000000aa',
      conversationId: '00000000-0000-4000-8000-000000000001',
      messageId: '00000000-0000-4000-8000-000000000002',
      title: 'Local artifact',
      artifactType: 'html',
      language: 'html',
      content: '<main>Local</main>',
      currentVersion: 1,
      baseVersion: '0',
    };
    const pushResponse: ChatSyncPushResponse = {
      protocolVersion: 2,
      applied: {
        conversations: [],
        messages: [],
        artifacts: [{ id: pushItem.id, server_version: '31' }],
      },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '31',
    };
    const fetchImpl = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response(JSON.stringify(pushResponse), { status: 200 }));

    const result = await pushArtifactCloudChanges({
      artifacts: [pushItem],
      getToken: async () => 'test-token',
      fetchImpl,
    });

    expect(result).toEqual(pushResponse);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/api/chat/sync');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
    expect(JSON.parse(String(init?.body))).toEqual({
      protocolVersion: 2,
      artifacts: [pushItem],
    });
  });

  it('never calls the network when there is nothing local to push', async () => {
    const fetchImpl = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

    await expect(
      pushArtifactCloudChanges({ artifacts: [], getToken: async () => 'test-token', fetchImpl }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an invalid push response instead of claiming the batch landed', async () => {
    await expect(
      pushArtifactCloudChanges({
        artifacts: [
          {
            id: '00000000-0000-4000-8000-0000000000aa',
            conversationId: '00000000-0000-4000-8000-000000000001',
            artifactType: 'html',
            content: '<main>Local</main>',
            baseVersion: '0',
          },
        ],
        getToken: async () => 'test-token',
        fetchImpl: vi
          .fn<(input: string, init?: RequestInit) => Promise<Response>>()
          .mockResolvedValue(new Response(JSON.stringify({ applied: {} }), { status: 200 })),
      }),
    ).rejects.toThrow('invalid artifact sync push response');
  });
});
