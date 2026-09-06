import 'server-only';

import { discoverOAuthServerInfo } from '@modelcontextprotocol/client';

import { assertResolvedPublicHostname } from '@/lib/egress-policy';
import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import { connectableFromAuthMode } from '@/lib/connectors/directory/connectable';
import { networkRemoteUrl } from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryAuthMode, DirectoryRecord } from '@/lib/connectors/directory/types';

const AUTH_PROBE_CACHE_METHOD = 'connectors.directory.auth-probe';
const AUTH_PROBE_TTL_MS = 24 * 60 * 60 * 1_000;
export const AUTH_PROBE_TIMEOUT_MS = 5_000;

export type AuthProbeOutcome = 'open' | 'oauth-required' | 'unresolved';

const cacheStore = new NeonMcpResponseCacheStore();

function probeCacheKey(url: string) {
  return { method: AUTH_PROBE_CACHE_METHOD, params: url, partition: '' };
}

const PROBE_TIMED_OUT = Symbol('auth-probe-timeout');

async function resolveAndDiscover(url: string): Promise<AuthProbeOutcome> {
  await assertResolvedPublicHostname(url);
  const info = await discoverOAuthServerInfo(url);
  return (info.resourceMetadata ?? info.authorizationServerMetadata) ? 'oauth-required' : 'open';
}

async function discoverRemoteAuthMode(url: string): Promise<AuthProbeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      resolveAndDiscover(url),
      new Promise<typeof PROBE_TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(PROBE_TIMED_OUT), AUTH_PROBE_TIMEOUT_MS);
      }),
    ]);
    return raced === PROBE_TIMED_OUT ? 'unresolved' : raced;
  } catch {
    return 'unresolved';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function probeRemoteAuthMode(url: string): Promise<AuthProbeOutcome> {
  const key = probeCacheKey(url);
  const cached = await cacheStore.get(key);
  if (cached) return cached.value as AuthProbeOutcome;

  const outcome = await discoverRemoteAuthMode(url);
  await cacheStore.set(key, {
    value: outcome,
    expiresAt: Date.now() + AUTH_PROBE_TTL_MS,
    scope: 'public',
  });
  return outcome;
}

export function authModeFromProbe(outcome: AuthProbeOutcome): DirectoryAuthMode {
  if (outcome === 'open') return 'none';
  if (outcome === 'oauth-required') return 'oauth';
  return 'unknown';
}

export function isAuthProbeCandidate(record: DirectoryRecord): boolean {
  return record.authMode === 'unknown' && networkRemoteUrl(record) !== null;
}

export async function resolveAuthModeForRecord(record: DirectoryRecord): Promise<DirectoryRecord> {
  if (record.authMode !== 'unknown') return record;
  const primaryUrl = networkRemoteUrl(record);
  if (!primaryUrl) return record;

  const outcome = await probeRemoteAuthMode(primaryUrl);
  const authMode = authModeFromProbe(outcome);
  if (authMode === record.authMode) return record;

  return { ...record, authMode, connectable: connectableFromAuthMode(authMode, true) };
}
