import { describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { StatementScanPostgres, type Row } from './statement-scan-postgres';
import { listCloudAgentRuns } from '../cloud-agent-run-service';

const USER = 'user_owner';
const RUN = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

function prompt(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    conversation_id: CONVERSATION,
    role: 'user',
    content,
    created_at: `2026-09-1${id}T00:00:00.000Z`,
    deleted_at: deletedAt,
  };
}

function seeded(conversationDeletedAt: string | null = null) {
  return new StatementScanPostgres({
    cloud_agent_runs: [
      {
        id: RUN,
        user_id: USER,
        request_id: '33333333-3333-4333-8333-333333333333',
        conversation_id: CONVERSATION,
        origin_surface: 'web',
        work_mode: 'agiwork',
        state: 'running',
        provider: 'anthropic',
        model: 'claude-opus-5',
        last_event_sequence: 1,
        cancellation_requested_at: null,
        pause_requested_at: null,
        completed_at: null,
        created_at: '2026-09-18T00:00:00.000Z',
        updated_at: '2026-09-18T00:00:00.000Z',
      },
    ],
    web_conversations: [
      {
        id: CONVERSATION,
        user_id: USER,
        title: 'Agent run',
        project_id: null,
        deleted_at: conversationDeletedAt,
      },
    ],
    web_messages: [
      prompt('1', 'the prompt the user took back', '2026-09-19T00:00:00.000Z'),
      prompt('2', 'the prompt the user kept', null),
    ],
    cloud_agent_approval_checkpoints: [],
  });
}

async function previews(db: StatementScanPostgres) {
  const list = await listCloudAgentRuns(db as unknown as DatabaseAdapter, {
    userId: USER,
    states: ['running'],
  });
  return list.runs.map((run) => run.conversationPreview ?? '');
}

describe('listCloudAgentRuns', () => {
  it('previews no prompt the user deleted', async () => {
    const shown = await previews(seeded());
    expect(shown).toContain('the prompt the user kept');
    expect(shown).not.toContain('the prompt the user took back');
  });

  it('shows no preview at all once the conversation is deleted', async () => {
    const shown = await previews(seeded('2026-09-19T00:00:00.000Z'));
    expect(shown).toEqual(['']);
  });
});
