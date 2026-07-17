import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

function baseReq(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: 'claude-opus-4-8',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  };
}

describe('translateChatRequest · adaptive thinking', () => {
  it('maps {type: "adaptive"} straight through', () => {
    const out = translateChatRequest(baseReq({ thinking: { type: 'adaptive' } }));
    expect(out.thinking).toEqual({ type: 'adaptive' });
  });

  it('still maps enabled/disabled as before', () => {
    expect(
      translateChatRequest(baseReq({ thinking: { type: 'enabled', budgetTokens: 16384 } }))
        .thinking,
    ).toEqual({ type: 'enabled', budget_tokens: 16384 });
    expect(translateChatRequest(baseReq({ thinking: { type: 'disabled' } })).thinking).toEqual({
      type: 'disabled',
    });
  });

  it('omits thinking entirely when unset', () => {
    expect(translateChatRequest(baseReq()).thinking).toBeUndefined();
  });
});

describe('translateChatRequest · effort / output_config', () => {
  it('sends output_config.effort when effort is set', () => {
    const out = translateChatRequest(baseReq({ effort: 'high' }));
    expect(out.output_config).toEqual({ effort: 'high' });
  });

  it('sends thinking AND output_config independently when both are set', () => {
    const out = translateChatRequest(
      baseReq({ thinking: { type: 'enabled', budgetTokens: 32768 }, effort: 'high' }),
    );
    expect(out.thinking).toEqual({ type: 'enabled', budget_tokens: 32768 });
    expect(out.output_config).toEqual({ effort: 'high' });
  });

  it('omits output_config entirely when effort is unset', () => {
    const out = translateChatRequest(baseReq());
    expect(out.output_config).toBeUndefined();
  });
});
