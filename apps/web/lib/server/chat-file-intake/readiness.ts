import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { KeyValueStore } from '@agiworkforce/key-value';
import { getPlanMaxChatFileBytes } from '@agiworkforce/types';

import { MAX_CHAT_ATTACHMENT_BYTES } from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import {
  SOURCE_SCAN_PROTOCOL,
  readScannerCapability,
  type ScannerCapability,
} from '@/lib/security/source-scan-client';
import { getKeyValueStore } from '@/lib/server/key-value';
import { storageReachableForLargeFiles } from '@/lib/server/upload-transport';
import { chatFileSchemaReady } from './schema';

const SCANNER_CAPABILITY_TTL_MS = 60_000;
const SCANNER_CAPABILITY_KEY = 'agi:chat-files:scanner-capability';

export type ChatLargeFileReadinessGap = 'flag' | 'plan' | 'origin' | 'schema' | 'scanner';

export type ChatLargeFileReadiness =
  | { ready: true; maxSourceScanBytes: number }
  | { ready: false; missing: ChatLargeFileReadinessGap };

export interface ChatLargeFileReadinessDeps {
  fetch?: typeof fetch;
  store?: KeyValueStore | null;
  now?: () => number;
}

interface CachedCapability {
  capability: ScannerCapability | null;
  expiresAt: number;
}

let instanceCapability: CachedCapability | null = null;
let pendingCapabilityRead: Promise<ScannerCapability | null> | null = null;

export function chatLargeFilesFlagOn(): boolean {
  return process.env['CHAT_LARGE_FILES_ENABLED'] === 'on';
}

function sharedCapability(value: unknown, nowMs: number): CachedCapability | null {
  if (typeof value !== 'object' || value === null || !('capability' in value)) return null;
  const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    return null;
  }
  const bounded = Math.min(expiresAt, nowMs + SCANNER_CAPABILITY_TTL_MS);
  const capability = (value as { capability: unknown }).capability;
  if (capability === null) return { capability: null, expiresAt: bounded };
  if (typeof capability !== 'object') return null;
  const candidate = capability as Partial<ScannerCapability>;
  const max = candidate.maxSourceScanBytes;
  if (
    candidate.protocol !== SOURCE_SCAN_PROTOCOL ||
    typeof max !== 'number' ||
    !Number.isSafeInteger(max) ||
    max <= 0
  ) {
    return null;
  }
  return { capability: capability as ScannerCapability, expiresAt: bounded };
}

async function readSharedCapability(
  store: KeyValueStore | null,
  nowMs: number,
): Promise<CachedCapability | null> {
  if (!store) return null;
  try {
    return sharedCapability(await store.get<unknown>(SCANNER_CAPABILITY_KEY), nowMs);
  } catch (error) {
    logger.warn({ error }, '[chat-files] the shared scanner capability could not be read');
    return null;
  }
}

async function writeSharedCapability(
  store: KeyValueStore | null,
  cached: CachedCapability,
): Promise<void> {
  if (!store) return;
  try {
    await store.set(SCANNER_CAPABILITY_KEY, cached, {
      ttlMilliseconds: SCANNER_CAPABILITY_TTL_MS,
    });
  } catch (error) {
    logger.warn({ error }, '[chat-files] the shared scanner capability could not be written');
  }
}

/**
 * Cached per instance and in the shared store, so a cold instance rarely waits
 * on the scanner. The shared entry carries the expiry of the answer it holds,
 * and an instance that takes it keeps it no longer, so no answer outlives the
 * minute after the scanner gave it. Callers that arrive while a read is under
 * way wait for that read rather than sending their own.
 */
async function scannerCapability(
  deps: ChatLargeFileReadinessDeps,
): Promise<ScannerCapability | null> {
  const nowMs = (deps.now ?? Date.now)();
  if (instanceCapability !== null && instanceCapability.expiresAt > nowMs) {
    return instanceCapability.capability;
  }
  if (pendingCapabilityRead !== null) return pendingCapabilityRead;
  const read = refreshScannerCapability(deps, nowMs);
  pendingCapabilityRead = read;
  try {
    return await read;
  } finally {
    if (pendingCapabilityRead === read) pendingCapabilityRead = null;
  }
}

async function refreshScannerCapability(
  deps: ChatLargeFileReadinessDeps,
  nowMs: number,
): Promise<ScannerCapability | null> {
  const store = deps.store === undefined ? getKeyValueStore() : deps.store;
  const shared = await readSharedCapability(store, nowMs);
  if (shared !== null) {
    instanceCapability = shared;
    return shared.capability;
  }
  const capability = await readScannerCapability(deps.fetch ? { fetch: deps.fetch } : {});
  const fresh: CachedCapability = { capability, expiresAt: nowMs + SCANNER_CAPABILITY_TTL_MS };
  instanceCapability = fresh;
  await writeSharedCapability(store, fresh);
  return capability;
}

async function schemaReady(db: Pick<DatabaseAdapter, 'query'>): Promise<boolean> {
  try {
    return await chatFileSchemaReady(db, { cached: true });
  } catch (error) {
    logger.warn({ error }, '[chat-files] the chat file schema could not be checked');
    return false;
  }
}

function requestReadinessGap(input: {
  request: Request;
  planTier: string | null | undefined;
}): ChatLargeFileReadinessGap | null {
  if (!chatLargeFilesFlagOn()) return 'flag';
  if (!(getPlanMaxChatFileBytes(input.planTier) > MAX_CHAT_ATTACHMENT_BYTES)) return 'plan';
  if (!storageReachableForLargeFiles(input.request)) return 'origin';
  return null;
}

/**
 * The checks that need neither a query nor a fetch. A caller that has to read
 * something before it can run the full readiness check asks this first.
 */
export function chatLargeFilesMayBeOffered(input: {
  request: Request;
  planTier: string | null | undefined;
}): boolean {
  return requestReadinessGap(input) === null;
}

/**
 * The one gate that lets the flag take effect. Each check runs only when every
 * check before it passed, so the cheap ones guard the costly ones: with the
 * flag unset no query and no fetch is made.
 */
export async function readChatLargeFileReadiness(
  input: {
    request: Request;
    db: Pick<DatabaseAdapter, 'query'>;
    planTier: string | null | undefined;
  },
  deps: ChatLargeFileReadinessDeps = {},
): Promise<ChatLargeFileReadiness> {
  const gap = requestReadinessGap(input);
  if (gap !== null) return { ready: false, missing: gap };
  if (!(await schemaReady(input.db))) return { ready: false, missing: 'schema' };
  const capability = await scannerCapability(deps);
  if (capability === null) return { ready: false, missing: 'scanner' };
  return { ready: true, maxSourceScanBytes: capability.maxSourceScanBytes };
}
