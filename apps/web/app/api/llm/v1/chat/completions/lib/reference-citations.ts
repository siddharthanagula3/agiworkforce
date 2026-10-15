import { normalizeStructuredPromptSection } from '@agiworkforce/provider-protocol';
import type { ManagedMemoryCitation } from '@agiworkforce/types';

import type { PastChatCitation } from '@/lib/past-chat-citation';
import { firstManagedMemoryContentOffset } from '@/lib/services/managed-memory-context-service';
import { pastChatExcerptOffsets } from '@/lib/services/past-chat-context-service';

export interface FittedReferenceBlock {
  /** The reference block as composed, before the final fit. */
  readonly original: string;
  /** How much of it, from the start, the fit kept. */
  readonly keptLength: number;
}

export interface TurnReferenceCitations {
  readonly pastChatSources: readonly PastChatCitation[];
  readonly memoryCitations: readonly ManagedMemoryCitation[];
}

export interface TurnReferenceSections {
  readonly pastChatPrompt: string | null;
  readonly memoryPrompt: string | null;
}

function sectionIn(
  block: FittedReferenceBlock,
  prompt: string | null,
): { readonly start: number; readonly text: string } | null {
  if (!prompt) return null;
  const text = normalizeStructuredPromptSection(prompt);
  const start = block.original.indexOf(text);
  return start < 0 ? null : { start, text };
}

function pastChatSourcesSent(
  sources: readonly PastChatCitation[],
  prompt: string | null,
  block: FittedReferenceBlock,
): readonly PastChatCitation[] {
  const section = sectionIn(block, prompt);
  if (!section) return sources;
  const offsets = pastChatExcerptOffsets(section.text);
  return sources.filter((_, index) => {
    const offset = offsets[index];
    return offset !== undefined && section.start + offset < block.keptLength;
  });
}

function memoryCitationsSent(
  citations: readonly ManagedMemoryCitation[],
  prompt: string | null,
  block: FittedReferenceBlock,
): readonly ManagedMemoryCitation[] {
  const section = sectionIn(block, prompt);
  if (!section) return citations;
  const firstMemory = firstManagedMemoryContentOffset(section.text);
  return firstMemory >= 0 && section.start + firstMemory < block.keptLength ? citations : [];
}

/**
 * The citations whose source text still reached the model once the final fit
 * cut the reference block. The fit keeps a prefix of that block, so a source
 * whose text starts past the kept part was never sent and is not shown as one
 * the answer used. Past-chat excerpts are matched one by one, in citation
 * order. A memory citation cannot be matched to its rendered memory by
 * position, so memories are dropped only when none of their section was sent.
 */
export function citationsSentAfterFit(
  citations: TurnReferenceCitations,
  sections: TurnReferenceSections,
  block: FittedReferenceBlock,
): TurnReferenceCitations {
  if (block.keptLength >= block.original.length) return citations;
  return {
    pastChatSources: pastChatSourcesSent(citations.pastChatSources, sections.pastChatPrompt, block),
    memoryCitations: memoryCitationsSent(citations.memoryCitations, sections.memoryPrompt, block),
  };
}
