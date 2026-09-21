import { describe, expect, it, vi } from 'vitest';

import { retrievePastChatCandidates } from '@/lib/services/past-chat-context-service';
import { loadManagedReflectRecap } from '@/lib/services/reflect-service';
import { loadProjectContext } from '@/lib/services/project-context-service';

// Enough of a row for each read to keep going, so the conversation queries
// further down the path are actually issued rather than skipped.
function rowsFor(sql: string): unknown[] {
  if (/\buser_settings\b/.test(sql)) {
    return [{ settings: { capabilities: { memory: true, generateFromHistory: true } } }];
  }
  if (/\buser_projects\b/.test(sql)) {
    return [
      {
        id: 'project-1',
        name: 'Pricing',
        description: null,
        instructions: null,
        organization_id: null,
      },
    ];
  }
  return [];
}

function recordingDb(recorded: string[]) {
  const query = vi.fn(async (sql: string) => {
    recorded.push(sql);
    return rowsFor(sql);
  });
  const execute = vi.fn(async () => ({ rowCount: 0 }));
  return {
    query,
    execute,
    transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run({ query, execute })),
  };
}

/** Statements that read the conversation table for something downstream. */
function conversationReads(statements: readonly string[]): string[] {
  return statements.filter((sql) => /\bweb_conversations\b/.test(sql));
}

function excludesTemporary(sql: string): boolean {
  const normalized = sql.replace(
    /coalesce\(\s*(?:[a-z]+\.)?is_temporary\s*,\s*false\s*\)/gi,
    'is_temporary',
  );
  return /is_temporary\s*(?:=\s*false|is not true)/i.test(normalized);
}

async function statementsFor(run: (db: ReturnType<typeof recordingDb>) => Promise<unknown>) {
  const recorded: string[] = [];
  const db = recordingDb(recorded);
  await run(db);
  return recorded;
}

describe('a temporary conversation is invisible to every path that reads past chats', () => {
  it('excludes it from past-chat recall, on the semantic path and the keyword path alike', async () => {
    const statements = await statementsFor((db) =>
      retrievePastChatCandidates(db as never, {
        userId: 'user-1',
        query: 'what did we decide about the pricing page',
        organizationId: null,
        currentConversationId: 'conversation-current',
      }),
    );

    const reads = conversationReads(statements);
    expect(reads.length).toBeGreaterThan(0);
    for (const sql of reads) expect(excludesTemporary(sql)).toBe(true);
  });

  it('excludes it from the project context a later turn is given', async () => {
    const statements = await statementsFor((db) =>
      loadProjectContext(db as never, {
        userId: 'user-1',
        projectId: 'project-1',
        currentConversationId: 'conversation-current',
        currentUserQuery: 'pricing page',
      }),
    );

    const reads = conversationReads(statements);
    expect(reads.length).toBeGreaterThan(0);
    for (const sql of reads) expect(excludesTemporary(sql)).toBe(true);
  });

  it('excludes it from the activity recap built out of a user history', async () => {
    const statements = await statementsFor((db) =>
      loadManagedReflectRecap({
        db: db as never,
        userId: 'user-1',
        organizationId: null,
        range: '30d',
        timezone: 'UTC',
        now: new Date('2026-02-01T00:00:00Z'),
      }),
    );

    const reads = conversationReads(statements);
    expect(reads.length).toBeGreaterThan(0);
    for (const sql of reads) expect(excludesTemporary(sql)).toBe(true);
  });
});
