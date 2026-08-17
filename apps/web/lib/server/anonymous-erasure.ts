import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { hashConsentSubjectEmail } from '@/lib/server/consent-records';
import { normalizeWaitlistEmail } from '@/lib/server/waitlist-email';

export type AnonymousSubjectKey = 'email' | 'emailSha256';

export const ANONYMOUS_SUBJECT_TABLES: ReadonlyArray<{
  table: string;
  column: string;
  key: AnonymousSubjectKey;
}> = [
  { table: 'cloud_managed_waitlist', column: 'email', key: 'email' },
  { table: 'consent_records', column: 'subject_email_sha256', key: 'emailSha256' },
  { table: 'data_rights_requests', column: 'contact_email', key: 'email' },
];

export interface AnonymousTableErasure {
  deleted: number;
  accountBound: number;
  skipped?: boolean;
  error?: string;
}

export interface AnonymousErasureReport {
  emailSha256: string;
  tables: Record<string, AnonymousTableErasure>;
  deleted: number;
  accountBound: number;
  complete: boolean;
}

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaAbsent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

export async function eraseAnonymousSubjectByEmail(email: string): Promise<AnonymousErasureReport> {
  const db = getNeonDb();
  const normalizedEmail = normalizeWaitlistEmail(email);
  const emailSha256 = hashConsentSubjectEmail(normalizedEmail);
  const tables: AnonymousErasureReport['tables'] = {};

  for (const { table, column, key } of ANONYMOUS_SUBJECT_TABLES) {
    const value = key === 'email' ? normalizedEmail : emailSha256;
    try {
      const retained = await db.query<{ retained: number }>(
        `select count(*)::int as retained
           from public.${table}
          where user_id is not null
            and lower(${column}) = $1`,
        [value],
      );
      const purged = await db.query<{ id: string }>(
        `delete from public.${table}
          where user_id is null
            and lower(${column}) = $1
        returning id`,
        [value],
      );
      tables[table] = {
        deleted: purged.length,
        accountBound: retained[0]?.retained ?? 0,
      };
    } catch (error) {
      if (isSchemaAbsent(error)) {
        tables[table] = { deleted: 0, accountBound: 0, skipped: true };
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      tables[table] = { deleted: 0, accountBound: 0, error: message };
      logger.error(
        { table, subject: emailSha256.slice(0, 12), error: message },
        'Anonymous erasure failed for table',
      );
    }
  }

  const results = Object.values(tables);
  return {
    emailSha256,
    tables,
    deleted: results.reduce((total, result) => total + result.deleted, 0),
    accountBound: results.reduce((total, result) => total + result.accountBound, 0),
    complete: results.every((result) => result.error === undefined),
  };
}
