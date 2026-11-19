type OriginalProjectKnowledgeObjectStorageModule =
  typeof import('@/lib/server/project-knowledge-object-storage');
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockDeleteStoredMediaObjects, mockDeleteKnowledgeObject } = vi.hoisted(() => ({
  mockDeleteStoredMediaObjects: vi.fn(),
  mockDeleteKnowledgeObject: vi.fn(async (_key: string) => undefined),
}));

vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: mockDeleteStoredMediaObjects,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalProjectKnowledgeObjectStorageModule>()),
  deleteProjectKnowledgeObject: mockDeleteKnowledgeObject,
}));
import { RETENTION_DAYS_MIN, RETENTION_DOMAINS, type RetentionDomain } from '@agiworkforce/types';
import {
  DOMAIN_RETENTION_BATCH,
  createDomainSweepers,
  sweepOrganizationDomain,
} from '../domain-retention-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-17T00:00:00.000Z');

type Handler = (sql: string, params: unknown[]) => unknown[] | Promise<unknown[]>;

function fakeDb(handler: Handler) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const adapter = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return handler(sql, params);
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      await handler(sql, params);
      return 1;
    }),
    transaction: vi.fn(async (work: (tx: typeof adapter) => unknown) => work(adapter)),
  };
  return {
    calls,
    db: adapter as never,
  };
}

function hold(scope: 'organization' | 'member', subjectUserId: string | null = null) {
  return {
    id: 'hold-1',
    organizationId: ORG,
    name: 'Matter 7',
    reason: null,
    scope,
    subjectUserId,
    createdByUserId: 'admin',
    releasedAt: null,
    releasedByUserId: null,
    createdAt: NOW.toISOString(),
    custodianUserIds: [],
    resourceTypes: null,
  };
}

function sweepInsert(calls: Array<{ sql: string; params: unknown[] }>) {
  return calls.find((call) =>
    /insert into public\.organization_domain_retention_sweeps/.test(call.sql),
  );
}

beforeEach(() => {
  mockDeleteStoredMediaObjects.mockReset();
  mockDeleteKnowledgeObject.mockReset();
  mockDeleteKnowledgeObject.mockResolvedValue(undefined);
});

