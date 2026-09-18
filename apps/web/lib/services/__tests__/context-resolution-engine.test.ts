import { describe, expect, it, vi } from 'vitest';
import { resolveContext } from '@agiworkforce/context-engine';
import {
  loadOrganizationContextPolicy,
  managedMemoryContextLoader,
} from '../managed-memory-context-service';
import { pastChatContextLoader } from '../past-chat-context-service';

const MEMORY_ROW = {
  id: 'memory-1',
  content: 'My favourite mooring knot is the bowline.',
  category: 'preference',
  pinned: true,
  updated_at: '2026-09-08T10:00:00.000Z',
};

const PAST_CHAT_ROW = {
  id: 'message-1',
  conversation_id: 'conversation-1',
  role: 'user',
  content: 'my favourite mooring knot is the bowline',
  created_at: '2026-09-08T10:00:00.000Z',
  title: 'Sailing notes',
};

describe('loadOrganizationContextPolicy', () => {
  it('reads the memory, connector and web gates from the one workspace policy row', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { allow_memory: true, allow_connector_context: false, allow_web_result_context: true },
      ]);

    await expect(loadOrganizationContextPolicy({ query }, 'org-1')).resolves.toEqual({
      allowMemory: true,
      allowPastChats: true,
      allowConnectorResults: false,
      allowWebResults: true,
    });
    expect((query.mock.calls[0] as [string])[0]).toContain('organization_admin_policies');
  });

  it('closes every class when the workspace has no policy row or the read fails', async () => {
    await expect(
      loadOrganizationContextPolicy({ query: vi.fn().mockResolvedValue([]) }, 'org-1'),
    ).resolves.toMatchObject({ allowMemory: false, allowConnectorResults: false });

    await expect(
      loadOrganizationContextPolicy(
        { query: vi.fn().mockRejectedValue(new Error('policy unreadable')) },
        'org-1',
      ),
    ).resolves.toMatchObject({ allowMemory: false, allowWebResults: false });
  });

  it('leaves a personal account ungoverned', async () => {
    const query = vi.fn();
    await expect(loadOrganizationContextPolicy({ query }, null)).resolves.toMatchObject({
      allowMemory: true,
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('resolving the web loaders through the engine', () => {
  it('keeps memory out of the turn when the workspace has it turned off', async () => {
    const db = { query: vi.fn().mockResolvedValue([MEMORY_ROW]) };
    const loader = managedMemoryContextLoader(db, { userId: 'user-1', organizationId: 'org-1' });

    const resolution = await resolveContext({
      turnId: 'turn-1',
      actor: { userId: 'user-1', organizationId: 'org-1', projectId: null },
      policy: {
        allowMemory: false,
        allowPastChats: true,
        allowConnectorResults: true,
        allowWebResults: true,
      },
      loaders: [loader],
    });

    expect(resolution.items).toHaveLength(0);
    expect(resolution.manifest.entries[0]).toMatchObject({
      sourceClass: 'account_memory',
      candidateCount: 1,
      includedCount: 0,
      excluded: [{ reason: 'policy_denied', count: 1 }],
    });
  });

  it('drops a past-chat excerpt restating a fact memory already carries', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce([MEMORY_ROW]).mockResolvedValueOnce([PAST_CHAT_ROW]),
    };
    const query = 'What did I say my favourite mooring knot was?';

    const resolution = await resolveContext({
      turnId: 'turn-2',
      actor: { userId: 'user-1', organizationId: null, projectId: null },
      policy: {
        allowMemory: true,
        allowPastChats: true,
        allowConnectorResults: true,
        allowWebResults: true,
      },
      loaders: [
        managedMemoryContextLoader(db, { userId: 'user-1' }),
        pastChatContextLoader(db, { userId: 'user-1', query }),
      ],
    });

    expect(resolution.itemsOf('account_memory')).toHaveLength(1);
    expect(resolution.itemsOf('past_chat')).toHaveLength(0);
    expect(resolution.manifest.entries[1]?.excluded).toEqual([
      { reason: 'duplicate_fact', count: 1 },
    ]);
  });

  it('marks a past chat older than the freshness window stale', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        {
          ...PAST_CHAT_ROW,
          content: 'the bowline knot notes',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    const resolution = await resolveContext({
      turnId: 'turn-3',
      actor: { userId: 'user-1', organizationId: null, projectId: null },
      policy: {
        allowMemory: true,
        allowPastChats: true,
        allowConnectorResults: true,
        allowWebResults: true,
      },
      nowMs: Date.parse('2026-09-18T00:00:00.000Z'),
      loaders: [
        pastChatContextLoader(db, { userId: 'user-1', query: 'What were my bowline knot notes?' }),
      ],
    });

    expect(resolution.items[0]?.stale).toBe(true);
    expect(resolution.manifest.entries[0]?.staleCount).toBe(1);
  });

  it('hands the memory item back for the sources the engine kept', async () => {
    const db = { query: vi.fn().mockResolvedValue([MEMORY_ROW]) };
    const loader = managedMemoryContextLoader(db, { userId: 'user-1' });

    const resolution = await resolveContext({
      turnId: 'turn-4',
      actor: { userId: 'user-1', organizationId: null, projectId: null },
      policy: {
        allowMemory: true,
        allowPastChats: true,
        allowConnectorResults: true,
        allowWebResults: true,
      },
      loaders: [loader],
    });

    const [item] = resolution.itemsOf('account_memory');
    expect(loader.itemFor(item!.source.id)).toEqual({
      content: MEMORY_ROW.content,
      category: 'preference',
      pinned: true,
    });
  });
});
