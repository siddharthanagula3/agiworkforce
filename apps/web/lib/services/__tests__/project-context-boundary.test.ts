import { describe, expect, it } from 'vitest';

import { loadProjectContext, type ProjectContextDb } from '../project-context-service';

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ARCHIVED_PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DELETED_PROJECT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWNER = 'user-owner';
const OTHER_USER = 'user-other';

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  organization_id: string | null;
  is_archived: boolean;
  deleted_at: string | null;
}

interface FileRow {
  id: string;
  project_id: string;
  file_name: string;
  summary: string | null;
  extracted_text: string | null;
  deleted_at: string | null;
  superseded_at: string | null;
}

interface ChatRow {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string;
  updated_at: string;
  deleted_at: string | null;
  archived: boolean;
  is_temporary: boolean;
  message: string;
  message_deleted_at: string | null;
}

const PROJECTS: ProjectRow[] = [
  {
    id: PROJECT,
    user_id: OWNER,
    name: 'Launch',
    description: null,
    instructions: 'owner-instructions',
    organization_id: null,
    is_archived: false,
    deleted_at: null,
  },
  {
    id: ARCHIVED_PROJECT,
    user_id: OWNER,
    name: 'Archived',
    description: null,
    instructions: 'archived-instructions',
    organization_id: null,
    is_archived: true,
    deleted_at: null,
  },
  {
    id: DELETED_PROJECT,
    user_id: OWNER,
    name: 'Deleted',
    description: null,
    instructions: 'deleted-instructions',
    organization_id: null,
    is_archived: false,
    deleted_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: OTHER_PROJECT,
    user_id: OTHER_USER,
    name: 'Someone else',
    description: null,
    instructions: 'foreign-instructions',
    organization_id: null,
    is_archived: false,
    deleted_at: null,
  },
];

const FILES: FileRow[] = [
  {
    id: 'file-live',
    project_id: PROJECT,
    file_name: 'live.md',
    summary: 'live-summary',
    extracted_text: 'live body',
    deleted_at: null,
    superseded_at: null,
  },
  {
    id: 'file-removed',
    project_id: PROJECT,
    file_name: 'removed.md',
    summary: 'removed-summary',
    extracted_text: 'removed body',
    deleted_at: '2026-09-02T00:00:00.000Z',
    superseded_at: null,
  },
  {
    id: 'file-replaced',
    project_id: PROJECT,
    file_name: 'replaced.md',
    summary: 'replaced-summary',
    extracted_text: 'replaced body',
    deleted_at: null,
    superseded_at: '2026-09-03T00:00:00.000Z',
  },
  {
    id: 'file-foreign',
    project_id: OTHER_PROJECT,
    file_name: 'foreign.md',
    summary: 'foreign-summary',
    extracted_text: 'foreign body',
    deleted_at: null,
    superseded_at: null,
  },
];

function chat(overrides: Partial<ChatRow> & Pick<ChatRow, 'id' | 'message'>): ChatRow {
  return {
    project_id: PROJECT,
    user_id: OWNER,
    title: overrides.id,
    updated_at: '2026-09-10T00:00:00.000Z',
    deleted_at: null,
    archived: false,
    is_temporary: false,
    message_deleted_at: null,
    ...overrides,
  };
}

const CHATS: ChatRow[] = [
  chat({ id: 'sibling-live', message: 'live-sibling-body' }),
  chat({ id: 'sibling-temporary', message: 'temporary-sibling-body', is_temporary: true }),
  chat({
    id: 'sibling-deleted',
    message: 'deleted-sibling-body',
    deleted_at: '2026-09-04T00:00:00.000Z',
  }),
  chat({ id: 'sibling-archived', message: 'archived-sibling-body', archived: true }),
  chat({ id: 'sibling-other-user', message: 'other-user-sibling-body', user_id: OTHER_USER }),
  chat({ id: 'sibling-moved-out', message: 'moved-out-sibling-body', project_id: null }),
  chat({ id: 'sibling-other-project', message: 'other-project-body', project_id: OTHER_PROJECT }),
  chat({
    id: 'sibling-withdrawn-turn',
    message: 'withdrawn-turn-body',
    message_deleted_at: '2026-09-05T00:00:00.000Z',
  }),
];

/**
 * Answers each read using only the predicates the statement really binds, so a
 * dropped predicate widens the result instead of being silently reapplied here.
 */
