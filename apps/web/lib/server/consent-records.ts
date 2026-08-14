import 'server-only';

import { createHash } from 'node:crypto';

import { getNeonDb } from '@/lib/server/neon-db';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  CONSENT_PURPOSES,
  isConsentPurpose,
  isConsentSurface,
  type ConsentDecision,
  type ConsentSurface,
} from '@/lib/consent-purposes';

/**
 * Per-purpose consent ledger — the durable half of the DPDP consent surface.
 *
 * India's Digital Personal Data Protection Act, 2023 makes consent the default
 * ground for processing, and it makes it specific: s.6(1) requires it to be
 * free, specific, informed, unconditional and unambiguous, given by a clear
 * affirmative action and limited to the personal data necessary for the purpose
 * named in the notice. s.6(6) requires withdrawing it to be as easy as giving
 * it. s.6(4) requires the notice itself to be available in English and the
 * Eighth Schedule languages — see DPDP_PROGRESS.md, that one is not code.
 *
 * Two consequences shape this module:
 *
 *  1. A single "I agree" cannot stand in for several purposes, so consent is
 *     stored per purpose and every writer names one. The catalogue lives in
 *     `lib/consent-purposes.ts` so the checkbox a person reads and the key that
 *     is stored cannot drift apart.
 *
 *  2. Withdrawal must be recorded, not erased. `recordConsent` only ever
 *     INSERTs — a withdrawal is a row with `granted: false`. The live state of
 *     a purpose is the newest row for that subject, which means the ledger can
 *     still answer "was consent held on 3 March" after it has been withdrawn.
 *
 * WHAT A ROW PROVES, precisely: that this server received an affirmative signal
 * for this purpose, from this surface, while notice revision `notice_version`
 * was published. It is not a signed attestation and there is no independent
 * proof the checkbox was rendered. A missing row means no consent on record —
 * never infer consent from silence, and never treat a failed write as one:
 * callers must fail the request instead of processing unconsented data.
 *
 * Storage is `public.consent_records` (migration 0113).
 */

export {
  CONSENT_PURPOSES,
  CONSENT_SURFACES,
  WAITLIST_CONSENT_PURPOSES,
  WAITLIST_CONSENT_PURPOSE_IDS,
  findConsentPurpose,
  isConsentPurpose,
  isConsentSurface,
} from '@/lib/consent-purposes';
export type { ConsentDecision, ConsentPurpose, ConsentSurface } from '@/lib/consent-purposes';

/**
 * Revision of the privacy notice a consent is recorded against. Read from the
 * same constant the notice prints as "Last updated" so a stored consent can
 * never name text the person was not shown.
 */
export const CURRENT_NOTICE_VERSION: string = POLICY_LAST_UPDATED.privacy;

/** How many purposes one request may decide at once. */
export const MAX_CONSENT_DECISIONS_PER_REQUEST = CONSENT_PURPOSES.length;

/** One decision, as stored. */
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

/**
 * SHA-256 of a normalised address, matching the hashing `/api/waitlist` already
 * performs, so a consent row and a waitlist row can be linked without this
 * table holding a second copy of the address.
 */
export function hashConsentSubjectEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/** Who the consent belongs to. Exactly one form is used per write. */
export type ConsentSubject =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'email'; readonly email: string };

export interface RecordConsentInput {
  readonly subject: ConsentSubject;
  readonly purpose: string;
  readonly granted: boolean;
  readonly surface: ConsentSurface;
}

/**
 * Append one consent decision.
 *
 * INSERT only, deliberately. Overwriting a grant with a withdrawal would leave
 * the product unable to show that consent was ever held, which is the record
 * DPDP s.6 exists to produce.
 *
 * Throws on a database failure or an unrecognised purpose/surface. A caller
 * that cannot record consent must not proceed to process the data.
 */
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

/**
 * Record several purposes from one submission.
 *
 * Both the ticked and the unticked boxes are written. An unticked box is a
 * decision — it is the difference between "declined marketing on 3 March" and
 * "was never asked", and only the first of those can be defended later.
 *
 * Rejects unknown purposes rather than dropping them, so a client that invents
 * a purpose key fails loudly instead of having its consent silently discarded.
 */
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

/**
 * The live state of every purpose for one account: the newest row per purpose.
 *
 * Purposes with no row at all are absent from the result rather than reported
 * as `false`. The caller decides how to present "never asked", which is not the
 * same fact as "declined".
 */
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

/**
 * The full history for one account, newest first — every grant and every
 * withdrawal, not just the live state. This is what a data principal is
 * entitled to see about their own consent under the access right, and what an
 * export must contain for the record to be worth keeping.
 */
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

/**
 * Whether a purpose is currently consented to for an account.
 *
 * Fails closed: no row, an unknown purpose, or a withdrawal all mean false.
 */
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