describe('per-domain retention sweep', () => {
  it('defines a sweeper for every retention domain', () => {
    expect(Object.keys(createDomainSweepers()).sort()).toEqual([...RETENTION_DOMAINS].sort());
  });

  it('deletes stored files before their records and records the sweep', async () => {
    mockDeleteStoredMediaObjects.mockResolvedValue({ deleted: 2, failedPathnames: [] });
    const { db, calls } = fakeDb((sql) => {
      if (/select id,\s+case when storage_pathname/.test(sql)) {
        return [
          { id: 'm1', object_keys: ['media/a.png'] },
          { id: 'm2', object_keys: ['media/b.png'] },
        ];
      }
      if (/delete from public\.media_assets/.test(sql)) return [{ id: 'm1' }, { id: 'm2' }];
      if (/count\(\*\)/.test(sql)) return [{ count: 0 }];
      return [];
    });

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'files', retentionDays: 30 },
      { now: NOW, readHolds: async () => [] },
    );

    expect(mockDeleteStoredMediaObjects).toHaveBeenCalledWith(['media/a.png', 'media/b.png']);
    expect(result).toMatchObject({
      outcome: 'deleted',
      recordsDeleted: 2,
      objectsDeleted: 2,
      cutoff: '2026-08-18T00:00:00.000Z',
    });
    const insert = sweepInsert(calls);
    expect(insert?.params.slice(0, 6)).toEqual([ORG, 'files', 30, result.cutoff, 'deleted', 2]);
  });

  it('keeps a record whose stored object could not be deleted, so the next run retries it', async () => {
    mockDeleteStoredMediaObjects.mockResolvedValue({
      deleted: 1,
      failedPathnames: ['media/b.png'],
    });
    const deletions: unknown[] = [];
    const { db } = fakeDb((sql, params) => {
      if (/select id,\s+case when storage_pathname/.test(sql)) {
        return [
          { id: 'm1', object_keys: ['media/a.png'] },
          { id: 'm2', object_keys: ['media/b.png'] },
        ];
      }
      if (/delete from public\.media_assets/.test(sql)) {
        deletions.push(params[0]);
        return [{ id: 'm1' }];
      }
      if (/count\(\*\)/.test(sql)) return [{ count: 0 }];
      return [];
    });

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'files', retentionDays: 30 },
      { now: NOW, readHolds: async () => [] },
    );

    expect(deletions).toEqual([['m1']]);
    expect(result.objectsFailed).toBe(1);
    expect(result.error).toMatch(/could not be deleted/);
  });

  it('retires project references before deleting records without performing object I/O', async () => {
    const { db, calls } = fakeDb((sql) => {
      if (/select p.id, p.user_id/.test(sql)) return [{ id: 'p1', user_id: 'user-a' }];
      if (/update user_projects p/.test(sql)) return [{ id: 'p1' }];
      if (/delete from public\.user_projects/.test(sql)) return [{ id: 'p1' }];
      if (/count\(\*\)/.test(sql)) return [{ count: 0 }];
      return [];
    });

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'projects', retentionDays: 90 },
      { now: NOW, readHolds: async () => [] },
    );

    expect(mockDeleteKnowledgeObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ recordsDeleted: 1, objectsDeleted: 0, objectsFailed: 0 });
    const selection = calls.find((call) => /select p.id, p.user_id/.test(call.sql));
    expect(selection?.sql).toContain('for update of p skip locked');
    expect(selection?.params).toEqual([
      ORG,
      result.cutoff,
      'project',
      'project_file',
      DOMAIN_RETENTION_BATCH,
    ]);
    const release = calls.findIndex((call) => /update project_knowledge_files/.test(call.sql));
    const deletion = calls.findIndex((call) => /delete from public\.user_projects/.test(call.sql));
    expect(release).toBeGreaterThanOrEqual(0);
    expect(deletion).toBeGreaterThan(release);
    expect(calls[deletion]?.params).toEqual(['p1', 'user-a', ORG, 'project', 'project_file']);
  });

  it('does not report a deletion when project retirement fails', async () => {
    const { db } = fakeDb((sql) => {
      if (/select p.id, p.user_id/.test(sql)) return [{ id: 'p1', user_id: 'user-a' }];
      if (/update user_projects p/.test(sql)) throw new Error('source release rejected');
      return [];
    });
    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'projects', retentionDays: 90 },
      { now: NOW, readHolds: async () => [] },
    );
    expect(result).toMatchObject({
      outcome: 'failed',
      recordsDeleted: 0,
      objectsDeleted: 0,
      error: 'source release rejected',
    });
    expect(mockDeleteKnowledgeObject).not.toHaveBeenCalled();
  });

  it('counts project-file holds without suspending projects that have no sources', async () => {
    const { db, calls } = fakeDb((sql) => (/count\(\*\)/.test(sql) ? [{ count: 1 }] : []));
    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'projects', retentionDays: 90 },
      {
        now: NOW,
        readHolds: async () => [{ ...hold('organization'), resourceTypes: ['project_file'] }],
      },
    );
    expect(result).toMatchObject({ outcome: 'nothing_due', recordsHeld: 1, activeHolds: 1 });
    const selection = calls.find((call) => /select p.id, p.user_id/.test(call.sql));
    expect(selection?.sql).toContain('exists');
    expect(selection?.params).toContain('project_file');
  });

  it('retires only the swept project sources, leaving duplicated references to the ledger', async () => {
    const { db, calls } = fakeDb((sql) => {
      if (/select p.id, p.user_id/.test(sql)) return [{ id: 'p1', user_id: 'user-a' }];
      if (/update user_projects p/.test(sql)) return [{ id: 'p1' }];
      if (/delete from public\.user_projects/.test(sql)) return [{ id: 'p1' }];
      return [];
    });
    const result = await createDomainSweepers().projects.sweepBatch(db, {
      organizationId: ORG,
      cutoff: NOW.toISOString(),
      resourceType: 'project',
      limit: 1,
    });

    expect(result).toMatchObject({ recordsDeleted: 1, objectsDeleted: 0 });
    expect(mockDeleteKnowledgeObject).not.toHaveBeenCalled();
    const release = calls.find((call) => /update project_knowledge_files/.test(call.sql));
    expect(release?.sql).toContain('k.project_id=$1::uuid');
    expect(release?.params[0]).toBe('p1');
  });

  it('keeps a project whose knowledge file a project_file-only hold preserves, before any byte is deleted', async () => {
    const { db, calls } = fakeDb(() => []);
    await createDomainSweepers().projects.sweepBatch(db, {
      organizationId: ORG,
      cutoff: NOW.toISOString(),
      resourceType: 'project',
      limit: 1,
    });

    const selection = calls.find((call) => /select p.id, p.user_id/.test(call.sql));
    expect(selection?.sql).toMatch(
      /not \(public\.app_project_content_held\(p\.id, \$3\) or \(exists \(\s*select 1 from public\.project_knowledge_files k where k\.project_id=p\.id\s*\) and public\.app_project_content_held\(p\.id, \$4\)\)\)/,
    );
    expect(selection?.params.slice(2, 4)).toEqual(['project', 'project_file']);
  });

  it('carries the project_file hold into the parent delete and the held count', async () => {
    const { db, calls } = fakeDb((sql) => {
      if (/select p.id, p.user_id/.test(sql)) return [{ id: 'p1', user_id: 'user-a' }];
      if (/update user_projects p/.test(sql)) return [{ id: 'p1' }];
      if (/delete from public\.user_projects/.test(sql)) return [{ id: 'p1' }];
      return /count\(\*\)/.test(sql) ? [{ count: 0 }] : [];
    });
    const sweeper = createDomainSweepers().projects;
    const context = {
      organizationId: ORG,
      cutoff: NOW.toISOString(),
      resourceType: 'project' as const,
      limit: 1,
    };
    await sweeper.countHeld(db, context);
    await sweeper.sweepBatch(db, context);

    const held = calls.find((call) => /select count\(\*\)::int as count/.test(call.sql));
    const deletion = calls.find((call) => /delete from public\.user_projects/.test(call.sql));
    expect(held?.sql).toMatch(/public\.app_project_content_held\(p\.id, \$4\)/);
    expect(held?.params).toEqual([ORG, NOW.toISOString(), 'project', 'project_file']);
    expect(deletion?.sql).toMatch(
      /and not \(public\.app_project_content_held\(p\.id, \$4\) or \(exists[\s\S]*public\.app_project_content_held\(p\.id, \$5\)\)\)/,
    );
    expect(deletion?.params).toEqual(['p1', 'user-a', ORG, 'project', 'project_file']);
  });

  it('deletes nothing while an organization-wide legal hold is active', async () => {
    const { db, calls } = fakeDb(() => []);

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'notifications', retentionDays: 7 },
      { now: NOW, readHolds: async () => [hold('organization')] },
    );

    expect(result.outcome).toBe('held');
    expect(calls.some((call) => /^\s*delete/i.test(call.sql))).toBe(false);
    expect(sweepInsert(calls)?.params[4]).toBe('held');
  });

  it('leaves the hold to the statement and reports what it withheld', async () => {
    const { db, calls } = fakeDb((sql) => {
      if (/count\(\*\)/.test(sql)) return [{ count: 3 }];
      if (/delete from public\.notifications/.test(sql)) return [{ id: 'n1' }];
      return [];
    });

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'notifications', retentionDays: 7 },
      { now: NOW, readHolds: async () => [hold('member', 'held-user')] },
    );

    const deletion = calls.find((call) => /delete from public\.notifications/.test(call.sql));
    expect(deletion?.sql).toMatch(
      /not public\.legal_hold_preserves\(\$1::uuid, t\.user_id::text, \$3::text\)/,
    );
    expect(deletion?.sql).toMatch(/target_kind = 'chat'/);
    // A store no hold vocabulary names, so any hold over the person suspends it.
    expect(deletion?.params[2]).toBeNull();
    expect(result).toMatchObject({ outcome: 'deleted', recordsDeleted: 1, recordsHeld: 3 });
  });

  it('fails closed when the holds cannot be read', async () => {
    const { db, calls } = fakeDb(() => []);

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'work', retentionDays: 30 },
      {
        now: NOW,
        readHolds: async () => {
          throw new Error('connection reset');
        },
      },
    );

    expect(result.outcome).toBe('aborted');
    expect(calls.some((call) => /^\s*delete/i.test(call.sql))).toBe(false);
  });

  it('only removes finished Work runs and ended Code sessions', () => {
    const sweepers = createDomainSweepers();
    const statements = (domain: RetentionDomain) => {
      const { db, calls } = fakeDb(() => []);
      return sweepers[domain]
        .sweepBatch(db, {
          organizationId: ORG,
          cutoff: NOW.toISOString(),
          resourceType: null,
          limit: 1,
        })
        .then(() => calls.map((call) => call.sql).join('\n'));
    };
    return Promise.all([statements('work'), statements('code_sessions')]).then(([work, code]) => {
      expect(work).toMatch(/state in \('completed', 'failed', 'cancelled', 'archived'\)/);
      expect(code).toMatch(/state in \('failed', 'closed'\)/);
    });
  });

  it('sweeps only research reports whose conversation belongs to the workspace, never a legal hold', async () => {
    const { db, calls } = fakeDb(() => []);
    await createDomainSweepers().research.sweepBatch(db, {
      organizationId: ORG,
      cutoff: NOW.toISOString(),
      resourceType: 'conversation',
      limit: 1,
    });

    const sql = calls.map((call) => call.sql).join('\n');
    expect(sql).toMatch(/delete from public\.research_reports/);
    expect(sql).toMatch(
      /from public\.web_conversations c\s+where c\.id = t\.conversation_id\s+and c\.user_id = t\.user_id\s+and c\.organization_id = \$1/,
    );
    expect(sql).not.toMatch(/organization_members/);
    expect(sql).toMatch(
      /not public\.legal_hold_preserves\(\$1::uuid, t\.user_id::text, \$3::text\)/,
    );
  });

  it('sweeps only notifications that point at a resource of the workspace', async () => {
    const { db, calls } = fakeDb(() => []);
    await createDomainSweepers().notifications.sweepBatch(db, {
      organizationId: ORG,
      cutoff: NOW.toISOString(),
      resourceType: null,
      limit: 1,
    });

    const sql = calls.map((call) => call.sql).join('\n');
    expect(sql).toMatch(/delete from public\.notifications/);
    expect(sql).not.toMatch(/organization_members/);
    for (const [kind, table] of [
      ['chat', 'web_conversations'],
      ['work', 'cloud_agent_runs'],
      ['code-session', 'cloud_code_sessions'],
      ['research', 'research_reports'],
    ]) {
      expect(sql).toMatch(new RegExp(`target_kind = '${kind}' and exists`));
      expect(sql).toMatch(new RegExp(`public\\.${table} `));
    }
    expect(sql).not.toMatch(/target_kind = '(settings|schedule)'/);
    expect(sql.match(/organization_id = \$1/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('stops after a short batch instead of looping to the ceiling', async () => {
    let batches = 0;
    const { db } = fakeDb((sql) => {
      if (/delete from public\.device_pairings/.test(sql)) {
        batches++;
        return batches === 1
          ? Array.from({ length: DOMAIN_RETENTION_BATCH }, (_, i) => ({ id: `d${i}` }))
          : [{ id: 'last' }];
      }
      if (/count\(\*\)/.test(sql)) return [{ count: 0 }];
      return [];
    });

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'remote_sessions', retentionDays: 30 },
      { now: NOW, readHolds: async () => [] },
    );

    expect(batches).toBe(2);
    expect(result.recordsDeleted).toBe(DOMAIN_RETENTION_BATCH + 1);
  });
});

