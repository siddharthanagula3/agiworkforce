import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { getModelMetadataById } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

function baseReq(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: 'claude-opus-5',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  };
}

const OPUS_CEILING = getModelMetadataById('claude-opus-5')?.maxOutputTokens;

describe('translateChatRequest · max_tokens', () => {
  it('keeps a request inside the ceiling the registry records for the model', () => {
    expect(OPUS_CEILING).toBeTypeOf('number');
    const out = translateChatRequest(
      baseReq({ maxOutputTokens: (OPUS_CEILING as number) + 100_000 }),
    );
    expect(out.max_tokens).toBe(OPUS_CEILING);
  });

  it('passes a request through untouched when it fits', () => {
    expect(translateChatRequest(baseReq({ maxOutputTokens: 4096 })).max_tokens).toBe(4096);
  });

  it('falls back to the conservative default when the caller sets nothing', () => {
    expect(translateChatRequest(baseReq()).max_tokens).toBe(8192);
  });

  it('leaves the default alone for a model the registry does not describe', () => {
    expect(getModelMetadataById('claude-not-in-the-registry')).toBeNull();
    expect(
      translateChatRequest(
        baseReq({ model: 'claude-not-in-the-registry', maxOutputTokens: 64_000 }),
      ).max_tokens,
    ).toBe(64_000);
  });
});
