import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import {
  LOADABLE_PROJECT_SCOPE_SQL,
  READABLE_PROJECT_SCOPE_SQL,
  readableProjectAccessSql,
  selectChatProject,
  selectReadableProject,
  syncableProjectAccessSql,
} from './project-read-access';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const query = vi.fn();
const db = { query } as unknown as DatabaseAdapter;
const sql = READABLE_PROJECT_SCOPE_SQL.replace(/\s+/g, ' ');

beforeEach(() => {
  query.mockReset();
});

describe('project read statement contract', () => {
  it.each([null, ORG])('binds the exact owner workspace %s', async (organizationId) => {
    query.mockResolvedValue([{ id: PROJECT }]);
    await expect(
      selectReadableProject(db, { userId: 'reader', organizationId }, PROJECT),
    ).resolves.toEqual({ id: PROJECT });
    expect(query).toHaveBeenCalledWith(expect.stringContaining(READABLE_PROJECT_SCOPE_SQL), [
      PROJECT,
      'reader',
      organizationId,
    ]);
    expect(sql).toContain('(p.user_id = $2 and p.organization_id is not distinct from $3::uuid)');
  });

  it('requires a live matching project and keeps Personal owner-only', () => {
    expect(sql).toContain('p.id = $1 and p.deleted_at is null');
    expect(sql).toContain('or ( $3::uuid is not null and');
  });

  it('allows an admitted-org share of an org or Personal-root project, never another org', () => {
    expect(sql).toContain('(p.organization_id is null or p.organization_id = $3::uuid)');
    expect(sql).toContain('s.project_id = p.id and s.organization_id = $3::uuid');
  });

  it('requires current active membership, a current share, and content read permission', () => {
    expect(sql).toContain('from public.organization_shared_projects s');
    expect(sql).toContain(
      "join public.organization_members m on m.organization_id = s.organization_id and m.user_id = $2 and m.status = 'active'",
    );
    expect(sql).toContain('public.app_org_resource_is_readable(s.organization_id)');
  });

  it('honors explicit read/write over a private default and none over a public default', () => {
    expect(sql).toContain(
      'left join public.organization_project_access a on a.organization_id = s.organization_id and a.project_id = s.project_id and a.user_id = $2',
    );
    expect(sql).toContain("coalesce(a.access, s.default_access) in ('read', 'write')");
  });

  it('returns no project when the current statement finds no permitted row', async () => {
    query.mockResolvedValue([]);
    await expect(
      selectReadableProject(db, { userId: 'reader', organizationId: ORG }, PROJECT),
    ).resolves.toBeUndefined();
  });

  it('propagates database failures instead of widening the lookup', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(
      selectReadableProject(db, { userId: 'reader', organizationId: ORG }, PROJECT),
    ).rejects.toThrow('database unavailable');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('binds byte and text source lookup in the final storage-uri statement', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'project-knowledge-files.ts'),
      'utf8',
    );
    const lookup = source.slice(
      source.indexOf('export async function findReadableProjectKnowledgeFile('),
      source.indexOf('export function projectKnowledgeResponse('),
    );
    expect(lookup).toContain('join user_projects p on p.id = f.project_id');
    expect(lookup).toContain('where ${READABLE_PROJECT_SCOPE_SQL}');
    expect(lookup).toContain('and f.id = $4');
    expect(lookup).toContain('and f.deleted_at is null');
    expect(lookup).toContain('[projectId, scope.userId, scope.organizationId, fileId]');
    expect(lookup).not.toContain('superseded_at');
    expect(lookup).not.toContain('is_archived');
  });
});

describe('chat project access', () => {
  it('binds the caller and workspace placeholders it is given', () => {
    const custom = readableProjectAccessSql('$1', '$3').replace(/\s+/g, ' ');
    expect(custom).toContain(
      '(p.user_id = $1 and p.organization_id is not distinct from $3::uuid)',
    );
    expect(custom).toContain("m.user_id = $1 and m.status = 'active'");
    expect(custom).not.toContain('$2');
    expect(READABLE_PROJECT_SCOPE_SQL).toBe(
      `p.id = $1\n        and ${readableProjectAccessSql('$2', '$3')}`,
    );
  });

  it('lets the loader owner branch ignore the workspace while the share stays bound to it', () => {
    const loadable = LOADABLE_PROJECT_SCOPE_SQL.replace(/\s+/g, ' ');
    expect(loadable).toContain('p.user_id = $2 or');
    expect(loadable).not.toContain('p.organization_id is not distinct from');
    expect(loadable).toContain('s.organization_id = $3::uuid');
  });

  it('keeps an archived project closed to new chats', async () => {
    query.mockResolvedValue([]);
    await selectChatProject(db, { userId: 'member', organizationId: ORG }, PROJECT);
    const [statement, params] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain(READABLE_PROJECT_SCOPE_SQL);
    expect(statement).toContain('p.is_archived = false');
    expect(params).toEqual([PROJECT, 'member', ORG]);
  });
});

describe('sync project access', () => {
  const sync = syncableProjectAccessSql('$1', '$3').replace(/\s+/g, ' ');

  it('keeps the owner branch free of the soft-delete filter so an old chat still syncs', () => {
    expect(
      sync.startsWith(
        '( (p.user_id = $1 and p.organization_id is not distinct from $3::uuid) or (',
      ),
    ).toBe(true);
    expect(sync).not.toMatch(/^\( p\.deleted_at/);
    expect(sync.match(/p\.deleted_at is null/g)).toHaveLength(1);
  });

  it('requires a live project for the shared branch only', () => {
    const shared = sync.slice(sync.indexOf(' or ('));
    expect(shared).toContain('p.deleted_at is null and (');
    expect(shared).toContain('organization_shared_projects');
  });
});
