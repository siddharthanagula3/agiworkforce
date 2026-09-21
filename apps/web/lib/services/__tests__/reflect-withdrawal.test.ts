import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { StatementScanPostgres, type Row } from './statement-scan-postgres';
import { loadManagedReflectRecap } from '../reflect-service';

const USER = 'user_owner';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const WITHDRAWN_WORDS = 'the error and the crash and the bug and the broken stack trace failing';

function userMessage(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    conversation_id: CONVERSATION,
    role: 'user',
    content,
    metadata: {},
    created_at: `2026-09-1${id}T00:00:00.000Z`,
    deleted_at: deletedAt,
  };
}

function seeded() {
  return new StatementScanPostgres({
    user_settings: [
      { user_id: USER, settings: { capabilities: { memory: true, generateFromHistory: true } } },
    ],
    web_conversations: [
      {
        id: CONVERSATION,
        user_id: USER,
        organization_id: null,
        title: 'Planning',
        is_temporary: false,
        created_at: '2026-09-15T00:00:00.000Z',
        updated_at: '2026-09-15T00:00:00.000Z',
        deleted_at: null,
      },
    ],
    web_messages: [
      userMessage('1', WITHDRAWN_WORDS, '2026-09-16T00:00:00.000Z'),
      userMessage('2', 'kept', null),
      userMessage('3', WITHDRAWN_WORDS, '2026-09-16T00:00:00.000Z'),
    ],
  });
}

async function recap(db: StatementScanPostgres) {
  const result = await loadManagedReflectRecap({
    db: db as unknown as DatabaseAdapter,
    userId: USER,
    organizationId: null,
    range: '30d',
    timezone: 'UTC',
    now: new Date('2026-09-20T00:00:00.000Z'),
  });
  if (result.kind !== 'recap') throw new Error(`reflect returned ${result.kind}`);
  return result.recap;
}

function observation(recapResult: Awaited<ReturnType<typeof recap>>, title: string): string {
  const insight = recapResult.insights.find((entry) => entry.title === title);
  if (!insight) throw new Error(`no insight titled ${title}`);
  return insight.observation;
}

describe('loadManagedReflectRecap', () => {
  it('counts only the turns the user kept', async () => {
    const result = await recap(seeded());
    expect(observation(result, 'How you set context')).toContain('averaged 1 words');
    expect(observation(result, 'How often you followed up')).toContain(
      'in 0% of sampled conversations',
    );
  });

  it('draws the topic from the turns the user kept', async () => {
    const result = await recap(seeded());
    expect(result.topics.map((topic) => topic.id)).toEqual(['general']);
    expect(observation(result, 'What you handed off')).not.toMatch(/debug/i);
  });

  it('leaves a conversation out entirely once it is withdrawn', async () => {
    const db = seeded();
    db.rowsIn('web_conversations')[0]!['deleted_at'] = '2026-09-17T00:00:00.000Z';
    const result = await recap(db);
    expect(result.sampledConversationCount).toBe(0);
  });
});
