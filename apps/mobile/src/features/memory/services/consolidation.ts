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
