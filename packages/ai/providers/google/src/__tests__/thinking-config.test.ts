import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

describe('translateChatRequest thinkingConfig.includeThoughts default', () => {
  it('defaults to includeThoughts:true when the caller never sets the field', () => {
    const req: ChatRequest = {
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'hi' }],
      thinking: { type: 'enabled', budgetTokens: 4096 },
    };
    const out = translateChatRequest(req);
    expect(out.generationConfig?.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingBudget: 4096,
    });
  });

  it('omits the includeThoughts key entirely when the caller explicitly sets includeThoughts:false', () => {
    const req: ChatRequest = {
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'hi' }],
      thinking: { type: 'enabled', budgetTokens: 4096, includeThoughts: false },
    };
    const out = translateChatRequest(req);
    expect(out.generationConfig?.thinkingConfig).toEqual({ thinkingBudget: 4096 });
    expect(out.generationConfig?.thinkingConfig).not.toHaveProperty('includeThoughts');
  });

  it('respects includeThoughts:true explicitly (same as the default, but caller-asserted)', () => {
    const req: ChatRequest = {
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'hi' }],
      thinking: { type: 'enabled', includeThoughts: true },
    };
    const out = translateChatRequest(req);
    expect(out.generationConfig?.thinkingConfig).toEqual({ includeThoughts: true });
  });
});
