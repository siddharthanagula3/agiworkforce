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
import { renderPersonalizationBlock } from './personalization';

export interface PersonalContextInput {
  personalization: Personalization;
  memories: MemoryFact[];
}

export interface PersonalContextBlock {
  role: 'system';
  content: string;
}

export function renderMemoryBlock(memories: MemoryFact[]): string {
  if (memories.length === 0) return '';
  return [
    'User memory (retrieved for this turn — treat as background context):',
    ...memories.map((f, i) => `${i + 1}. ${f.fact}`),
  ].join('\n');
}

export function buildPersonalContextBlocks(input: PersonalContextInput): PersonalContextBlock[] {
  const blocks: PersonalContextBlock[] = [];

  const persona = renderPersonalizationBlock(input.personalization);
  if (persona) blocks.push({ role: 'system', content: persona });

  const memory = renderMemoryBlock(input.memories);
  if (memory) blocks.push({ role: 'system', content: memory });

  return blocks;
}
