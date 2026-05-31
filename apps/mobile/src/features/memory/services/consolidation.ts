/**
 * consolidation — the "learns day by day" persistence step.
 *
 * After a chat turn, candidate facts extracted from the user's message
 * (factExtractor) are deduped against what's already stored and the genuinely
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
import { insertMemoryFact, listMemoryFacts } from '@/storage/memory';
import type { MemoryFact } from '@/storage/types';
import { extractCandidateFacts } from './factExtractor';

/** Normalize a fact string for duplicate comparison (case/space-insensitive). */
function normalizeKey(fact: string): string {
  return fact.trim().toLowerCase().replace(/\s+/gu, ' ');
}

/**
 * Return the subset of `candidates` not already represented in `existing`.
 * Pure: compares on a normalized key and also dedupes within `candidates`.
 */
export function dedupeAgainstExisting(candidates: string[], existing: MemoryFact[]): string[] {
  const seen = new Set(existing.map((f) => normalizeKey(f.fact)));
  const out: string[] = [];
  for (const c of candidates) {
    const key = normalizeKey(c);
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
 * Extract → dedupe → persist new facts from one user message. Returns counts.
 * Never throws; on any failure returns zeros so the caller's turn is unaffected.
 *
 * `enabled` lets the caller skip work entirely (e.g. incognito / temporary chat).
 */
export async function consolidateFactsFromTurn(params: {
  message: string;
  conversationId: string | null;
  enabled?: boolean;
}): Promise<ConsolidationResult> {
  const { message, conversationId, enabled = true } = params;
  if (!enabled) return { extracted: 0, inserted: 0 };

  try {
    const candidates = extractCandidateFacts(message);
    if (candidates.length === 0) return { extracted: 0, inserted: 0 };

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
