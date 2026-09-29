import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { logger } from '@/lib/logger';
import { recordFailure } from '@/lib/observability/metrics';

export const CURRENT_TERMS_VERSION: string = POLICY_LAST_UPDATED.terms;

/**
 * The oldest accepted version that still lets an account work, and the date it
 * starts to bind. As ChatGPT and Claude do, a revision is announced ahead of
 * time and continued use accepts it: an account on an older version keeps
 * working and is told about the new one. Only a material change sets these,
 * with an effective date at least MATERIAL_TERMS_GRACE_DAYS after publication,
 * and only after that date does an account still on an older version have to
 * accept before it can chat. Null means no revision is binding yet.
 */
export const MIN_REQUIRED_TERMS_VERSION: string | null = null;
export const MIN_REQUIRED_TERMS_EFFECTIVE_AT: string | null = null;
export const MATERIAL_TERMS_GRACE_DAYS = 30;

export type TermsAcceptanceSurface = 'web-signup' | 'web-login' | 'mobile-auth';

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

export type TermsStanding =
  | { kind: 'current' }
  | { kind: 'notice'; acceptedVersion: string | null; requiredFrom: string | null }
  | { kind: 'required'; reason: 'never_accepted' | 'superseded' };

export interface TermsPolicy {
  current: string;
  minRequired: string | null;
  minRequiredEffectiveAt: string | null;
}

const LIVE_TERMS_POLICY: TermsPolicy = {
  current: CURRENT_TERMS_VERSION,
  minRequired: MIN_REQUIRED_TERMS_VERSION,
  minRequiredEffectiveAt: MIN_REQUIRED_TERMS_EFFECTIVE_AT,
};

/**
 * Where an account stands against the published terms. Versions are ISO dates,
 * so they order as strings. An account with no acceptance at all never agreed
 * to anything and is refused; one on an older version is refused only once a
 * material revision above it has passed its effective date.
 */
export function termsStandingFor(
  acceptance: Pick<TermsAcceptance, 'version'> | null,
  now: Date = new Date(),
  policy: TermsPolicy = LIVE_TERMS_POLICY,
): TermsStanding {
  if (!acceptance) return { kind: 'required', reason: 'never_accepted' };
  if (acceptance.version >= policy.current) return { kind: 'current' };
  const bindingRevisionPending =
    policy.minRequired !== null && acceptance.version < policy.minRequired;
  if (bindingRevisionPending && policy.minRequiredEffectiveAt !== null) {
    if (now.getTime() >= Date.parse(policy.minRequiredEffectiveAt)) {
      return { kind: 'required', reason: 'superseded' };
    }
    return {
      kind: 'notice',
      acceptedVersion: acceptance.version,
      requiredFrom: policy.minRequiredEffectiveAt,
    };
  }
  return { kind: 'notice', acceptedVersion: acceptance.version, requiredFrom: null };
}

const STANDING_CACHE_TTL_MS = 5 * 60_000;
const STANDING_CACHE_MAX_ENTRIES = 10_000;
const standingCache = new Map<string, { standing: TermsStanding; expiresAt: number }>();

/**
 * The standing, cached per user for a few minutes because every chat turn asks.
 * A refusal is never cached: the account may accept in another tab, and the
 * next turn has to see that on whichever instance it lands.
 */
export async function readTermsStanding(userId: string): Promise<TermsStanding> {
  const now = Date.now();
  const cached = standingCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.standing;
  if (cached) standingCache.delete(userId);

  const standing = termsStandingFor(await readTermsAcceptance(userId), new Date(now));
  if (standing.kind !== 'required') {
    if (standingCache.size >= STANDING_CACHE_MAX_ENTRIES) {
      const oldest = standingCache.keys().next().value;
      if (oldest !== undefined) standingCache.delete(oldest);
    }
    standingCache.set(userId, { standing, expiresAt: now + STANDING_CACHE_TTL_MS });
  }
  return standing;
}

/**
 * The page and device-sign-in gates' question: must this account accept before
 * it continues? Only with no acceptance on record or past a material
 * revision's effective date; an older valid version continues and is told
 * about the new one. A failed read lets the account through, logged and
 * counted, because this is a notice requirement, not a safety switch.
 */
export async function mustAcceptTerms(userId: string, gate: string): Promise<boolean> {
  try {
    return (await readTermsStanding(userId)).kind === 'required';
  } catch (error) {
    logger.error(
      { error, userId, gate },
      '[terms] acceptance unreadable; letting the account through',
    );
    recordFailure('database', 'terms_acceptance_unreadable');
    return false;
  }
}

export function forgetTermsStanding(userId?: string): void {
  if (userId === undefined) standingCache.clear();
  else standingCache.delete(userId);
}

export const TERMS_NOTICE_HEADER = 'X-AGI-Terms-Notice';
export const TERMS_REQUIRED_FROM_HEADER = 'X-AGI-Terms-Required-From';

/**
 * The notice a client can surface when the account works under an older
 * version: the version now published and, when a material revision is pending,
 * the date after which it has to be accepted.
 */
export function termsNoticeHeaders(standing: TermsStanding): Record<string, string> {
  if (standing.kind !== 'notice') return {};
  return {
    [TERMS_NOTICE_HEADER]: CURRENT_TERMS_VERSION,
    ...(standing.requiredFrom ? { [TERMS_REQUIRED_FROM_HEADER]: standing.requiredFrom } : {}),
  };
}

export async function hasAcceptedAnyTerms(userId: string): Promise<boolean> {
  return (await readTermsAcceptance(userId)) !== null;
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
  forgetTermsStanding(userId);

  const recorded = toAcceptance(written[0]);
  if (recorded) return recorded;

  const existing = await readTermsAcceptance(userId);
  if (existing) return existing;

  throw new Error(`Terms acceptance for ${userId} was neither written nor found`);
}
