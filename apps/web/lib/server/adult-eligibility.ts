import 'server-only';

import type { AdultEligibilityState, AdultEligibilitySurface } from '@agiworkforce/cloud-contracts';
import {
  ACCOUNT_MINIMUM_AGE,
  adultEligibilityIsCurrent,
  adultEligibilityMethodOf,
  decideAdultEligibility,
  type AdultEligibilityEvidence,
} from '@agiworkforce/types';

import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';

interface AdultEligibilityRow {
  adult_eligibility_outcome: string | null;
  adult_eligibility_minimum_age: number | null;
}

const ELIGIBLE_OUTCOME = 'eligible';
const INELIGIBLE_OUTCOME = 'ineligible';

/**
 * Where an account stands against the minimum age. A refusal stands whatever
 * the minimum later becomes; an admission counts only while the minimum it was
 * made against is at least the current one, so an account admitted under an
 * earlier, lower minimum is asked again rather than waved through.
 */
export function adultEligibilityStateOf(
  row: AdultEligibilityRow | undefined,
): AdultEligibilityState {
  if (!row || row.adult_eligibility_outcome === null) return 'unconfirmed';
  if (row.adult_eligibility_outcome === INELIGIBLE_OUTCOME) return 'ineligible';
  if (row.adult_eligibility_outcome !== ELIGIBLE_OUTCOME) return 'unconfirmed';
  return row.adult_eligibility_minimum_age !== null &&
    adultEligibilityIsCurrent({ minimumAge: row.adult_eligibility_minimum_age })
    ? 'confirmed'
    : 'unconfirmed';
}

async function readRow(userId: string): Promise<AdultEligibilityRow | undefined> {
  const rows = await createClaimedUserScopedDb(getNeonDb(), {
    userId,
    organizationId: null,
  }).query<AdultEligibilityRow>(
    `select adult_eligibility_outcome, adult_eligibility_minimum_age
       from public.profiles
      where id = $1
      limit 1`,
    [userId],
  );
  return rows[0];
}

const CONFIRMED_CACHE_TTL_MS = 5 * 60_000;
const CONFIRMED_CACHE_MAX_ENTRIES = 10_000;
const confirmedUntil = new Map<string, number>();

/**
 * The state, read on every gated request. Only a confirmation is remembered,
 * and only for a few minutes: an account that is not confirmed may confirm in
 * another tab, and the next request has to see that on whichever instance it
 * lands. A read that fails throws, so the caller refuses rather than admits.
 */
export async function readAdultEligibilityState(userId: string): Promise<AdultEligibilityState> {
  const now = Date.now();
  const remembered = confirmedUntil.get(userId);
  if (remembered !== undefined && remembered > now) return 'confirmed';
  if (remembered !== undefined) confirmedUntil.delete(userId);

  const state = adultEligibilityStateOf(await readRow(userId));
  if (state === 'confirmed') {
    if (confirmedUntil.size >= CONFIRMED_CACHE_MAX_ENTRIES) {
      const oldest = confirmedUntil.keys().next().value;
      if (oldest !== undefined) confirmedUntil.delete(oldest);
    }
    confirmedUntil.set(userId, now + CONFIRMED_CACHE_TTL_MS);
  }
  return state;
}

export function forgetAdultEligibilityState(userId?: string): void {
  if (userId === undefined) confirmedUntil.clear();
  else confirmedUntil.delete(userId);
}

/**
 * Judges the evidence and keeps the outcome, never the evidence. A standing
 * decision is not rewritten by a later submission: an admitted account stays
 * admitted, and a refused one stays refused until support reviews it, so a
 * second answer cannot reopen what the first one closed. Evidence that settles
 * nothing writes nothing and leaves the account to be asked.
 */
export async function submitAdultEligibilityEvidence(
  userId: string,
  surface: AdultEligibilitySurface,
  evidence: AdultEligibilityEvidence,
): Promise<AdultEligibilityState> {
  const standing = adultEligibilityStateOf(await readRow(userId));
  if (standing !== 'unconfirmed') return standing;

  const verdict = decideAdultEligibility(evidence);
  if (verdict === 'inconclusive') return 'unconfirmed';

  const written = await createClaimedUserScopedDb(getNeonDb(), {
    userId,
    organizationId: null,
  }).query<AdultEligibilityRow>(
    `insert into public.profiles (
       id,
       adult_eligibility_outcome,
       adult_eligibility_minimum_age,
       adult_eligibility_method,
       adult_eligibility_surface,
       adult_eligibility_decided_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, now(), now())
     on conflict (id) do update
        set adult_eligibility_outcome = excluded.adult_eligibility_outcome,
            adult_eligibility_minimum_age = excluded.adult_eligibility_minimum_age,
            adult_eligibility_method = excluded.adult_eligibility_method,
            adult_eligibility_surface = excluded.adult_eligibility_surface,
            adult_eligibility_decided_at = excluded.adult_eligibility_decided_at,
            updated_at = now()
      where public.profiles.adult_eligibility_outcome is null
         or (
           public.profiles.adult_eligibility_outcome = 'eligible'
           and public.profiles.adult_eligibility_minimum_age < excluded.adult_eligibility_minimum_age
         )
     returning adult_eligibility_outcome, adult_eligibility_minimum_age`,
    [
      userId,
      verdict === 'eligible' ? ELIGIBLE_OUTCOME : INELIGIBLE_OUTCOME,
      ACCOUNT_MINIMUM_AGE,
      adultEligibilityMethodOf(evidence),
      surface,
    ],
  );
  forgetAdultEligibilityState(userId);

  return adultEligibilityStateOf(written[0] ?? (await readRow(userId)));
}
