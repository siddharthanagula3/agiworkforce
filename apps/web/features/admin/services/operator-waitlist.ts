import 'server-only';

import type {
  OperatorPublicWaitlistEntry,
  OperatorUpgradeWaitlistEntry,
  OperatorWaitlistConsent,
  OperatorWaitlistCount,
} from '@agiworkforce/cloud-contracts/waitlist';
import { z } from 'zod';

import {
  WAITLIST_SOURCES,
  consentPurposesForWaitlistSource,
  isWaitlistSource,
} from '@/lib/consent-purposes';
import { toCsv } from '@/lib/csv';
import {
  buildPage,
  decodeKeysetCursor,
  keysetSql,
  type KeysetCursor,
} from '@/lib/identity/pagination';
import { emailPseudonymCandidates } from '@/lib/server/email-pseudonym';
import { getNeonDb } from '@/lib/server/neon-db';

export const WAITLIST_EXPORT_ROW_LIMIT = 10_000;
const EXPORT_BATCH_SIZE = 1_000;

const PAGE_SORT_COLUMN = 'page_sort_key';
const PAGE_SORT_KEY_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

export const WaitlistCursorSchema = z.object({
  sortValue: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  id: z.string().uuid(),
});

const EVERY_WAITLIST_SOURCE_PURPOSE_IDS: readonly string[] = [
  ...new Set(
    WAITLIST_SOURCES.flatMap((source) =>
      consentPurposesForWaitlistSource(source).map((purpose) => purpose.id),
    ),
  ),
];

const CONSENT_GRANTED_CELL = 'granted';
const CONSENT_NOT_GRANTED_CELL = 'not granted';
const PUBLIC_WAITLIST_CSV_HEADER = [
  'email',
  'source',
  'joined_at',
  ...EVERY_WAITLIST_SOURCE_PURPOSE_IDS,
];

export interface WaitlistPageRequest {
  limit: number;
  cursor: KeysetCursor | null;
}

export interface WaitlistPage<Entry> {
  entries: Entry[];
  hasMore: boolean;
  nextCursor: string | null;
}

interface PublicWaitlistRow {
  id: string;
  email: string | null;
  source: string;
  user_id: string | null;
  joined_at: Date | string;
  page_sort_key: string;
}

interface UpgradeWaitlistRow {
  id: string;
  user_id: string | null;
  plan: string | null;
  joined_at: Date | string;
  page_sort_key: string;
}

interface ConsentRow {
  subject: string;
  purpose: string;
  granted: boolean;
  notice_version: string;
  surface: string;
  recorded_at: Date | string;
}

