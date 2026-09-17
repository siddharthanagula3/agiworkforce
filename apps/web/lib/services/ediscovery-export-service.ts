import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { LegalHold } from './retention-service';

export const EDISCOVERY_PAGE_SIZE = 500;

export type EdiscoveryRecordType =
  | 'hold'
  | 'conversation'
  | 'message'
  | 'project'
  | 'project_file'
  | 'file'
  | 'artifact'
  | 'work_run';

export interface EdiscoveryRecord {
  type: EdiscoveryRecordType;
  data: Record<string, unknown>;
}

interface SourceDefinition {
  type: EdiscoveryRecordType;
  sql: string;
}

const SOURCES: readonly SourceDefinition[] = [
  {
    type: 'conversation',
    sql: `select c.id, c.user_id, c.title, c.model, c.project_id, c.created_at, c.updated_at,
                 c.deleted_at
            from public.web_conversations c
           where c.organization_id = $1
             and ($2::text is null or c.user_id = $2)
             and (c.created_at, c.id) > ($3::timestamptz, $4::uuid)
           order by c.created_at, c.id
           limit $5`,
  },
  {
    type: 'message',
    sql: `select m.id, m.conversation_id, c.user_id, m.role, m.content, m.model, m.provider,
                 m.created_at
            from public.web_messages m
            join public.web_conversations c on c.id = m.conversation_id
           where c.organization_id = $1
             and ($2::text is null or c.user_id = $2)
             and (m.created_at, m.id) > ($3::timestamptz, $4::uuid)
           order by m.created_at, m.id
           limit $5`,
  },
  {
    type: 'project',
    sql: `select p.id, p.user_id, p.name, p.description, p.instructions, p.is_archived,
                 p.created_at, p.updated_at
            from public.user_projects p
           where p.organization_id = $1
             and ($2::text is null or p.user_id = $2)
             and (p.created_at, p.id) > ($3::timestamptz, $4::uuid)
           order by p.created_at, p.id
           limit $5`,
  },
  {
    type: 'project_file',
    sql: `select k.id, k.project_id, p.user_id, k.file_name, k.mime_type, k.byte_count,
                 k.checksum_sha256, k.summary, k.storage_uri, k.added_by_user_id, k.created_at
            from public.project_knowledge_files k
            join public.user_projects p on p.id = k.project_id
           where p.organization_id = $1
             and ($2::text is null or p.user_id = $2)
             and (k.created_at, k.id) > ($3::timestamptz, $4::uuid)
           order by k.created_at, k.id
           limit $5`,
  },
  {
    type: 'file',
    sql: `select f.id, f.user_id, f.kind, f.mime_type, f.byte_size, f.storage_pathname, f.prompt,
                 f.provider, f.model, f.source_surface, f.created_at, f.deleted_at
            from public.media_assets f
           where f.organization_id = $1
             and ($2::text is null or f.user_id = $2)
             and (f.created_at, f.id) > ($3::timestamptz, $4::uuid)
           order by f.created_at, f.id
           limit $5`,
  },
  {
    type: 'artifact',
    sql: `select a.id, a.user_id, a.conversation_id, a.title, a.artifact_type, a.language,
                 a.content, a.current_version, a.created_at, a.updated_at, a.deleted_at
            from public.web_artifacts a
           where a.organization_id = $1
             and ($2::text is null or a.user_id = $2)
             and (a.created_at, a.id) > ($3::timestamptz, $4::uuid)
           order by a.created_at, a.id
           limit $5`,
  },
  {
    type: 'work_run',
    sql: `select r.id, r.user_id, r.conversation_id, r.origin_surface, r.work_mode, r.state,
                 r.provider, r.model, r.created_at, r.completed_at
            from public.cloud_agent_runs r
           where r.organization_id = $1
             and ($2::text is null or r.user_id = $2)
             and (r.created_at, r.id) > ($3::timestamptz, $4::uuid)
           order by r.created_at, r.id
           limit $5`,
  },
];

const START_CURSOR = { createdAt: '-infinity', id: '00000000-0000-0000-0000-000000000000' };

function toCursorValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function* iterateLegalHoldExport(
  db: DatabaseAdapter,
  hold: LegalHold,
): AsyncGenerator<EdiscoveryRecord[]> {
  yield [{ type: 'hold', data: { ...hold } }];
  const subject = hold.scope === 'member' ? hold.subjectUserId : null;

  for (const source of SOURCES) {
    let cursor = START_CURSOR;
    for (;;) {
      const rows = await db.query<Record<string, unknown>>(source.sql, [
        hold.organizationId,
        subject,
        cursor.createdAt,
        cursor.id,
        EDISCOVERY_PAGE_SIZE,
      ]);
      if (rows.length === 0) break;
      yield rows.map((data) => ({ type: source.type, data }));
      const last = rows[rows.length - 1] as Record<string, unknown>;
      cursor = { createdAt: toCursorValue(last['created_at']), id: String(last['id']) };
      if (rows.length < EDISCOVERY_PAGE_SIZE) break;
    }
  }
}

export async function readLegalHold(
  db: DatabaseAdapter,
  organizationId: string,
  holdId: string,
): Promise<LegalHold | null> {
  const [row] = await db.query<{
    id: string;
    organization_id: string;
    name: string;
    reason: string | null;
    scope: 'organization' | 'member';
    subject_user_id: string | null;
    created_by_user_id: string;
    released_at: string | Date | null;
    released_by_user_id: string | null;
    created_at: string | Date;
  }>(
    `select id, organization_id, name, reason, scope, subject_user_id, created_by_user_id,
            released_at, released_by_user_id, created_at
       from public.legal_holds
      where organization_id = $1 and id = $2
      limit 1`,
    [organizationId, holdId],
  );
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    reason: row.reason,
    scope: row.scope,
    subjectUserId: row.subject_user_id,
    createdByUserId: row.created_by_user_id,
    releasedAt: row.released_at === null ? null : toCursorValue(row.released_at),
    releasedByUserId: row.released_by_user_id,
    createdAt: toCursorValue(row.created_at),
  };
}