function codeSessionDb(options: {
  codeRetentionDays?: number | null;
  policyReadFails?: boolean;
  sessions?: Array<{ id: string; ageDays: number }>;
  heldIds?: readonly string[];
}) {
  const sessions = options.sessions ?? [];
  const heldIds = new Set(options.heldIds ?? []);
  return fakeDb((sql, params) => {
    if (/from public\.organization_admin_policies/.test(sql)) {
      if (options.policyReadFails) throw new Error('connection reset');
      return [
        {
          organization_id: ORG,
          default_privacy_mode: 'byok',
          allowed_privacy_modes: ['byok'],
          allow_managed_compute: true,
          chat_sync_surfaces: [],
          audit_export_enabled: true,
          retention_days: 365,
          metadata:
            options.codeRetentionDays === undefined
              ? {}
              : { codeControls: { sessionRetentionDays: options.codeRetentionDays } },
          updated_at: NOW.toISOString(),
        },
      ];
    }
    if (/count\(\*\)/.test(sql)) {
      return [{ count: sessions.filter((s) => heldIds.has(s.id)).length }];
    }
    if (/delete from public\.cloud_code_sessions/.test(sql)) {
      const cutoff = Date.parse(String(params[1]));
      return sessions
        .filter((s) => !heldIds.has(s.id))
        .filter((s) => NOW.getTime() - s.ageDays * 86_400_000 < cutoff)
        .map((s) => ({ id: s.id }));
    }
    return [];
  });
}

