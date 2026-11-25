import { describe, expect, it } from 'vitest';

import { contextSourceClassPolicies } from '@agiworkforce/context';

import { loadProjectContext, type ProjectContextDb } from '../project-context-service';

const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'user-owner';
const ORGANIZATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
      organizationId: null,
      currentConversationId: CURRENT_CONVERSATION,
    });

    const first = queries[0];
    expect(first?.sql).toContain('from user_projects');
    expect(first?.sql).toContain('p.id = $1');
    expect(first?.sql).toContain('p.user_id = $2');
    expect(first?.sql).toContain('p.is_archived = false');
    expect(first?.sql).toContain('p.deleted_at is null');
    expect(first?.params).toEqual([PROJECT, OWNER, null]);
  });

  it('issues no further statement when the project is not this account’s', async () => {
    const { db, queries } = recordingDb({ ownsProject: false });
    const context = await loadProjectContext(db, {
      projectId: PROJECT,
      userId: OWNER,
      organizationId: null,
    });

    expect(context).toBeNull();
    expect(queries).toHaveLength(1);
  });

  it('binds every statement it does run to the project it authorized', async () => {
    const { db, queries } = recordingDb({ ownsProject: true });
    await loadProjectContext(db, {
      projectId: PROJECT,
      userId: OWNER,
      organizationId: null,
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
    await loadProjectContext(db, { projectId: PROJECT, userId: OWNER, organizationId: null });

    const siblings = queries.find((entry) => entry.sql.includes('from web_conversations'));
    expect(siblings?.sql).toContain('c.project_id = $1');
    expect(siblings?.sql).toContain('c.user_id = $2');
    expect(siblings?.params).toEqual([PROJECT, OWNER]);
  });

  it('admits an owner whose project sits in another workspace than the chat', async () => {
    const { db, queries } = recordingDb({ ownsProject: true });
    const context = await loadProjectContext(db, {
      projectId: PROJECT,
      userId: OWNER,
      organizationId: ORGANIZATION,
    });
    expect(context).not.toBeNull();
    const sql = String(queries[0]?.sql).replace(/\s+/g, ' ');
    expect(sql).toContain('p.user_id = $2 or');
    expect(sql).not.toContain('p.organization_id is not distinct from');
    expect(queries[0]?.params).toEqual([PROJECT, OWNER, ORGANIZATION]);
  });

  it('admits a member through a share bound to the active workspace only', async () => {
    const { db, queries } = recordingDb({ ownsProject: true });
    await loadProjectContext(db, {
      projectId: PROJECT,
      userId: 'user-member',
      organizationId: ORGANIZATION,
    });
    const sql = String(queries[0]?.sql).replace(/\s+/g, ' ');
    expect(sql).toContain('from public.organization_shared_projects s');
    expect(sql).toContain('s.organization_id = $3::uuid');
    expect(sql).toContain("m.user_id = $2 and m.status = 'active'");
    expect(sql).toContain("coalesce(a.access, s.default_access) in ('read', 'write')");
    expect(queries[0]?.params).toEqual([PROJECT, 'user-member', ORGANIZATION]);
  });

  it('returns nothing for a member outside any share or in another workspace', async () => {
    const { db, queries } = recordingDb({ ownsProject: false });
    const context = await loadProjectContext(db, {
      projectId: PROJECT,
      userId: 'user-member',
      organizationId: null,
    });
    expect(context).toBeNull();
    expect(queries).toHaveLength(1);
  });
});
