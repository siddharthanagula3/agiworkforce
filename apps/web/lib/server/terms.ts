import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const CURRENT_TERMS_VERSION: string = POLICY_LAST_UPDATED.terms;

export type TermsAcceptanceSurface = 'web-signup' | 'web-login';

export interface TermsAcceptance {
  version: string;
  acceptedAt: string;
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

async function readTermsAcceptance(userId: string): Promise<TermsAcceptance | null> {
  const rows = await createClaimedUserScopedDb(getNeonDb(), {
    userId,
    organizationId: null,
  }).query<TermsAcceptanceRow>(
    `select terms_version, terms_accepted_at, terms_accepted_surface
       from public.profiles
      where id = $1
      limit 1`,
    [userId],
  );
  return toAcceptance(rows[0]);
}

export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const acceptance = await readTermsAcceptance(userId);
  return acceptance?.version === CURRENT_TERMS_VERSION;
}

export async function recordTermsAcceptance(
  userId: string,
  surface: TermsAcceptanceSurface,
): Promise<TermsAcceptance> {
  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
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

  const existing = await readTermsAcceptance(userId);
  if (existing) return existing;

  throw new Error(`Terms acceptance for ${userId} was neither written nor found`);
}
