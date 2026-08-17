import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export type CopyrightNoticeStatus = 'received' | 'actioned' | 'rejected' | 'counter_notified';

export interface CopyrightNoticeRecord {
  id: string;
  reference: string;
  reporterName: string;
  reporterEmail: string;
  reporterOrganization: string | null;
  targetKind: 'conversation-share' | 'published-artifact';
  targetToken: string;
  targetOwnerId: string | null;
  workDescription: string;
  statement: string;
  status: CopyrightNoticeStatus;
  dispositionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface RecordCopyrightNoticeInput {
  reference: string;
  reporterName: string;
  reporterEmail: string;
  reporterOrganization?: string | null;
  targetKind: 'conversation-share' | 'published-artifact';
  targetToken: string;
  targetOwnerId: string | null;
  workDescription: string;
  statement: string;
}

interface CopyrightNoticeRow {
  id: string;
  reference: string;
  reporter_name: string;
  reporter_email: string;
  reporter_organization: string | null;
  target_kind: 'conversation-share' | 'published-artifact';
  target_token: string;
  target_owner_id: string | null;
  work_description: string;
  statement: string;
  status: CopyrightNoticeStatus;
  disposition_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

function toRecord(row: CopyrightNoticeRow): CopyrightNoticeRecord {
  return {
    id: row.id,
    reference: row.reference,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    reporterOrganization: row.reporter_organization,
    targetKind: row.target_kind,
    targetToken: row.target_token,
    targetOwnerId: row.target_owner_id,
    workDescription: row.work_description,
    statement: row.statement,
    status: row.status,
    dispositionNote: row.disposition_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export async function recordCopyrightNotice(
  db: DatabaseAdapter,
  input: RecordCopyrightNoticeInput,
): Promise<CopyrightNoticeRecord> {
  const rows = (await db.query(
    `insert into public.copyright_notices (
       reference, reporter_name, reporter_email, reporter_organization,
       target_kind, target_token, target_owner_id,
       work_description, statement,
       affirms_good_faith, affirms_accuracy, affirms_authority
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, true)
     returning *`,
    [
      input.reference,
      input.reporterName,
      input.reporterEmail,
      input.reporterOrganization ?? null,
      input.targetKind,
      input.targetToken,
      input.targetOwnerId,
      input.workDescription,
      input.statement,
    ],
  )) as CopyrightNoticeRow[];

  const row = rows[0];
  if (!row) throw new Error('copyright notice insert returned no row');
  return toRecord(row);
}

export async function listCopyrightNotices(
  db: DatabaseAdapter,
  options: { status?: CopyrightNoticeStatus; limit?: number } = {},
): Promise<CopyrightNoticeRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const rows = options.status
    ? ((await db.query(
        `select * from public.copyright_notices where status = $1 order by created_at desc limit $2`,
        [options.status, limit],
      )) as CopyrightNoticeRow[])
    : ((await db.query(`select * from public.copyright_notices order by created_at desc limit $1`, [
        limit,
      ])) as CopyrightNoticeRow[]);
  return rows.map(toRecord);
}

export async function setCopyrightNoticeDisposition(
  db: DatabaseAdapter,
  reference: string,
  status: Exclude<CopyrightNoticeStatus, 'received'>,
  dispositionNote: string,
): Promise<CopyrightNoticeRecord | null> {
  const rows = (await db.query(
    `update public.copyright_notices
        set status = $2,
            disposition_note = $3,
            updated_at = now(),
            resolved_at = case when $2 = 'counter_notified' then null else now() end
      where reference = $1
      returning *`,
    [reference, status, dispositionNote],
  )) as CopyrightNoticeRow[];

  const row = rows[0];
  return row ? toRecord(row) : null;
}
