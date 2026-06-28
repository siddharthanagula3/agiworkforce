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
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { insertMemoryFact, listMemoryFacts } from '@/storage/memory';
import { useCloudMemoryStore } from '@/stores/memory/cloudMemoryStore';
import { markMemoryForSync } from '@/services/cloudSyncEngine';
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
 *
 * `executionMode` routes persistence to the correct memory namespace, mirroring
 * `useMemoryStore.addMemory`:
 *   - 'local' → on-device SQLite (`memory_facts`).
 *   - 'cloud' → the cloud memory store + sync queue (pushed via cloudSyncEngine,
 *     so facts learned in a cloud chat sync across devices like web/desktop).
 * TRUST BOUNDARY: a cloud turn NEVER writes to local SQLite, and a local turn
 * never writes to the cloud store — the two namespaces stay physically separate.
 */
export async function consolidateFactsFromTurn(params: {
  message: string;
  conversationId: string | null;
  enabled?: boolean;
  executionMode?: 'local' | 'cloud';
}): Promise<ConsolidationResult> {
  const { message, conversationId, enabled = true, executionMode = 'local' } = params;
  if (!enabled) return { extracted: 0, inserted: 0 };

  try {
    const candidates = extractCandidateFacts(message);
    if (candidates.length === 0) return { extracted: 0, inserted: 0 };

    if (executionMode === 'cloud') {
      // Dedupe against the (synced) cloud memory store, then write fresh facts
      // there and queue them for the next push. No local SQLite write.
      const existing: MemoryFact[] = useCloudMemoryStore
        .getState()
        .entries.filter((e) => !e.isDeleted)
        .map((e) => ({
          id: e.id,
          fact: e.content,
          source_conversation_id: null,
          pinned: false,
          created_at: new Date(e.createdAt).getTime(),
        }));
      const fresh = dedupeAgainstExisting(candidates, existing).slice(0, MAX_PER_TURN);

      let inserted = 0;
      for (const fact of fresh) {
        try {
          const id = uuidv7();
          const now = new Date().toISOString();
          useCloudMemoryStore.getState().upsertCloudMemory({
            id,
            content: fact,
            category: null,
            source: 'mobile',
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
          });
          markMemoryForSync(id);
          inserted += 1;
        } catch {
          // Skip a single failed insert; keep going.
        }
      }
      return { extracted: candidates.length, inserted };
    }

    // Local path: on-device SQLite (unchanged).
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