async function sweepCodeSessions(
  db: never,
  domainRetentionDays = 90,
): Promise<Awaited<ReturnType<typeof sweepOrganizationDomain>>> {
  return sweepOrganizationDomain(
    db,
    { organizationId: ORG, domain: 'code_sessions', retentionDays: domainRetentionDays },
    { now: NOW, readHolds: async () => [] },
  );
}

describe('the Code session window a workspace administrator set', () => {
  it('sweeps sessions older than the shorter workspace window and keeps the newer ones', async () => {
    const { db } = codeSessionDb({
      codeRetentionDays: 7,
      sessions: [
        { id: 'old', ageDays: 30 },
        { id: 'fresh', ageDays: 3 },
      ],
    });

    const result = await sweepCodeSessions(db);

    expect(result.retentionDays).toBe(7);
    expect(result.retentionSource).toBe('workspace_code_control');
    expect(result.recordsDeleted).toBe(1);
  });

  it('leaves a workspace that set no Code window on the domain window', async () => {
    const { db } = codeSessionDb({ sessions: [{ id: 'old', ageDays: 30 }] });

    const result = await sweepCodeSessions(db);

    expect(result.retentionDays).toBe(90);
    expect(result.retentionSource).toBe('domain_policy');
    expect(result.recordsDeleted).toBe(0);
  });

  it('treats zero and a longer value as no opinion, never as a shorter window', async () => {
    for (const value of [0, null, 365]) {
      const { db } = codeSessionDb({ codeRetentionDays: value });
      const result = await sweepCodeSessions(db);
      expect(result.retentionDays).toBe(90);
      expect(result.retentionSource).toBe('domain_policy');
    }
  });

  it('keeps the longer domain window when the workspace policy cannot be read', async () => {
    const { db } = codeSessionDb({
      policyReadFails: true,
      sessions: [{ id: 'old', ageDays: 30 }],
    });

    const result = await sweepCodeSessions(db);

    expect(result.retentionDays).toBe(90);
    expect(result.retentionSource).toBe('domain_policy_after_unreadable_workspace_policy');
    expect(result.recordsDeleted).toBe(0);
  });

  it('never goes below the configured minimum, whatever the workspace typed', async () => {
    const { db } = codeSessionDb({ codeRetentionDays: -5 });
    expect((await sweepCodeSessions(db)).retentionDays).toBe(90);

    const { db: tiny } = codeSessionDb({ codeRetentionDays: 1 });
    const result = await sweepCodeSessions(tiny);
    expect(result.retentionDays).toBeGreaterThanOrEqual(RETENTION_DAYS_MIN);
  });

  it('withholds a held session under the shorter window as under any other', async () => {
    const { db } = codeSessionDb({
      codeRetentionDays: 7,
      sessions: [
        { id: 'held', ageDays: 30 },
        { id: 'sweepable', ageDays: 30 },
      ],
      heldIds: ['held'],
    });

    const result = await sweepCodeSessions(db);

    expect(result.recordsHeld).toBe(1);
    expect(result.recordsDeleted).toBe(1);
  });

  it('asks nothing of the workspace policy for any other domain', async () => {
    const { db, calls } = codeSessionDb({ codeRetentionDays: 7 });

    await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'files', retentionDays: 90 },
      { now: NOW, readHolds: async () => [] },
    );

    expect(calls.some((c) => /organization_admin_policies/.test(c.sql))).toBe(false);
  });
});
