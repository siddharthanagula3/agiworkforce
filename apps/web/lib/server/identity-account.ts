import 'server-only';

import { after } from 'next/server';
import { subjectIsStoredUserId } from '@agiworkforce/identity';

import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getNeonDb } from '@/lib/server/neon-db';
import { readRedisWithinBudget, wasRedisReadAbandoned } from '@/lib/server/bounded-redis-read';
import { REQUEST_CONTEXT_CACHE_TTL_SECONDS } from '@/lib/server/request-context-cache';

export interface AuthenticatedAccount {
  accountId: string;
  identityId: string | null;
  provider: string;
  subject: string;
}

export type IdentityResolution =
  | { outcome: 'resolved'; account: AuthenticatedAccount }
  | { outcome: 'unknown' }
  | { outcome: 'erased'; accountId: string };

const CACHE_KEY_PREFIX = 'req-ctx:v1:identity';

interface CachedIdentity {
  accountId: string;
  identityId: string | null;
}

interface ResolutionRow {
  identity_id: string | null;
  account_id: string | null;
  erased: boolean;
}

/**
 * `fallback` is the subject itself only where 0019/0031 made it the stored
 * account id; for any other provider an unmapped subject resolves to nothing.
 */
const RESOLVE = `
  select identity.id::text as identity_id,
         coalesce(identity.user_id, source.fallback) as account_id,
         (tombstone.user_id is not null) as erased
    from (select $3::text as fallback) source
    left join public.identities identity
      on identity.provider = $1 and identity.subject = $2
    left join public.erasure_tombstones tombstone
      on tombstone.user_id = coalesce(identity.user_id, source.fallback)`;

const LINK = `
  insert into public.identities (provider, subject, user_id, creation_source, last_authenticated_at)
  select $1, $2, $3, 'sign_in', now()
   where exists (select 1 from public.profiles where id = $3)
      on conflict (provider, subject) do nothing
   returning id::text as identity_id`;

const TOUCH = `
  update public.identities
     set last_authenticated_at = now(), updated_at = now()
   where provider = $1 and subject = $2`;

const PG_UNDEFINED_TABLE = '42P01';

/**
 * Only a missing table degrades: any other failure is a database this cannot
 * read, and authenticating through one is what must not happen.
 */
function isBridgeMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record['code'] === PG_UNDEFINED_TABLE) return true;
  const message = String(record['message'] ?? '');
  return /identities|erasure_tombstones/.test(message) && /does not exist/.test(message);
}

function cacheKey(provider: string, subject: string): string {
  return `${CACHE_KEY_PREFIX}:${provider}:${subject}`;
}

function resolveStore(): ReturnType<typeof getKeyValueStore> {
  try {
    return getKeyValueStore();
  } catch {
    return null;
  }
}

async function readCache(provider: string, subject: string): Promise<CachedIdentity | undefined> {
  const store = resolveStore();
  if (!store) return undefined;
  try {
    const cached = await readRedisWithinBudget(
      store.get<CachedIdentity>(cacheKey(provider, subject)),
    );
    if (wasRedisReadAbandoned(cached) || !cached) return undefined;
    return cached;
  } catch (err) {
    logger.debug({ err }, '[identity-account] cache read failed');
    return undefined;
  }
}

function writeCache(provider: string, subject: string, value: CachedIdentity): void {
  const store = resolveStore();
  if (!store) return;
  const write = (async () => {
    try {
      await store.set(cacheKey(provider, subject), value, {
        ttlSeconds: REQUEST_CONTEXT_CACHE_TTL_SECONDS,
      });
    } catch (err) {
      logger.debug({ err }, '[identity-account] cache write failed');
    }
  })();
  try {
    after(write);
  } catch {
    void write;
  }
}

/**
 * An erasure must call this: without it a stale provider callback keeps
 * authenticating for the rest of the cache window.
 */
export async function invalidateIdentityAccountCache(subject: string): Promise<void> {
  const store = resolveStore();
  if (!store) return;
  try {
    await store.delete(cacheKey(getIdentityProvider().name, subject));
  } catch (err) {
    logger.debug({ err }, '[identity-account] cache invalidation failed');
  }
}

async function linkIdentity(
  provider: string,
  subject: string,
  accountId: string,
): Promise<string | null> {
  try {
    const rows = await getNeonDb().query<{ identity_id: string }>(LINK, [
      provider,
      subject,
      accountId,
    ]);
    const identityId = rows[0]?.identity_id ?? null;
    if (!identityId) return null;

    await recordAuditEvent({
      userId: accountId,
      eventType: 'identity_linked',
      detail: {
        resourceType: 'identity',
        resourceId: identityId,
        provider,
        source: 'sign_in',
      },
    });
    return identityId;
  } catch (err) {
    // A second subject for the same account trips 0174's (provider, user_id)
    // uniqueness; that is a conflict to look at, not a request to fail.
    logger.error({ err, provider }, 'Identity mapping could not be linked');
    return null;
  }
}

function touchIdentity(provider: string, subject: string): void {
  const write = getNeonDb()
    .execute(TOUCH, [provider, subject])
    .then(() => undefined)
    .catch((err: unknown) => {
      logger.debug({ err, provider }, '[identity-account] last_authenticated_at write failed');
    });
  try {
    after(write);
  } catch {
    void write;
  }
}

/**
 * The account id every row is scoped by, plus the identity id a link or unlink
 * acts on: the account survives the authentication method that reached it.
 */
export async function resolveAuthenticatedAccount(subject: string): Promise<IdentityResolution> {
  const provider = getIdentityProvider().name;
  const fallback = subjectIsStoredUserId(provider) ? subject : null;

  const cached = await readCache(provider, subject);
  if (cached) {
    return {
      outcome: 'resolved',
      account: {
        accountId: cached.accountId,
        identityId: cached.identityId,
        provider,
        subject,
      },
    };
  }

  let rows: ResolutionRow[];
  try {
    rows = await getNeonDb().query<ResolutionRow>(RESOLVE, [provider, subject, fallback]);
  } catch (err) {
    if (!isBridgeMissing(err)) throw err;
    logger.error({ err, provider }, 'Identity bridge is not provisioned; resolving without it');
    return fallback === null
      ? { outcome: 'unknown' }
      : {
          outcome: 'resolved',
          account: { accountId: fallback, identityId: null, provider, subject },
        };
  }

  const row = rows[0];
  const accountId = row?.account_id ?? null;
  if (!accountId) return { outcome: 'unknown' };
  if (row?.erased === true) return { outcome: 'erased', accountId };

  let identityId = row?.identity_id ?? null;
  if (identityId === null) {
    identityId = await linkIdentity(provider, subject, accountId);
  } else {
    touchIdentity(provider, subject);
  }

  writeCache(provider, subject, { accountId, identityId });

  return { outcome: 'resolved', account: { accountId, identityId, provider, subject } };
}
