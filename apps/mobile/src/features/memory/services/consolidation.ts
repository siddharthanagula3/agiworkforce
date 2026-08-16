import * as Crypto from 'expo-crypto';
import { extractCandidateMemoryFacts, normalizeMemoryKey } from '@agiworkforce/agent-core';
import { insertMemoryFact, listMemoryFacts } from '@/storage/memory';
import type { MemoryFact } from '@/storage/types';

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

const MAX_PER_TURN = 5;

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

export interface MemorySummarySection {
  key: 'pinned' | 'from-chats' | 'added-by-you';
  title: string;
  description: string;
  facts: string[];
}

export interface MemorySummary {
  sections: MemorySummarySection[];
  sourceCount: number;
  includedCount: number;
  newestAt: number | null;
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

function wholeDaysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

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