function projectDb(): ProjectContextDb {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const text = sql.toLowerCase();
      const binds = (pattern: RegExp) => pattern.test(text);

      if (text.includes('from user_projects')) {
        return PROJECTS.filter(
          (row) =>
            (!binds(/\bid\s*=\s*\$1/) || row.id === params[0]) &&
            (!binds(/user_id\s*=\s*\$2/) || row.user_id === params[1]) &&
            (!binds(/is_archived\s*=\s*false/) || !row.is_archived) &&
            (!binds(/deleted_at\s+is\s+null/) || row.deleted_at === null),
        ) as T[];
      }

      if (text.includes('from project_knowledge_files')) {
        return FILES.filter(
          (row) =>
            (!binds(/project_id\s*=\s*\$1/) || row.project_id === params[0]) &&
            (!binds(/deleted_at\s+is\s+null/) || row.deleted_at === null) &&
            (!binds(/superseded_at\s+is\s+null/) || row.superseded_at === null),
        ).map((row) => ({
          id: row.id,
          file_name: row.file_name,
          summary: row.summary,
          extracted_text: row.extracted_text,
          extracted_anchors: null,
        })) as T[];
      }

      if (text.includes('from web_conversations')) {
        return CHATS.filter(
          (row) =>
            (!binds(/c\.project_id\s*=\s*\$1/) || row.project_id === params[0]) &&
            (!binds(/c\.user_id\s*=\s*\$2/) || row.user_id === params[1]) &&
            (!binds(/c\.deleted_at\s+is\s+null/) || row.deleted_at === null) &&
            (!binds(/c\.is_temporary\s*=\s*false/) || !row.is_temporary) &&
            (!binds(/coalesce\(c\.archived,\s*false\)\s*=\s*false/) || !row.archived) &&
            (!binds(/c\.id\s*<>\s*\$3/) || row.id !== params[2]),
        ).map((row) => ({
          id: row.id,
          title: row.title,
          updated_at: row.updated_at,
          role: 'user',
          content: binds(/\bdeleted_at\s+is\s+null/) && row.message_deleted_at ? null : row.message,
          created_at: row.updated_at,
        })) as T[];
      }

      return [] as T[];
    },
  };
}

async function loadOwnerContext(projectId = PROJECT) {
  return loadProjectContext(projectDb(), { projectId, userId: OWNER });
}

describe('a project is the boundary of what a turn may read', () => {
  it('assembles the project it was asked for and nothing beside it', async () => {
    const context = await loadOwnerContext();
    const rendered = JSON.stringify(context);

    expect(context?.projectId).toBe(PROJECT);
    expect(context?.instructions).toBe('owner-instructions');
    expect(rendered).not.toContain('foreign-instructions');
    expect(rendered).not.toContain('foreign-summary');
    expect(rendered).not.toContain('other-project-body');
  });

  it('refuses a project belonging to another account', async () => {
    await expect(loadOwnerContext(OTHER_PROJECT)).resolves.toBeNull();
  });

  it('refuses an archived project instead of quietly answering from it', async () => {
    await expect(loadOwnerContext(ARCHIVED_PROJECT)).resolves.toBeNull();
  });

  it('refuses a deleted project, so deletion removes it from the context path', async () => {
    await expect(loadOwnerContext(DELETED_PROJECT)).resolves.toBeNull();
  });
});

describe('project knowledge is only the files the project still holds', () => {
  it('carries the live file', async () => {
    const context = await loadOwnerContext();
    expect(context?.knowledgeFiles.map((file) => file.fileName)).toContain('live.md');
  });

  it('drops a deleted file and a superseded one', async () => {
    const context = await loadOwnerContext();
    const names = context?.knowledgeFiles.map((file) => file.fileName) ?? [];

    expect(names).not.toContain('removed.md');
    expect(names).not.toContain('replaced.md');
    expect(JSON.stringify(context)).not.toContain('removed body');
    expect(JSON.stringify(context)).not.toContain('replaced body');
  });
});

describe('sibling chats are the project’s own, and only those', () => {
  it('carries a live sibling in the project', async () => {
    const context = await loadOwnerContext();
    expect(context?.siblingChats.map((entry) => entry.title)).toContain('sibling-live');
  });

  it('never quotes a temporary chat', async () => {
    const context = await loadOwnerContext();
    expect(JSON.stringify(context)).not.toContain('temporary-sibling-body');
  });

  it('never quotes a deleted chat or an archived one', async () => {
    const context = await loadOwnerContext();
    const rendered = JSON.stringify(context);

    expect(rendered).not.toContain('deleted-sibling-body');
    expect(rendered).not.toContain('archived-sibling-body');
  });

  it('never quotes another account’s chat filed under the same project', async () => {
    const context = await loadOwnerContext();
    expect(JSON.stringify(context)).not.toContain('other-user-sibling-body');
  });

  it('loses a conversation that was moved out of the project', async () => {
    const context = await loadOwnerContext();
    expect(JSON.stringify(context)).not.toContain('moved-out-sibling-body');
  });

  it('never quotes a turn the user withdrew from a chat it still keeps', async () => {
    const context = await loadOwnerContext();
    expect(JSON.stringify(context)).not.toContain('withdrawn-turn-body');
  });

  it('leaves the current conversation out of its own context', async () => {
    const context = await loadProjectContext(projectDb(), {
      projectId: PROJECT,
      userId: OWNER,
      currentConversationId: 'sibling-live',
    });

    expect(JSON.stringify(context)).not.toContain('live-sibling-body');
  });
});
