import { describe, expect, it } from 'vitest';
import type { OpenAIChatCompletionCreateParams } from '@agiworkforce/providers-openai';

import { applyOpenRouterProviderRouting } from '../provider-routing';

function buildParams(): OpenAIChatCompletionCreateParams {
  return {
    model: 'anthropic/example-model',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
  };
}

describe('applyOpenRouterProviderRouting', () => {
  it('does not set a provider field when neither config nor request metadata supply routing preferences (never forces ordering by default)', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(params, undefined, undefined);
    expect((params as unknown as { provider?: unknown }).provider).toBeUndefined();
  });

  it('denies data collection when the request carries the zero-retention requirement', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(params, undefined, undefined, true);
    expect((params as unknown as { provider?: unknown }).provider).toEqual({
      data_collection: 'deny',
    });
  });

  it('sends no provider field for a request without the zero-retention requirement', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(params, undefined, undefined, false);
    expect((params as unknown as { provider?: unknown }).provider).toBeUndefined();
  });

  it('overrides a caller preference to allow collection when the requirement is present', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(
      params,
      { dataCollection: 'allow' },
      { openRouterProviderRouting: { dataCollection: 'allow' } },
      true,
    );
    expect((params as unknown as { provider?: unknown }).provider).toEqual({
      data_collection: 'deny',
    });
  });

  it('applies the adapter-config default order, allow_fallbacks and data_collection', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(
      params,
      { order: ['anthropic', 'openai'], allowFallbacks: false, dataCollection: 'deny' },
      undefined,
    );
    expect((params as unknown as { provider?: unknown }).provider).toEqual({
      order: ['anthropic', 'openai'],
      allow_fallbacks: false,
      data_collection: 'deny',
    });
  });

  it('lets per-request metadata override the adapter-config default', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(
      params,
      { order: ['anthropic'], dataCollection: 'allow' },
      {
        openRouterProviderRouting: { order: ['together'], dataCollection: 'deny' },
      },
    );
    expect((params as unknown as { provider?: unknown }).provider).toEqual({
      order: ['together'],
      data_collection: 'deny',
    });
  });

  it('merges a request-metadata field that the config default did not set', () => {
    const params = buildParams();
    applyOpenRouterProviderRouting(
      params,
      { order: ['anthropic'] },
      {
        openRouterProviderRouting: { allowFallbacks: false },
      },
    );
    expect((params as unknown as { provider?: unknown }).provider).toEqual({
      order: ['anthropic'],
      allow_fallbacks: false,
    });
  });

  it('ignores malformed request metadata rather than throwing', () => {
    const params = buildParams();
    expect(() =>
      applyOpenRouterProviderRouting(params, undefined, {
        openRouterProviderRouting: { order: 'not-an-array', dataCollection: 'nope' },
      }),
    ).not.toThrow();
    expect((params as unknown as { provider?: unknown }).provider).toBeUndefined();
  });
});
