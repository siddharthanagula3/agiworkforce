import * as Crypto from 'expo-crypto';
import { memoryConflictTopic, normalizeMemoryKey } from '@agiworkforce/agent-core';
import { prohibitedMemoryCategory, type ProhibitedMemoryCategory } from '@agiworkforce/context';
import { insertMemoryFact, listMemoryFacts, supersedeMemoryFacts } from '@/storage/memory';
import type { MemoryFact, MemoryFactSource } from '@/storage/types';
import { memoryFactChangedAt, memoryFactRank } from './memoryOrigin';

const MAX_KNOWN_FACTS = 5_000;

export type LocalMemoryWriteOutcome = 'inserted' | 'already_known' | 'kept_existing' | 'refused';

export interface LocalMemoryWriteResult {
  outcome: LocalMemoryWriteOutcome;
  fact: MemoryFact | null;
  replacedIds: string[];
  refusedCategory?: ProhibitedMemoryCategory;
}

export async function writeLocalMemoryFact(input: {
  fact: string;
  source: MemoryFactSource;
  conversationId?: string | null;
  known?: readonly MemoryFact[];
}): Promise<LocalMemoryWriteResult> {
  const refusedCategory = prohibitedMemoryCategory(input.fact);
  if (refusedCategory) return { outcome: 'refused', fact: null, replacedIds: [], refusedCategory };
  const known = input.known ?? (await listMemoryFacts({ limit: MAX_KNOWN_FACTS }));
  const key = normalizeMemoryKey(input.fact);
  if (!key || known.some((entry) => normalizeMemoryKey(entry.fact) === key)) {
    return { outcome: 'already_known', fact: null, replacedIds: [] };
  }

  const topic = memoryConflictTopic(input.fact)?.topic;
  const rivals = topic
    ? known.filter((entry) => memoryConflictTopic(entry.fact)?.topic === topic)
    : [];
  const now = Date.now();
  const candidate: MemoryFact = {
    id: Crypto.randomUUID(),
    fact: input.fact,
    source_conversation_id: input.conversationId ?? null,
    pinned: false,
    created_at: now,
    updated_at: now,
    source: input.source,
  };
  const rank = memoryFactRank(candidate);
  const winner = rivals
    .filter((entry) => memoryFactRank(entry) > rank)
    .sort(
      (left, right) =>
        memoryFactRank(right) - memoryFactRank(left) ||
        memoryFactChangedAt(right) - memoryFactChangedAt(left),
    )[0];

  const fact: MemoryFact = { ...candidate, superseded_by: winner?.id ?? null };
  await insertMemoryFact(fact);
  if (winner) return { outcome: 'kept_existing', fact, replacedIds: [] };

  const replacedIds = rivals.map((entry) => entry.id);
  if (replacedIds.length > 0) await supersedeMemoryFacts(replacedIds, fact.id);
  return { outcome: 'inserted', fact, replacedIds };
}
