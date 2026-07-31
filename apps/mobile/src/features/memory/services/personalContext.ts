/**
 * buildPersonalContextBlocks — composes the per-turn "who you are talking to"
 * system blocks from the user's personalization settings and the memories
 * retrieved for this turn.
 *
 * Pure + composable (no store / IO access): the chat action resolves the inputs
 * and decides WHEN to inject; this only decides the block content + order. Used
 * by both the local and cloud paths, so the name avoids "local".
 *
 * Order returned: [persona, memory]. The caller unshifts them so the final
 * system-message order ends up [persona, memory, …project, …turns].
 */
import type { Personalization } from '@/stores/settingsStore';
import type { MemoryFact } from '@/storage/types';
import { fenceUntrustedMemoryContent } from '@agiworkforce/utils/fence';
import { renderPersonalizationBlock } from './personalization';

export interface PersonalContextInput {
  personalization: Personalization;
  memories: MemoryFact[];
}

export interface PersonalContextBlock {
  role: 'system';
  content: string;
}

const MAX_MEMORY_FACTS = 50;
const MAX_MEMORY_FACT_CHARS = 1_000;
const MAX_MEMORY_TOTAL_CHARS = 8_000;

export function renderMemoryBlock(memories: MemoryFact[]): string {
  if (memories.length === 0) return '';

  const facts: string[] = [];
  let remaining = MAX_MEMORY_TOTAL_CHARS;
  for (const memory of memories.slice(0, MAX_MEMORY_FACTS)) {
    const text = memory.fact.trim();
    if (!text || remaining <= 0) continue;
    const bounded = Array.from(text).slice(0, Math.min(MAX_MEMORY_FACT_CHARS, remaining)).join('');
    facts.push(bounded);
    remaining -= bounded.length;
  }

  return fenceUntrustedMemoryContent(JSON.stringify(facts));
}

export function buildPersonalContextBlocks(input: PersonalContextInput): PersonalContextBlock[] {
  const blocks: PersonalContextBlock[] = [];

  const persona = renderPersonalizationBlock(input.personalization);
  if (persona) blocks.push({ role: 'system', content: persona });

  const memory = renderMemoryBlock(input.memories);
  if (memory) blocks.push({ role: 'system', content: memory });

  return blocks;
}
