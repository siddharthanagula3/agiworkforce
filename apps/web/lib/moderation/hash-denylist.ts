import 'server-only';

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { logger } from '@/lib/logger';

export interface HashDenylistMatch {
  sha256: string;
  listLabel?: string;
  matched: boolean;
}

interface ParsedDenylist {
  entries: ReadonlyMap<string, string>;
  source: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

let cache: ParsedDenylist | null = null;

function parseDenylist(raw: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  let malformed = 0;
  for (const token of raw.split(/[\s,;]+/)) {
    if (!token) continue;
    const separator = token.lastIndexOf(':');
    const label = separator >= 0 ? token.slice(0, separator).toLowerCase() : '';
    const digest = (separator >= 0 ? token.slice(separator + 1) : token).toLowerCase();
    if (SHA256_HEX.test(digest)) entries.set(digest, label);
    else malformed += 1;
  }
  if (malformed > 0) {
    logger.error(
      { malformed, usable: entries.size },
      '[moderation] MODERATION_HASH_DENYLIST contains entries that are not SHA-256 digests',
    );
  }
  return entries;
}

function loadDenylist(): ReadonlyMap<string, string> {
  const raw = process.env['MODERATION_HASH_DENYLIST'] ?? '';
  if (!cache || cache.source !== raw) {
    cache = { entries: parseDenylist(raw), source: raw };
  }
  return cache.entries;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Media that only exists as a staged file, such as a provider video of a few
// hundred megabytes, is digested a chunk at a time, so screening it never
// depends on the whole result fitting in memory.
export async function sha256HexFromFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Uint8Array);
  }
  return hash.digest('hex');
}

export function matchDenylistedSha256(sha256: string): HashDenylistMatch {
  const digest = sha256.toLowerCase();
  const label = loadDenylist().get(digest);
  if (label === undefined) return { sha256: digest, matched: false };
  return label
    ? { sha256: digest, matched: true, listLabel: label }
    : { sha256: digest, matched: true };
}

export function matchDenylistedUpload(bytes: Uint8Array): HashDenylistMatch {
  return matchDenylistedSha256(sha256Hex(bytes));
}