interface CountRow {
  key: string | null;
  count: number | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toCounts(rows: readonly CountRow[]): { counts: OperatorWaitlistCount[]; total: number } {
  const counts = rows.map((row) => ({ key: row.key ?? '', count: Number(row.count) || 0 }));
  return { counts, total: counts.reduce((sum, row) => sum + row.count, 0) };
}

function toConsent(row: ConsentRow): OperatorWaitlistConsent {
  return {
    purpose: row.purpose,
    granted: row.granted,
    recordedAt: toIso(row.recorded_at),
    noticeVersion: row.notice_version,
    surface: row.surface,
  };
}

function purposesForSource(source: string): readonly string[] {
  return isWaitlistSource(source)
    ? consentPurposesForWaitlistSource(source).map((purpose) => purpose.id)
    : EVERY_WAITLIST_SOURCE_PURPOSE_IDS;
}

const emailSubjectKey = (hash: string, purpose: string) => `email:${hash}:${purpose}`;
const accountSubjectKey = (userId: string, purpose: string) => `account:${userId}:${purpose}`;

function newestDecision(
  decisions: readonly OperatorWaitlistConsent[],
): OperatorWaitlistConsent | undefined {
  return decisions.reduce<OperatorWaitlistConsent | undefined>(
    (newest, decision) =>
      newest === undefined || decision.recordedAt > newest.recordedAt ? decision : newest,
    undefined,
  );
}

// A decision is written under the keyed hash of the address, or under the account when the
// visitor was resolved to one, and rows older than the pepper carry the unkeyed digest. Each
// entry is matched against every subject it could have been written under and the newest wins.
// A withdrawal is the newest row: `distinct on` reads one row per subject and purpose, and that
// row is the newest only because of `recorded_at desc`.
async function withLatestConsent(
  rows: readonly PublicWaitlistRow[],
): Promise<OperatorPublicWaitlistEntry[]> {
  const db = getNeonDb();
  const hashesByEntry = new Map<string, string[]>();
  for (const row of rows) {
    if (row.email) hashesByEntry.set(row.id, emailPseudonymCandidates(row.email));
  }
  const hashes = [...new Set([...hashesByEntry.values()].flat())];
  const userIds = [...new Set(rows.flatMap((row) => (row.user_id ? [row.user_id] : [])))];

  const decisionsBySubject = new Map<string, OperatorWaitlistConsent[]>();
  const remember = (subjectKey: string, row: ConsentRow) => {
    const known = decisionsBySubject.get(subjectKey);
    if (known) known.push(toConsent(row));
    else decisionsBySubject.set(subjectKey, [toConsent(row)]);
  };

  if (hashes.length > 0) {
    const byAddress = await db.query<ConsentRow>(
      `select distinct on (subject_email_sha256, purpose)
              subject_email_sha256 as subject, purpose, granted, notice_version, surface, recorded_at
         from public.consent_records
        where subject_email_sha256 = any($1::text[])
          and purpose = any($2::text[])
        order by subject_email_sha256, purpose, recorded_at desc`,
      [hashes, EVERY_WAITLIST_SOURCE_PURPOSE_IDS],
    );
    for (const row of byAddress) remember(emailSubjectKey(row.subject, row.purpose), row);
  }

  if (userIds.length > 0) {
    const byAccount = await db.query<ConsentRow>(
      `select distinct on (user_id, purpose)
              user_id as subject, purpose, granted, notice_version, surface, recorded_at
         from public.consent_records
        where user_id = any($1::text[])
          and purpose = any($2::text[])
        order by user_id, purpose, recorded_at desc`,
      [userIds, EVERY_WAITLIST_SOURCE_PURPOSE_IDS],
    );
    for (const row of byAccount) remember(accountSubjectKey(row.subject, row.purpose), row);
  }

  return rows.map((row) => {
    const hashesForEntry = hashesByEntry.get(row.id) ?? [];
    const consent = purposesForSource(row.source).flatMap((purpose) => {
      const subjectKeys = [
        ...hashesForEntry.map((hash) => emailSubjectKey(hash, purpose)),
        ...(row.user_id ? [accountSubjectKey(row.user_id, purpose)] : []),
      ];
      const newest = newestDecision(
        subjectKeys.flatMap((subjectKey) => decisionsBySubject.get(subjectKey) ?? []),
      );
      return newest ? [newest] : [];
    });
    return {
      id: row.id,
      email: row.email,
      source: row.source,
      joinedAt: toIso(row.joined_at),
      consent,
    };
  });
}

async function readPublicEntries(
  page: WaitlistPageRequest,
): Promise<WaitlistPage<OperatorPublicWaitlistEntry>> {
  const keyset = keysetSql({
    sortColumn: PAGE_SORT_COLUMN,
    cursor: page.cursor,
    firstParamIndex: 2,
  });
  const rows = await getNeonDb().query<PublicWaitlistRow>(
    `select * from (
       select id, email, source, user_id, joined_at,
              to_char(joined_at at time zone 'utc', ${PAGE_SORT_KEY_FORMAT}) as ${PAGE_SORT_COLUMN}
         from public.cloud_managed_waitlist
     ) entries
     ${keyset.where ? `where ${keyset.where}` : ''}
     ${keyset.orderBy}
     limit $1`,
    [page.limit + 1, ...keyset.params],
  );
  const built = buildPage(rows, page.limit, (row) => ({
    sortValue: row.page_sort_key,
    id: row.id,
  }));
  return {
    entries: await withLatestConsent(built.items),
    hasMore: built.hasMore,
    nextCursor: built.nextCursor,
  };
}

async function countPublicBySource(): Promise<{ counts: OperatorWaitlistCount[]; total: number }> {
  return toCounts(
    await getNeonDb().query<CountRow>(
      `select source as key, count(*)::int as count
         from public.cloud_managed_waitlist
        group by source
        order by count(*) desc, source asc`,
    ),
  );
}

export async function readPublicWaitlist(page: WaitlistPageRequest): Promise<
  WaitlistPage<OperatorPublicWaitlistEntry> & {
    total: number;
    bySource: OperatorWaitlistCount[];
  }
> {
  const [entries, bySource] = await Promise.all([readPublicEntries(page), countPublicBySource()]);
  return { ...entries, total: bySource.total, bySource: bySource.counts };
}

export async function readUpgradeWaitlist(page: WaitlistPageRequest): Promise<
  WaitlistPage<OperatorUpgradeWaitlistEntry> & {
    total: number;
    byPlan: OperatorWaitlistCount[];
  }
> {
  const db = getNeonDb();
  const keyset = keysetSql({
    sortColumn: PAGE_SORT_COLUMN,
    cursor: page.cursor,
    firstParamIndex: 2,
  });
  const [rows, byPlan] = await Promise.all([
    db.query<UpgradeWaitlistRow>(
      `select * from (
         select id, user_id, plan, coalesce(joined_at, created_at) as joined_at,
                to_char(coalesce(joined_at, created_at) at time zone 'utc', ${PAGE_SORT_KEY_FORMAT})
                  as ${PAGE_SORT_COLUMN}
           from public.waitlist
       ) entries
       ${keyset.where ? `where ${keyset.where}` : ''}
       ${keyset.orderBy}
       limit $1`,
      [page.limit + 1, ...keyset.params],
    ),
    db.query<CountRow>(
      `select plan as key, count(*)::int as count
         from public.waitlist
        group by plan
        order by count(*) desc, plan asc`,
    ),
  ]);
  const built = buildPage(rows, page.limit, (row) => ({
    sortValue: row.page_sort_key,
    id: row.id,
  }));
  const counted = toCounts(byPlan);
  return {
    entries: built.items.map((row) => ({
      id: row.id,
      userId: row.user_id,
      plan: row.plan,
      joinedAt: toIso(row.joined_at),
    })),
    hasMore: built.hasMore,
    nextCursor: built.nextCursor,
    total: counted.total,
    byPlan: counted.counts,
  };
}

export async function readPublicWaitlistExport(): Promise<{
  entries: OperatorPublicWaitlistEntry[];
  total: number;
  truncated: boolean;
}> {
  const entries: OperatorPublicWaitlistEntry[] = [];
  let cursor: KeysetCursor | null = null;
  let hasMore = true;
  while (hasMore && entries.length < WAITLIST_EXPORT_ROW_LIMIT) {
    const page = await readPublicEntries({
      limit: Math.min(EXPORT_BATCH_SIZE, WAITLIST_EXPORT_ROW_LIMIT - entries.length),
      cursor,
    });
    entries.push(...page.entries);
    cursor = decodeKeysetCursor(page.nextCursor);
    hasMore = page.hasMore && cursor !== null;
  }
  const { total } = await countPublicBySource();
  return { entries, total, truncated: hasMore };
}

export function publicWaitlistCsv(entries: readonly OperatorPublicWaitlistEntry[]): string {
  return toCsv([
    PUBLIC_WAITLIST_CSV_HEADER,
    ...entries.map((entry) => [
      entry.email ?? '',
      entry.source,
      entry.joinedAt,
      ...EVERY_WAITLIST_SOURCE_PURPOSE_IDS.map((purpose) => {
        const decision = entry.consent.find((candidate) => candidate.purpose === purpose);
        if (!decision) return '';
        return decision.granted ? CONSENT_GRANTED_CELL : CONSENT_NOT_GRANTED_CELL;
      }),
    ]),
  ]);
}
