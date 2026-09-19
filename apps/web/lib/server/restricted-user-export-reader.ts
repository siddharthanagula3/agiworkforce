import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';

const timestampSchema = z
  .union([z.string().min(1), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));
const nullableTimestampSchema = timestampSchema.nullable();

const productAnalyticsEventExportSchema = z.object({
  event_name: z.string(),
  surface: z.string(),
  outcome: z.string().nullable(),
  properties: z.unknown(),
  occurred_at: timestampSchema,
});

const supportHandoffSessionExportSchema = z.object({
  id: z.string(),
  reference_id: z.string(),
  surface: z.string(),
  reason: z.string(),
  status: z.string(),
  contact_email: z.string(),
  summary: z.string(),
  transcript: z.unknown(),
  attempted_actions: z.unknown(),
  citations: z.unknown(),
  account_context: z.unknown(),
  page_path: z.string().nullable(),
  locale: z.string().nullable(),
  wait_expires_at: nullableTimestampSchema,
  connected_at: nullableTimestampSchema,
  last_activity_at: timestampSchema,
  closed_at: nullableTimestampSchema,
  email_sent_at: nullableTimestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});

const authenticationAttemptExportSchema = z.object({
  id: z.string(),
  surface: z.string(),
  outcome: z.string(),
  failure_reason: z.string().nullable(),
  provider: z.string().nullable(),
  region: z.string().nullable(),
  occurred_at: timestampSchema,
});

const RESTRICTED_USER_EXPORT_SPECS = [
  {
    section: 'product_analytics_events',
    sql: `select event_name, surface, outcome, properties, occurred_at
          from public.product_analytics_events
          where user_id = $1
          order by occurred_at desc
          limit 1000`,
    schema: productAnalyticsEventExportSchema,
    rowLimit: 1000,
  },
  {
    section: 'support_handoff_sessions',
    sql: `select id, reference_id, surface, reason, status, contact_email, summary,
                 transcript, attempted_actions, citations, account_context, page_path,
                 locale, wait_expires_at, connected_at, last_activity_at, closed_at,
                 email_sent_at, created_at, updated_at
          from public.support_handoff_sessions
          where owner_user_id = $1
          order by created_at asc`,
    schema: supportHandoffSessionExportSchema,
  },
  {
    section: 'authentication_attempts',
    sql: `select id, surface, outcome, failure_reason, provider, region, occurred_at
          from public.authentication_attempts
          where user_id = $1
          order by occurred_at desc
          limit 1000`,
    schema: authenticationAttemptExportSchema,
    rowLimit: 1000,
  },
] as const;

export const RESTRICTED_USER_EXPORT_SECTIONS = RESTRICTED_USER_EXPORT_SPECS.map(
  ({ section }) => section,
);

export interface RestrictedUserExportResult {
  section: (typeof RESTRICTED_USER_EXPORT_SECTIONS)[number];
  rows: unknown[];
  skippedRows: number;
  rowLimit?: number;
  truncated: boolean;
  error?: unknown;
}

export async function readRestrictedUserExportSections(
  db: DatabaseAdapter,
  userId: string,
): Promise<RestrictedUserExportResult[]> {
  const results: RestrictedUserExportResult[] = [];

  // These tables deny app_rls by design. Keep their service-role access fixed to
  // reviewed columns and the authenticated owner's identifier.
  for (const spec of RESTRICTED_USER_EXPORT_SPECS) {
    try {
      const rawRows = await db.query(spec.sql, [userId]);
      const rows: unknown[] = [];
      let skippedRows = 0;

      for (const row of rawRows) {
        const parsed = spec.schema.safeParse(row);
        if (parsed.success) rows.push(parsed.data);
        else skippedRows += 1;
      }

      results.push({
        section: spec.section,
        rows,
        skippedRows,
        ...('rowLimit' in spec ? { rowLimit: spec.rowLimit } : {}),
        truncated: 'rowLimit' in spec && rawRows.length >= spec.rowLimit,
      });
    } catch (error) {
      results.push({
        section: spec.section,
        rows: [],
        skippedRows: 0,
        ...('rowLimit' in spec ? { rowLimit: spec.rowLimit } : {}),
        truncated: false,
        error,
      });
    }
  }

  return results;
}
