import { describe, expect, it } from 'vitest';

import { contextSourceClassPolicies } from '@agiworkforce/context';

import { loadProjectContext, type ProjectContextDb } from '../project-context-service';

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'user-owner';
const CURRENT_CONVERSATION = 'conversation-current';

const PROJECT_CONTEXT_MODULE = 'apps/web/lib/services/project-context-service.ts';
const PROJECT_CONTEXT_LOADER = 'loadProjectContext';

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Answers the project row only while `ownsProject` holds, and records what was
 * asked. Everything after the project read answers empty: what is under test is
 * which statements run and what binds them, not what they return.
 */
function recordingDb(options: { ownsProject: boolean }): {
  db: ProjectContextDb;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const db: ProjectContextDb = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      queries.push({ sql, params });
      if (sql.includes('from user_projects')) {
        if (!options.ownsProject) return [] as T[];
        return [
          {
            id: PROJECT,
            name: 'Launch',
            description: null,
            instructions: 'owner-instructions',
            organization_id: null,
          },
        ] as unknown as T[];
      }
      return [] as T[];
    },
  };
  return { db, queries };
}

function projectScopedPolicies() {
  return contextSourceClassPolicies().filter((policy) => policy.scope === 'project');
}

describe('every project-scoped context class is produced by one engine', () => {
  it('names the project context service as the web producer of each one', () => {
    const policies = projectScopedPolicies();
    expect(policies.length).toBeGreaterThan(0);

    const strays = policies
      .flatMap((policy) =>
        policy.producedBy
          .filter((producer) => producer.surface === 'web')
          .map((producer) => ({ sourceClass: policy.sourceClass, producer })),
      )
      .filter(
        ({ producer }) =>
          producer.module !== PROJECT_CONTEXT_MODULE || producer.loader !== PROJECT_CONTEXT_LOADER,
      )
      .map(
        ({ sourceClass, producer }) =>
          `${sourceClass} is produced by ${producer.module}#${producer.loader}`,
      );

    expect(strays).toEqual([]);
  });

  it('leaves no project-scoped class without a producer, which would mean an unread boundary', () => {
    const orphans = projectScopedPolicies()
      .filter((policy) => !policy.producedBy.some((producer) => producer.surface === 'web'))
      .map((policy) => policy.sourceClass);

    expect(orphans).toEqual([]);
  });
});

describe('no project-scoped read happens before the project is authorized', () => {
  it('authorizes the project against the asking account first', async () => {
    const { db, queries } = recordingDb({ ownsProject: true });
    await loadProjectContext(db, {
      projectId: PROJECT,
      userId: OWNER,
      currentConversationId: CURRENT_CONVERSATION,
    });

    const first = queries[0];
    expect(first?.sql).toContain('from user_projects');
    expect(first?.sql).toContain('where id = $1 and user_id = $2');
    expect(first?.sql).toContain('is_archived = false');
    expect(first?.sql).toContain('deleted_at is null');
    expect(first?.params).toEqual([PROJECT, OWNER]);
  });

  it('issues no further statement when the project is not this account’s', async () => {
    const { db, queries } = recordingDb({ ownsProject: false });
    const context = await loadProjectContext(db, { projectId: PROJECT, userId: OWNER });

    expect(context).toBeNull();
    expect(queries).toHaveLength(1);
  });

  it('binds every statement it does run to the project it authorized', async () => {
    const { db, queries } = recordingDb({ ownsProject: true });
    await loadProjectContext(db, {
      projectId: PROJECT,
      userId: OWNER,
      currentConversationId: CURRENT_CONVERSATION,
      currentUserQuery: 'what is left to do',
    });

    expect(queries.length).toBeGreaterThan(1);
    const unbound = queries
      .filter((entry) => !entry.params.includes(PROJECT))
      .map((entry) => entry.sql.replace(/\s+/g, ' ').slice(0, 80));

    expect(unbound).toEqual([]);
  });

  it('keeps another account’s chats out of the project it authorized', async () => {
    const { db, queries } = recordingDb({ ownsProject: true });
    await loadProjectContext(db, { projectId: PROJECT, userId: OWNER });

    const siblings = queries.find((entry) => entry.sql.includes('from web_conversations'));
    expect(siblings?.sql).toContain('c.project_id = $1');
    expect(siblings?.sql).toContain('c.user_id = $2');
    expect(siblings?.params).toEqual([PROJECT, OWNER]);
  });
});
