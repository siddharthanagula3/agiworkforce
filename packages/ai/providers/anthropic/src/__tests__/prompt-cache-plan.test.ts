import { describe, expect, it } from 'vitest';
import type { ChatRequest, TextBlock } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';
import { ANTHROPIC_DEFAULT_MODEL_ID } from './model-fixtures';

const EPHEMERAL = { type: 'ephemeral' } as const;

function systemBlocks(count: number): TextBlock[] {
  return Array.from({ length: count }, (_, index) => ({
    type: 'text' as const,
    text: `stable block ${index}`,
    cacheControl: EPHEMERAL,
  }));
}

function requestWith(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: ANTHROPIC_DEFAULT_MODEL_ID,
    system: systemBlocks(1),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'the question', cacheControl: EPHEMERAL }],
      },
    ],
    ...overrides,
  };
}

function systemCacheControls(translated: ReturnType<typeof translateChatRequest>): unknown[] {
  return (translated.system ?? []).map((block) => block.cache_control);
}

describe('prompt cache plan at the Anthropic wire', () => {
  it('keeps the breakpoints an ordinary turn was assembled with', () => {
    const translated = translateChatRequest(requestWith());

    expect(systemCacheControls(translated)).toEqual([EPHEMERAL]);
  });

  it('removes every breakpoint from a zero-retention turn', () => {
    const translated = translateChatRequest(requestWith({ zeroDataRetentionOnly: true }));

    expect(systemCacheControls(translated)).toEqual([undefined]);
    const [message] = translated.messages;
    expect(message?.content).toEqual([{ type: 'text', text: 'the question' }]);
  });

  it('removes every breakpoint from a Temporary Chat', () => {
    const translated = translateChatRequest(
      requestWith({ promptCache: { organizationId: 'org_alpha', privacyClass: 'temporary' } }),
    );

    expect(systemCacheControls(translated)).toEqual([undefined]);
  });

  it('keeps only the first four breakpoints, which Anthropic is the ceiling for', () => {
    const translated = translateChatRequest(requestWith({ system: systemBlocks(6) }));

    expect(systemCacheControls(translated)).toEqual([
      EPHEMERAL,
      EPHEMERAL,
      EPHEMERAL,
      EPHEMERAL,
      undefined,
      undefined,
    ]);
    const [message] = translated.messages;
    expect(message?.content).toEqual([{ type: 'text', text: 'the question' }]);
  });

  it('downgrades an hour-long write when the turn carries no toolset to earn it', () => {
    const translated = translateChatRequest(
      requestWith({
        system: [{ type: 'text', text: 'stable', cacheControl: { type: 'ephemeral', ttl: '1h' } }],
      }),
    );

    expect(systemCacheControls(translated)).toEqual([EPHEMERAL]);
  });

  it('keeps an hour-long write when the toolset is part of the cached prefix', () => {
    const translated = translateChatRequest(
      requestWith({
        system: [{ type: 'text', text: 'stable', cacheControl: { type: 'ephemeral', ttl: '1h' } }],
        tools: [{ name: 'web_search', description: 'search', inputSchema: {} }],
      }),
    );

    expect(systemCacheControls(translated)).toEqual([{ type: 'ephemeral', ttl: '1h' }]);
  });
});
