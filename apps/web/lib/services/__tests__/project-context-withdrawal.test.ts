import { describe, expect, it } from 'vitest';
import { StatementScanPostgres, type Row } from './statement-scan-postgres';
import { loadProjectContext, type ProjectContextDb } from '../project-context-service';

const USER = 'user_owner';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const CURRENT = '22222222-2222-4222-8222-222222222222';
const SIBLING = '33333333-3333-4333-8333-333333333333';

function conversation(id: string, title: string, deletedAt: string | null): Row {
  return {
    id,
    title,
    project_id: PROJECT,
    user_id: USER,
    is_temporary: false,
    archived: false,
    updated_at: '2026-09-18T00:00:00.000Z',
    deleted_at: deletedAt,
  };
}

function message(id: string, content: string, deletedAt: string | null): Row {
  return {
    id,
    conversation_id: SIBLING,
    role: 'user',
    content,
    created_at: `2026-09-1${id}T00:00:00.000Z`,
    deleted_at: deletedAt,
  };
}

function seeded(siblingDeletedAt: string | null = null) {
  return new StatementScanPostgres({
    user_projects: [
      {
        id: PROJECT,
        user_id: USER,
        organization_id: null,
        name: 'Launch',
        description: null,
        instructions: null,
        is_archived: false,
        deleted_at: null,
      },
    ],
    project_knowledge_files: [],
    web_conversations: [
      conversation(CURRENT, 'Current chat', null),
      conversation(SIBLING, 'Sibling chat', siblingDeletedAt),
    ],
    web_messages: [
      message('1', 'the sentence the user took back', '2026-09-19T00:00:00.000Z'),
      message('2', 'the sentence the user kept', null),
    ],
  });
}

async function siblingPreviews(db: StatementScanPostgres) {
  const context = await loadProjectContext(db as unknown as ProjectContextDb, {
    projectId: PROJECT,
    userId: USER,
    currentConversationId: CURRENT,
    currentUserQuery: 'launch',
  });
  return (context?.siblingChats ?? []).map((chat) => chat.preview ?? '').join('\n');
}

describe('loadProjectContext', () => {
  it('quotes no sibling turn the user deleted', async () => {
    const previews = await siblingPreviews(seeded());
    expect(previews).toContain('the sentence the user kept');
    expect(previews).not.toContain('the sentence the user took back');
  });

  it('drops the sibling entirely once its conversation is deleted', async () => {
    const previews = await siblingPreviews(seeded('2026-09-19T00:00:00.000Z'));
    expect(previews).not.toContain('the sentence the user kept');
  });
});
