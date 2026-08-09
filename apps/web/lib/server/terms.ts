import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * Proof of assent to /terms.
 *
 * Signup mounted the Clerk widget with nothing in front of it and wrote nothing
 * behind it, so the platform could not name a single account that had agreed to
 * the arbitration clause, the class-action waiver or the liability cap it
 * relies on. The clickwrap that now gates the widget lives in
 * `app/signup/TermsGate.tsx`; this module is the durable half — the record the
 * gate would otherwise leave only in the browser.
 *
 * The strength of that record: it says this user id agreed to this revision at
 * this instant on this surface, written from a session Clerk had already
 * established behind the clickwrap. It is not a signed attestation — the server
 * has no independent proof the checkbox was rendered, and it records nothing
 * about accounts created before this shipped. Treat a row as evidence of assent
 * collected by the flow named in `terms_accepted_surface`, and treat a NULL as
 * what it is: no assent on record, not assent that failed to save.
 *
 * Storage is `profiles.terms_version` / `terms_accepted_at` /
 * `terms_accepted_surface` (0102); see that migration for why the record is not
 * its own table.
 */

/**
 * The revision of /terms currently on screen. Read from the same constant the
 * page prints as "Last updated" so a recorded version can never name text the
 * user was not shown.
 */
export const CURRENT_TERMS_VERSION: string = POLICY_LAST_UPDATED.terms;

/** Where an acceptance was collected. Stored verbatim for reconstruction. */
export type TermsAcceptanceSurface = 'web-signup';

export interface TermsAcceptance {
  /** Revision of /terms that was accepted. */
  version: string;
  /** ISO instant the version was first accepted. */
  acceptedAt: string;
  /** Surface the acceptance was collected on, or null for legacy rows. */
  surface: string | null;
}

interface TermsAcceptanceRow {
  terms_version: string | null;
  terms_accepted_at: Date | string | null;
  terms_accepted_surface: string | null;
}

function toAcceptance(row: TermsAcceptanceRow | undefined): TermsAcceptance | null {
  if (!row?.terms_version || !row.terms_accepted_at) return null;
  const acceptedAt =
    row.terms_accepted_at instanceof Date
      ? row.terms_accepted_at.toISOString()
      : new Date(row.terms_accepted_at).toISOString();
  return {
    version: row.terms_version,
    acceptedAt,
    surface: row.terms_accepted_surface,
  };
}

/**
 * The acceptance on record for a user, or null when there is none. Returns
 * whatever version was accepted — compare against `CURRENT_TERMS_VERSION`
 * before treating it as agreement to the live text.
 */
async function readTermsAcceptance(userId: string): Promise<TermsAcceptance | null> {
  const rows = await getNeonDb().query<TermsAcceptanceRow>(
    `select terms_version, terms_accepted_at, terms_accepted_surface
       from public.profiles
      where id = $1
      limit 1`,
    [userId],
  );
  return toAcceptance(rows[0]);
}

/**
 * Persist the user's acceptance of the current terms.
 *
 * Upserts because the profile row is created lazily — a user reaches this on
 * the first authenticated request of their account, which can precede any other
 * write to `profiles`.
 *
 * The `where` on the conflict branch is what makes re-entering the flow
 * harmless: accepting a version already on record is a no-op, so the stored
 * instant stays the first acceptance of that text rather than sliding forward
 * every time the page is revisited. A revised /terms changes the version, the
 * predicate is true again, and the new acceptance replaces the old one.
 *
 * Throws on a database failure: a caller that cannot record assent must not be
 * able to mistake silence for a record.
 */
export async function recordTermsAcceptance(
  userId: string,
  surface: TermsAcceptanceSurface,
): Promise<TermsAcceptance> {
  const db = getNeonDb();
  const written = await db.query<TermsAcceptanceRow>(
    `insert into public.profiles (id, terms_version, terms_accepted_at, terms_accepted_surface, updated_at)
     values ($1, $2, now(), $3, now())
     on conflict (id) do update
        set terms_version = excluded.terms_version,
            terms_accepted_at = excluded.terms_accepted_at,
            terms_accepted_surface = excluded.terms_accepted_surface,
            updated_at = now()
      where public.profiles.terms_version is distinct from excluded.terms_version
     returning terms_version, terms_accepted_at, terms_accepted_surface`,
    [userId, CURRENT_TERMS_VERSION, surface],
  );

  const recorded = toAcceptance(written[0]);
  if (recorded) return recorded;

  // The conflict predicate suppressed the update, which means this version is
  // already on record. Read back the acceptance it kept.
  const existing = await readTermsAcceptance(userId);
  if (existing) return existing;

  throw new Error(`Terms acceptance for ${userId} was neither written nor found`);
}
