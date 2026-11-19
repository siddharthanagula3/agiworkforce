import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export type CopyrightNoticeStatus = 'received' | 'actioned' | 'rejected' | 'counter_notified';

export const CONTENT_NOTICE_TYPES = ['copyright', 'trademark', 'impersonation'] as const;

export type ContentNoticeType = (typeof CONTENT_NOTICE_TYPES)[number];

export interface CopyrightNoticeRecord {
  id: string;
  reference: string;
  noticeType: ContentNoticeType;
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
  noticeType: ContentNoticeType;
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
  notice_type: ContentNoticeType;
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
    noticeType: row.notice_type,
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
       reference, notice_type, reporter_name, reporter_email, reporter_organization,
       target_kind, target_token, target_owner_id,
       work_description, statement,
       affirms_good_faith, affirms_accuracy, affirms_authority
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true, true)
     returning *`,
    [
      input.reference,
      input.noticeType,
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

export type CopyrightNoticeFilter = CopyrightNoticeStatus | 'decided';

export interface CopyrightNoticeCursor {
  at: string;
  id: string;
}

export interface CopyrightNoticePage {
  notices: CopyrightNoticeRecord[];
  nextCursor: string | null;
}

const CURSOR_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseCopyrightNoticeCursor(raw: string): CopyrightNoticeCursor | null {
  const match = CURSOR_PATTERN.exec(raw);
  if (!match?.[1] || !match[2] || Number.isNaN(Date.parse(match[1]))) return null;
  return { at: match[1], id: match[2].toLowerCase() };
}

interface CopyrightNoticePageRow extends CopyrightNoticeRow {
  page_at: string | Date;
}

export async function listCopyrightNotices(
  db: DatabaseAdapter,
  options: { filter?: CopyrightNoticeFilter; limit?: number; before?: CopyrightNoticeCursor } = {},
): Promise<CopyrightNoticePage> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const filter = options.filter ?? null;
  const pageAt =
    filter === 'decided'
      ? `date_trunc('milliseconds', updated_at)`
      : `date_trunc('milliseconds', created_at)`;
  const rows = (await db.query(
    `select *, ${pageAt} as page_at
       from public.copyright_notices
      where ($1::text is null
             or ($1 = 'decided' and status <> 'received')
             or status = $1)
        and ($2::timestamptz is null or (${pageAt}, id) < ($2::timestamptz, $3::uuid))
      order by ${pageAt} desc, id desc
      limit $4`,
    [filter, options.before?.at ?? null, options.before?.id ?? null, limit + 1],
  )) as CopyrightNoticePageRow[];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > limit && last ? `${new Date(last.page_at).toISOString()}|${last.id}` : null;
  return { notices: page.map(toRecord), nextCursor };
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
