import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PROVENANCE_SCHEMA_VERSION } from '@agiworkforce/context';
import {
  UNGOVERNED_MEMORY_POLICY,
  memoryProvenance,
  writeConsolidatedMemory,
  type ManagedMemoryPolicy,
} from '../managed-memory-context-service';

const MEMORY_ON: ManagedMemoryPolicy = {
  enabled: true,
  generateFromHistory: true,
  allowToolAssistedGeneration: true,
  searchPastChats: true,
};

const CONVERSATION = '0190a000-0000-7000-8000-00000000c001';

function capture() {
  const query = vi.fn(async () => [{ outcome: 'inserted', id: 'm1' }]);
  return {
    db: { query } as never,
    params: () => (query.mock.calls[0] as unknown as [string, unknown[]])[1],
    sql: () => (query.mock.calls[0] as unknown as [string, unknown[]])[0],
  };
}

describe('memoryProvenance', () => {
  it('records the account, the conversation, the turn and the trust boundary', () => {
    const record = memoryProvenance({
      userId: 'u1',
      conversationId: CONVERSATION,
      turnId: 'req-1',
      createdAt: '2026-09-20T00:00:00.000Z',
    });

    expect(record).toMatchObject({
      objectKind: 'memory',
      creatorAccountId: 'u1',
      sourceConversationId: CONVERSATION,
      sourceTurnId: 'req-1',
      trustMode: 'managed',
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      agentId: null,
    });
  });

  it('refuses to claim a memory was learned somewhere it names no turn', () => {
    expect(() =>
      memoryProvenance({ userId: 'u1', conversationId: CONVERSATION, turnId: '  ' }),
    ).toThrow(/missing .*sourceTurnId/);
  });

  it('names the agent when an unattended run produced the fact', () => {
    expect(
      memoryProvenance({
        userId: 'u1',
        conversationId: CONVERSATION,
        turnId: 'run-9',
        agentId: 'schedule-task-3',
      }).agentId,
    ).toBe('schedule-task-3');
  });
});

describe('writeConsolidatedMemory stamps where the fact was learned', () => {
  it('writes the conversation, the turn and the provenance record on a learned fact', async () => {
    const recorded = capture();
    await writeConsolidatedMemory(
      recorded.db,
      {
        userId: 'u1',
        content: 'User prefers concise answers.',
        category: 'preference',
        source: 'auto',
        sourceConversationId: CONVERSATION,
        sourceTurnId: 'req-42',
      },
      { policies: { organization: UNGOVERNED_MEMORY_POLICY, user: MEMORY_ON } },
    );

    const params = recorded.params();
    expect(recorded.sql()).toContain('source_conversation_id');
    expect(params[11]).toBe(CONVERSATION);
    expect(params[12]).toBe('req-42');
    expect(JSON.parse(params[13] as string)).toMatchObject({
      objectKind: 'memory',
      creatorAccountId: 'u1',
      sourceConversationId: CONVERSATION,
      sourceTurnId: 'req-42',
    });
  });

  it('claims nothing for a memory the user typed in rather than one it learned', async () => {
    const recorded = capture();
    await writeConsolidatedMemory(
      recorded.db,
      { userId: 'u1', content: 'User prefers tables.', category: 'preference', source: 'web' },
      { policies: { organization: UNGOVERNED_MEMORY_POLICY, user: MEMORY_ON } },
    );

    const params = recorded.params();
    expect(params[11]).toBeNull();
    expect(params[12]).toBeNull();
    expect(JSON.parse(params[13] as string)).toEqual({});
  });
});
