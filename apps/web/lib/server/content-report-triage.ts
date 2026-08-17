import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';

export const CONTENT_REPORT_STATUSES = ['received', 'in_review', 'actioned', 'dismissed'] as const;

export type ContentReportStatus = (typeof CONTENT_REPORT_STATUSES)[number];

const OPEN_STATUSES: readonly ContentReportStatus[] = ['received', 'in_review'];

export function isContentReportStatus(value: unknown): value is ContentReportStatus {
  return (
    typeof value === 'string' && (CONTENT_REPORT_STATUSES as readonly string[]).includes(value)
  );
}

export const MAX_REVIEWER_NOTE_LENGTH = 2000;

export const CONTENT_REPORT_SLA_HOURS = 24;

const SLA_MS = CONTENT_REPORT_SLA_HOURS * 60 * 60 * 1000;

export function isResolvedStatus(status: ContentReportStatus): boolean {
  return !OPEN_STATUSES.includes(status);
}

export interface ContentReport {
  id: string;
  clientReportId: string;
  userId: string | null;
  messageId: string;
  conversationId: string;
  category: string;
  contentExcerpt: string;
  userNote: string;
  status: ContentReportStatus;
  reviewerId: string | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  dueAt: string;
  overdue: boolean;
}

interface ContentReportRow {
  id: string;
  client_report_id: string;
  user_id: string | null;
  message_id: string;
  conversation_id: string;
  category: string;
  content_excerpt: string;
  user_note: string;
  status: string;
  reviewer_id: string | null;
  reviewer_note: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toReport(row: ContentReportRow, now: number = Date.now()): ContentReport {
  const createdAt = toIso(row.created_at);
  const status = row.status as ContentReportStatus;
  const dueAt = new Date(new Date(createdAt).getTime() + SLA_MS).toISOString();
  return {
    id: row.id,
    clientReportId: row.client_report_id,
    userId: row.user_id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    category: row.category,
    contentExcerpt: row.content_excerpt,
    userNote: row.user_note,
    status,
    reviewerId: row.reviewer_id,
    reviewerNote: row.reviewer_note,
    reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : null,
    createdAt,
    dueAt,
    overdue: !isResolvedStatus(status) && now > new Date(dueAt).getTime(),
  };
}

const SELECTED_COLUMNS = `id, client_report_id, user_id, message_id, conversation_id, category,
          content_excerpt, user_note, status, reviewer_id, reviewer_note, reviewed_at, created_at`;

export interface ReadContentReportsOptions {
  readonly statuses?: readonly ContentReportStatus[];
  readonly limit?: number;
}

export async function readContentReportQueue(
  options: ReadContentReportsOptions = {},
): Promise<ContentReport[]> {
  const statuses = options.statuses?.length ? [...options.statuses] : [...OPEN_STATUSES];
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const oldestFirst = statuses.every((status) => OPEN_STATUSES.includes(status));

  const rows = await getNeonDb().query<ContentReportRow>(
    `select ${SELECTED_COLUMNS}
       from public.content_reports
      where status = any($1)
      order by created_at ${oldestFirst ? 'asc' : 'desc'}
      limit $2`,
    [statuses, limit],
  );
  const now = Date.now();
  return rows.map((row) => toReport(row, now));
}

export interface ContentReportQueueCounts {
  received: number;
  in_review: number;
  actioned: number;
  dismissed: number;
  oldestOpenAt: string | null;
  overdue: number;
  slaHours: number;
}

interface CountRow {
  status: string;
  report_count: string | number;
  oldest_at: Date | string | null;
  overdue_count: string | number;
}

export async function readContentReportCounts(): Promise<ContentReportQueueCounts> {
  const rows = await getNeonDb().query<CountRow>(
    `select status,
            count(*) as report_count,
            min(created_at) as oldest_at,
            count(*) filter (where created_at < now() - make_interval(hours => $1)) as overdue_count
       from public.content_reports
      group by status`,
    [CONTENT_REPORT_SLA_HOURS],
  );

  const counts: ContentReportQueueCounts = {
    received: 0,
    in_review: 0,
    actioned: 0,
    dismissed: 0,
    oldestOpenAt: null,
    overdue: 0,
    slaHours: CONTENT_REPORT_SLA_HOURS,
  };

  let oldestOpen: number | null = null;
  for (const row of rows) {
    if (!isContentReportStatus(row.status)) continue;
    counts[row.status] = Number(row.report_count) || 0;
    if (isResolvedStatus(row.status)) continue;
    counts.overdue += Number(row.overdue_count) || 0;
    if (row.oldest_at) {
      const at = new Date(toIso(row.oldest_at)).getTime();
      if (oldestOpen === null || at < oldestOpen) oldestOpen = at;
    }
  }
  if (oldestOpen !== null) counts.oldestOpenAt = new Date(oldestOpen).toISOString();

  return counts;
}

export interface ReviewContentReportInput {
  readonly reportId: string;
  readonly status: ContentReportStatus;
  readonly reviewerId: string;
  readonly reviewerNote: string;
}

export async function reviewContentReport(
  input: ReviewContentReportInput,
): Promise<ContentReport | null> {
  const note = input.reviewerNote.trim().slice(0, MAX_REVIEWER_NOTE_LENGTH);
  const resolved = input.status === 'actioned' || input.status === 'dismissed';

  const rows = await getNeonDb().query<ContentReportRow>(
    `update public.content_reports
        set status = $2,
            reviewer_id = $3,
            reviewer_note = $4,
            reviewed_at = case when $5 then now() else reviewed_at end,
            updated_at = now()
      where id = $1
      returning ${SELECTED_COLUMNS}`,
    [input.reportId, input.status, input.reviewerId, note, resolved],
  );

  const row = rows[0];
  return row ? toReport(row) : null;
}
