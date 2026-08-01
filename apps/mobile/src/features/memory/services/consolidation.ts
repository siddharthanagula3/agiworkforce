/**
 * consolidation — the "learns day by day" persistence step.
 *
 * After a chat turn, candidate facts extracted from the user's message
 * by the shared agent-core memory engine are deduped against what's already stored, and the
 * new ones are persisted with the source conversation recorded. Existing
 * bulkInsert() does NOT dedupe and drops the source conversation, so it would
 * accumulate the same disclosure every turn — this service fixes both.
 *
 * Split:
 *   - dedupeAgainstExisting(candidates, existing) — pure, unit-tested.
 *   - consolidateFactsFromTurn(...) — thin async wrapper that reads existing
 *     facts, dedupes, and inserts. Never throws (memory must never break a turn).
 */
import * as Crypto from 'expo-crypto';
import { extractCandidateMemoryFacts, normalizeMemoryKey } from '@agiworkforce/agent-core';
import { insertMemoryFact, listMemoryFacts } from '@/storage/memory';
import type { MemoryFact } from '@/storage/types';

/**
 * Return the subset of `candidates` not already represented in `existing`.
 * Pure: compares on a normalized key and also dedupes within `candidates`.
 */
export function dedupeAgainstExisting(candidates: string[], existing: MemoryFact[]): string[] {
  const seen = new Set(existing.map((f) => normalizeMemoryKey(f.fact)));
  const out: string[] = [];
  for (const c of candidates) {
    const key = normalizeMemoryKey(c);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c.trim());
  }
  return out;
}

export interface ConsolidationResult {
  extracted: number;
  inserted: number;
}

/** Hard cap on facts persisted from a single turn — bounds runaway extraction. */
const MAX_PER_TURN = 5;

/**
 * Extract → dedupe → persist new facts from one user message into ON-DEVICE
 * SQLite. Returns counts. Never throws; on any failure returns zeros so the
 * caller's turn is unaffected.
 *
 * `enabled` lets the caller skip work entirely (e.g. incognito / temporary chat).
 *
 * LOCAL MODE ONLY. Cloud auto-memory is owned by the managed server
 * (`recordManagedAutoMemoryTurn`, completed-turns only, exactly like web); the
 * client must not duplicate that write. Callers gate on
 * `shouldConsolidateMemoryOnClient`, which only permits local turns — so this
 * never runs for a cloud turn.
 */
/**
 * Whether the CLIENT should consolidate memory for a turn. Only Local mode
 * consolidates on-device here; Cloud mode is owned by the managed server
 * (`recordManagedAutoMemoryTurn`, which persists the same conservative
 * user-authored facts but only after a completed turn, exactly like web), so the
 * client must not duplicate that write or learn before the turn succeeds.
 * Temporary/incognito chats never learn.
 */
export function shouldConsolidateMemoryOnClient(opts: {
  executionMode: 'local' | 'cloud';
  isTemporaryChat: boolean;
  memoryEnabled: boolean;
  generateMemoryFromHistory: boolean;
}): boolean {
  return (
    !opts.isTemporaryChat &&
    opts.executionMode === 'local' &&
    opts.memoryEnabled &&
    opts.generateMemoryFromHistory
  );
}

// ---------------------------------------------------------------------------
// Read-only summary — the auditable "what has this learned about me" view.
// ---------------------------------------------------------------------------

/**
 * One grouped block of the memory summary. Groups are derived STRICTLY from
 * fields already stored on the entry (`pinned`, `source_conversation_id`) —
 * nothing is inferred, classified, or paraphrased, so the screen can never
 * assert something the stored memory does not say.
 */
export interface MemorySummarySection {
  key: 'pinned' | 'from-chats' | 'added-by-you';
  title: string;
  description: string;
  facts: string[];
}

export interface MemorySummary {
  sections: MemorySummarySection[];
  /** Entries the summary was generated from, before dedupe. */
  sourceCount: number;
  /** Distinct facts rendered after dedupe. */
  includedCount: number;
  /** Newest entry timestamp in epoch ms, or null when there are no entries. */
  newestAt: number | null;
  /** Oldest entry timestamp in epoch ms, or null when there are no entries. */
  oldestAt: number | null;
}

