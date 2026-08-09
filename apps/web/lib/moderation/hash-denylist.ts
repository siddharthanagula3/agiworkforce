import 'server-only';

import { createHash } from 'node:crypto';
import { logger } from '@/lib/logger';

/**
 * SHA-256 matching of uploaded bytes against a known-illegal-media denylist.
 *
 * `lib/security/upload-scan.ts` inspects uploads for *active content* — script
 * in an SVG, an auto-executing PDF, a disguised binary. That is a different
 * question from *what the file depicts*, and no amount of structural
 * inspection answers it. Hash matching is the one answer that does not need a
 * classifier: industry bodies (NCMEC, IWF, Tech Coalition) distribute lists of
 * SHA-256 digests of confirmed illegal media, and an exact digest match is a
 * fact rather than a probability.
 *
 * The list is supplied out of band via `MODERATION_HASH_DENYLIST` rather than
 * committed here, because the digests are themselves controlled material
 * redistributed under agreement. Each entry is `sha256` or `label:sha256`; the
 * label (list provenance, e.g. `ncmec`) is carried into the moderation report
 * so a reviewer knows which authority to notify.
 *
 * WITH THAT VARIABLE UNSET — which is how it ships — the list is empty and
 * this check matches nothing. That is unconfigured data, not a disabled
 * control: there is no version of it that works without an operator loading a
 * list, and no list that can be committed to a public repository. Do not read
 * a green upload path as evidence that hash matching is protecting anything;
 * check that the variable is populated in the environment.
 *
 * Perceptual hashing (PhotoDNA, PDQ) catches re-encodes that SHA-256 misses,
 * but it needs a licensed vendor and is a procurement decision, not a code
 * change. Exact matching is the floor, not the ceiling.
 */

export interface HashDenylistMatch {
  /** Lowercase hex digest of the inspected bytes. Present match or not. */
  sha256: string;
  /** Set only on a hit: the provenance label from the configured entry. */
  listLabel?: string;
  matched: boolean;
}

interface ParsedDenylist {
  /** digest -> provenance label ('' when the entry carried none). */
  entries: ReadonlyMap<string, string>;
  /** Raw env value the map was built from, so a change re-parses. */
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
  // A typo'd list is indistinguishable from an unconfigured one at match time,
  // and both fail open. Say so at parse time instead.
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

/**
 * Hash the bytes and test them against the configured denylist. Always returns
 * the digest, matched or not, so callers can put it in a moderation report
 * without re-hashing.
 */
export function matchDenylistedUpload(bytes: Uint8Array): HashDenylistMatch {
  const sha256 = sha256Hex(bytes);
  const label = loadDenylist().get(sha256);
  if (label === undefined) return { sha256, matched: false };
  return label ? { sha256, matched: true, listLabel: label } : { sha256, matched: true };
}
