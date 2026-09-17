import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockDeleteStoredMediaObjects, mockDeleteKnowledgeObject } = vi.hoisted(() => ({
  mockDeleteStoredMediaObjects: vi.fn(),
  mockDeleteKnowledgeObject: vi.fn(async (_key: string) => undefined),
}));

vi.mock('@/lib/server/media-storage', () => ({
  deleteStoredMediaObjects: mockDeleteStoredMediaObjects,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: mockDeleteKnowledgeObject,
}));
vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/object-storage')>()),
  objectKeyFromStorageUri: (uri: string) => (uri.startsWith('s3://') ? uri.slice(5) : null),
}));

import { RETENTION_DOMAINS, type RetentionDomain } from '@agiworkforce/types';
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
  return {
    calls,
    db: {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return handler(sql, params);
      }),
      execute: vi.fn(),
      transaction: vi.fn(),
    } as never,
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

  it('deletes project knowledge objects by their storage key', async () => {
    const { db } = fakeDb((sql) => {
      if (/from public\.user_projects p/.test(sql)) {
        return [{ id: 'p1', object_keys: ['s3://knowledge/p1/doc.pdf'] }];
      }
      if (/delete from public\.user_projects/.test(sql)) return [{ id: 'p1' }];
      if (/count\(\*\)/.test(sql)) return [{ count: 0 }];
      return [];
    });

    const result = await sweepOrganizationDomain(
      db,
      { organizationId: ORG, domain: 'projects', retentionDays: 90 },
      { now: NOW, readHolds: async () => [] },
    );

    expect(mockDeleteKnowledgeObject).toHaveBeenCalledWith('knowledge/p1/doc.pdf');
    expect(result.recordsDeleted).toBe(1);
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

  it('exempts a member under hold and reports what was withheld', async () => {
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
    expect(deletion?.sql).toMatch(/not \(t\.user_id = any\(\$3::text\[\]\)\)/);
    expect(deletion?.sql).toMatch(/organization_members/);
    expect(deletion?.params[2]).toEqual(['held-user']);
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
          heldUserIds: [],
          limit: 1,
        })
        .then(() => calls.map((call) => call.sql).join('\n'));
    };
    return Promise.all([statements('work'), statements('code_sessions')]).then(([work, code]) => {
      expect(work).toMatch(/state in \('completed', 'failed', 'cancelled', 'archived'\)/);
      expect(code).toMatch(/state in \('failed', 'closed'\)/);
    });
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
