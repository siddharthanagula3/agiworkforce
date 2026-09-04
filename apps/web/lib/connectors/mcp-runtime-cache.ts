import 'server-only';

import { createHash } from 'node:crypto';

import type {
  CacheEntry,
  CacheKey,
  DiscoverResult,
  PriorDiscovery,
  ResponseCacheStore,
} from '@modelcontextprotocol/client';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1_000;
const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isCacheSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizedServerKey(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.hash = '';
  return digest(url.toString());
}

function normalizedKey(key: CacheKey): [string, string, string] {
  return [key.method, key.params ?? '', key.partition ?? ''];
}

interface CacheRow {
  value: string;
  stamp: string | number;
  expires_at_ms: string | number | null;
  scope: 'public' | 'private' | null;
}

export class NeonMcpResponseCacheStore implements ResponseCacheStore {
  async getStamp(key: CacheKey): Promise<number | null> {
    const db = getNeonDb();
    try {
      const rows = await db.query<{ stamp: string | number }>(
        `select stamp
           from public.mcp_response_cache
          where method = $1 and params_key = $2 and partition_key = $3`,
        normalizedKey(key),
      );
      const row = rows[0];
      return row ? Number(row.stamp) : null;
    } catch (error) {
      if (isCacheSchemaUnavailable(error)) return null;
      throw error;
    }
  }

  async get(key: CacheKey): Promise<CacheEntry | undefined> {
    const db = getNeonDb();
    try {
      const rows = await db.query<CacheRow>(
        `select value, stamp, expires_at_ms, scope
           from public.mcp_response_cache
          where method = $1 and params_key = $2 and partition_key = $3`,
        normalizedKey(key),
      );
      const row = rows[0];
      if (!row) return undefined;
      const expiresAt = row.expires_at_ms === null ? undefined : Number(row.expires_at_ms);
      return {
        value: row.value,
        stamp: Number(row.stamp),
        ...(Number.isFinite(expiresAt) ? { expiresAt } : {}),
        ...(row.scope ? { scope: row.scope } : {}),
      };
    } catch (error) {
      if (isCacheSchemaUnavailable(error)) return undefined;
      throw error;
    }
  }

  async set(
    key: CacheKey,
    entry: { value: string; expiresAt?: number; scope?: 'public' | 'private' },
  ): Promise<number> {
    const db = getNeonDb();
    try {
      const rows = await db.query<{ stamp: string | number }>(
        `insert into public.mcp_response_cache
           (method, params_key, partition_key, value, expires_at_ms, scope)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (method, params_key, partition_key) do update set
           value = excluded.value,
           expires_at_ms = excluded.expires_at_ms,
           scope = excluded.scope,
           stamp = nextval('public.mcp_response_cache_stamp_seq'),
           updated_at = now()
         returning stamp`,
        [...normalizedKey(key), entry.value, entry.expiresAt ?? null, entry.scope ?? null],
      );
      return Number(rows[0]?.stamp ?? Date.now());
    } catch (error) {
      if (isCacheSchemaUnavailable(error)) return Date.now();
      throw error;
    }
  }

  async delete(key: CacheKey): Promise<void> {
    try {
      await getNeonDb().execute(
        `delete from public.mcp_response_cache
          where method = $1 and params_key = $2 and partition_key = $3`,
        normalizedKey(key),
      );
    } catch (error) {
      if (!isCacheSchemaUnavailable(error)) throw error;
    }
  }

  async evict(method: string): Promise<void> {
    try {
      await getNeonDb().execute('delete from public.mcp_response_cache where method = $1', [
        method,
      ]);
    } catch (error) {
      if (!isCacheSchemaUnavailable(error)) throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await getNeonDb().execute('delete from public.mcp_response_cache');
    } catch (error) {
      if (!isCacheSchemaUnavailable(error)) throw error;
    }
  }
}

interface DiscoveryRow {
  discover_result: unknown;
}

export async function loadMcpPriorDiscovery(
  serverUrl: string,
  authorizationContext: string,
): Promise<PriorDiscovery | undefined> {
  try {
    const rows = await getNeonDb().query<DiscoveryRow>(
      `select discover_result
         from public.mcp_discovery_cache
        where server_key = $1
          and authorization_context_key = $2
          and expires_at > now()`,
      [normalizedServerKey(serverUrl), digest(authorizationContext)],
    );
    const discover = rows[0]?.discover_result;
    if (!discover || typeof discover !== 'object' || Array.isArray(discover)) return undefined;
    return { kind: 'modern', discover: discover as DiscoverResult };
  } catch (error) {
    if (isCacheSchemaUnavailable(error)) return undefined;
    logger.warn({ error }, '[mcp-cache] failed to read persisted discovery result');
    return undefined;
  }
}

export async function saveMcpDiscovery(
  serverUrl: string,
  authorizationContext: string,
  discover: DiscoverResult,
): Promise<void> {
  try {
    await getNeonDb().execute(
      `insert into public.mcp_discovery_cache
         (server_key, authorization_context_key, discover_result, expires_at)
       values ($1, $2, $3::jsonb, now() + ($4 * interval '1 millisecond'))
       on conflict (server_key, authorization_context_key) do update set
         discover_result = excluded.discover_result,
         expires_at = excluded.expires_at,
         updated_at = now()`,
      [
        normalizedServerKey(serverUrl),
        digest(authorizationContext),
        JSON.stringify(discover),
        DISCOVERY_TTL_MS,
      ],
    );
  } catch (error) {
    if (!isCacheSchemaUnavailable(error)) throw error;
  }
}

const sharedResponseCache = new NeonMcpResponseCacheStore();

export async function getMcpStatelessRuntime(serverUrl: string, authorizationContext: string) {
  const prior = await loadMcpPriorDiscovery(serverUrl, authorizationContext);
  return {
    cache: {
      partition: digest(authorizationContext),
      store: sharedResponseCache,
    },
    discovery: {
      ...(prior ? { prior } : {}),
      onDiscovered: (discover: DiscoverResult) =>
        saveMcpDiscovery(serverUrl, authorizationContext, discover),
    },
  };
}
