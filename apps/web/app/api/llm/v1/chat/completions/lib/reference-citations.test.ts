import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { formatManagedMemorySystemPrompt } from '@/lib/services/managed-memory-context-service';
import { formatPastChatContext } from '@/lib/services/past-chat-context-service';

import { citationsSentAfterFit } from './reference-citations';

const excerpts = ['A', 'B', 'C'].map((label, index) => ({
  conversationId: `conversation-${index}`,
  messageId: `message-${index}`,
  title: `Chat ${label}`,
  role: 'user' as const,
  content: `Fact ${label}: ${'detail '.repeat(40)}`,
  createdAt: '2026-10-01T10:00:00.000Z',
}));
const pastChatPrompt = formatPastChatContext(excerpts)!;
const memoryPrompt = formatManagedMemorySystemPrompt([
  { content: 'I prefer tea.', category: null, pinned: false },
])!;
const pastChatSources = excerpts.map((excerpt) => ({
  id: `source-${excerpt.messageId}`,
  conversationId: excerpt.conversationId,
  messageId: excerpt.messageId,
  title: excerpt.title,
  createdAt: excerpt.createdAt,
}));
const memoryCitations = [{ id: 'memory-1', excerpt: 'I prefer tea.' }];
const citations = { pastChatSources, memoryCitations };
const sections = { pastChatPrompt, memoryPrompt };
const original = `${SYSTEM_PROMPT_CACHE_BOUNDARY}${memoryPrompt}\n\n${pastChatPrompt}\n\nTime: now`;

describe('citationsSentAfterFit (PC-F08)', () => {
  it('keeps every citation when the fit kept the whole reference block', () => {
    expect(
      citationsSentAfterFit(citations, sections, { original, keptLength: original.length }),
    ).toBe(citations);
  });

  it('drops the past-chat excerpts the fit cut, matching them in citation order', () => {
    const result = citationsSentAfterFit(citations, sections, {
      original,
      keptLength: original.indexOf('Fact B'),
    });

    expect(result.pastChatSources.map((source) => source.messageId)).toEqual(['message-0']);
    expect(result.memoryCitations).toEqual(memoryCitations);
  });

  it('drops a cited excerpt the reference block never carried', () => {
    const result = citationsSentAfterFit(
      {
        pastChatSources: [
          ...pastChatSources,
          { ...pastChatSources[0]!, id: 'source-extra', messageId: 'extra' },
        ],
        memoryCitations,
      },
      sections,
      { original, keptLength: original.length - 1 },
    );

    expect(result.pastChatSources.map((source) => source.messageId)).toEqual([
      'message-0',
      'message-1',
      'message-2',
    ]);
  });

  it('drops the memory citations once none of the memory section was sent', () => {
    const result = citationsSentAfterFit(citations, sections, {
      original,
      keptLength: original.indexOf('I prefer tea.'),
    });

    expect(result.memoryCitations).toEqual([]);
    expect(result.pastChatSources).toEqual([]);
  });

  it('leaves citations whose section is not in the block as they were', () => {
    const result = citationsSentAfterFit(
      citations,
      { pastChatPrompt: null, memoryPrompt: null },
      { original, keptLength: 10 },
    );

    expect(result).toEqual(citations);
  });
});
