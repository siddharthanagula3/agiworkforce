import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  CONSENT_PURPOSES,
  isConsentPurpose,
  isConsentSurface,
  type ConsentDecision,
  type ConsentSurface,
} from '@/lib/consent-purposes';

export {
  CONSENT_PURPOSES,
  CONSENT_SURFACES,
  WAITLIST_CONSENT_PURPOSES,
  WAITLIST_CONSENT_PURPOSE_IDS,
  PLATFORM_AVAILABILITY_CONSENT_PURPOSES,
  PLATFORM_AVAILABILITY_CONSENT_PURPOSE_IDS,
  findConsentPurpose,
  isConsentPurpose,
  isConsentSurface,
} from '@/lib/consent-purposes';
import { pseudonymizeEmail } from '@/lib/server/email-pseudonym';
export type { ConsentDecision, ConsentPurpose, ConsentSurface } from '@/lib/consent-purposes';

export const CURRENT_NOTICE_VERSION: string = POLICY_LAST_UPDATED.privacy;

export const MAX_CONSENT_DECISIONS_PER_REQUEST = CONSENT_PURPOSES.length;

export interface ConsentRecord {
  purpose: string;
  granted: boolean;
  noticeVersion: string;
  surface: string;
  recordedAt: string;
}

interface ConsentRow {
  purpose: string;
  granted: boolean;
  notice_version: string;
  surface: string;
  recorded_at: Date | string;
}

function toRecord(row: ConsentRow): ConsentRecord {
  return {
    purpose: row.purpose,
    granted: row.granted,
    noticeVersion: row.notice_version,
    surface: row.surface,
    recordedAt:
      row.recorded_at instanceof Date
        ? row.recorded_at.toISOString()
        : new Date(row.recorded_at).toISOString(),
  };
}

export function hashConsentSubjectEmail(email: string): string {
  return pseudonymizeEmail(email);
}

export type ConsentSubject =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'email'; readonly email: string };

export interface RecordConsentInput {
  readonly subject: ConsentSubject;
  readonly purpose: string;
  readonly granted: boolean;
  readonly surface: ConsentSurface;
}

export async function recordConsent(input: RecordConsentInput): Promise<ConsentRecord> {
  if (!isConsentPurpose(input.purpose)) {
    throw new Error(`Unknown consent purpose: ${String(input.purpose)}`);
  }
  if (!isConsentSurface(input.surface)) {
    throw new Error(`Unknown consent surface: ${String(input.surface)}`);
  }

  const userId = input.subject.kind === 'user' ? input.subject.userId : null;
  const emailHash =
    input.subject.kind === 'email' ? hashConsentSubjectEmail(input.subject.email) : null;

  const rows = await getNeonDb().query<ConsentRow>(
    `insert into public.consent_records
       (user_id, subject_email_sha256, purpose, granted, notice_version, surface)
     values ($1, $2, $3, $4, $5, $6)
     returning purpose, granted, notice_version, surface, recorded_at`,
    [userId, emailHash, input.purpose, input.granted, CURRENT_NOTICE_VERSION, input.surface],
  );

  const written = rows[0];
  if (!written) {
    throw new Error(`Consent for ${input.purpose} was not written`);
  }
  return toRecord(written);
}

export async function recordConsentBatch(
  subject: ConsentSubject,
  decisions: ReadonlyArray<ConsentDecision>,
  surface: ConsentSurface,
): Promise<ConsentRecord[]> {
  const written: ConsentRecord[] = [];
  for (const decision of decisions) {
    written.push(
      await recordConsent({
        subject,
        purpose: decision.purpose,
        granted: decision.granted,
        surface,
      }),
    );
  }
  return written;
}

export async function readUserConsents(userId: string): Promise<ConsentRecord[]> {
  const rows = await getNeonDb().query<ConsentRow>(
    `select distinct on (purpose)
            purpose, granted, notice_version, surface, recorded_at
       from public.consent_records
      where user_id = $1
      order by purpose, recorded_at desc`,
    [userId],
  );
  return rows.map(toRecord);
}

export async function readUserConsentHistory(userId: string): Promise<ConsentRecord[]> {
  const rows = await getNeonDb().query<ConsentRow>(
    `select purpose, granted, notice_version, surface, recorded_at
       from public.consent_records
      where user_id = $1
      order by recorded_at desc
      limit 500`,
    [userId],
  );
  return rows.map(toRecord);
}

export async function hasConsent(userId: string, purpose: string): Promise<boolean> {
  if (!isConsentPurpose(purpose)) return false;
  const rows = await getNeonDb().query<{ granted: boolean }>(
    `select granted
       from public.consent_records
      where user_id = $1 and purpose = $2
      order by recorded_at desc
      limit 1`,
    [userId, purpose],
  );
  return rows[0]?.granted === true;
}