const SUMMARY_SECTION_META: Record<
  MemorySummarySection['key'],
  { title: string; description: string }
> = {
  pinned: {
    title: 'Pinned',
    description: 'Kept at the top and preferred whenever nothing else matches.',
  },
  'from-chats': {
    title: 'Learned from chats',
    description: 'Saved automatically from a conversation turn.',
  },
  'added-by-you': {
    title: 'Added by you',
    description: 'Written or imported by hand rather than learned from a chat.',
  },
};

/**
 * Build a read-only overview of stored memories.
 *
 * This is a local projection, not a model call: it groups, dedupes and counts
 * the entries the device already holds. Dedupe reuses the same normalized key
 * the write path uses (`dedupeAgainstExisting`), so the summary can never show
 * the same disclosure twice while the store legitimately holds two variants.
 */
export function summarizeMemoryFacts(entries: MemoryFact[]): MemorySummary {
  const buckets: Record<MemorySummarySection['key'], MemoryFact[]> = {
    pinned: [],
    'from-chats': [],
    'added-by-you': [],
  };

  let newestAt: number | null = null;
  let oldestAt: number | null = null;

  for (const entry of entries) {
    if (typeof entry.created_at === 'number' && Number.isFinite(entry.created_at)) {
      newestAt = newestAt === null ? entry.created_at : Math.max(newestAt, entry.created_at);
      oldestAt = oldestAt === null ? entry.created_at : Math.min(oldestAt, entry.created_at);
    }
    if (entry.pinned) {
      buckets.pinned.push(entry);
    } else if (entry.source_conversation_id) {
      buckets['from-chats'].push(entry);
    } else {
      buckets['added-by-you'].push(entry);
    }
  }

  const sections: MemorySummarySection[] = [];
  let includedCount = 0;
  for (const key of ['pinned', 'from-chats', 'added-by-you'] as const) {
    const facts = dedupeAgainstExisting(
      buckets[key].map((entry) => entry.fact),
      [],
    );
    if (facts.length === 0) continue;
    includedCount += facts.length;
    sections.push({ key, ...SUMMARY_SECTION_META[key], facts });
  }

  return { sections, sourceCount: entries.length, includedCount, newestAt, oldestAt };
}

/** Whole days between two epoch-ms instants, floored at 0. */
function wholeDaysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/**
 * Freshness caption for a memory surface, e.g. "Updated 2 days ago".
 *
 * Returns null when there is nothing to report — an unknown or empty store must
 * render no freshness line at all rather than a fabricated one.
 */
export function describeMemoryFreshness(
  entries: MemoryFact[],
  now: number = Date.now(),
): string | null {
  let newestAt: number | null = null;
  for (const entry of entries) {
    if (typeof entry.created_at !== 'number' || !Number.isFinite(entry.created_at)) continue;
    newestAt = newestAt === null ? entry.created_at : Math.max(newestAt, entry.created_at);
  }
  if (newestAt === null) return null;

  const days = wholeDaysBetween(newestAt, now);
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Updated 1 month ago' : `Updated ${months} months ago`;
}

export async function consolidateFactsFromTurn(params: {
  message: string;
  conversationId: string | null;
  enabled?: boolean;
}): Promise<ConsolidationResult> {
  const { message, conversationId, enabled = true } = params;
  if (!enabled) return { extracted: 0, inserted: 0 };

  try {
    const candidates = extractCandidateMemoryFacts(message);
    if (candidates.length === 0) return { extracted: 0, inserted: 0 };

    // On-device SQLite (local mode only — see the header; cloud is server-owned).
    const existing = await listMemoryFacts({ limit: 500 });
    const fresh = dedupeAgainstExisting(candidates, existing).slice(0, MAX_PER_TURN);

    let inserted = 0;
    for (const fact of fresh) {
      try {
        await insertMemoryFact({
          id: Crypto.randomUUID(),
          fact,
          source_conversation_id: conversationId,
          pinned: false,
          created_at: Date.now(),
        });
        inserted += 1;
      } catch {
        // Skip a single failed insert; keep going.
      }
    }
    return { extracted: candidates.length, inserted };
  } catch {
    return { extracted: 0, inserted: 0 };
  }
}
