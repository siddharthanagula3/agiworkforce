import { describe, expect, it } from 'vitest';
import type { OpenAIChatCompletionCreateParams } from '@agiworkforce/providers-openai';

import { applyVercelGatewayProviderOptions } from '../provider-options';

function buildParams(): OpenAIChatCompletionCreateParams {
  return {
    model: 'anthropic/claude-opus-5',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
  };
}

describe('applyVercelGatewayProviderOptions', () => {
  it('sends no providerOptions field on the wire when nothing is configured (never forces routing or caching by default)', () => {
    const params = buildParams();
    applyVercelGatewayProviderOptions(params, undefined, undefined);
    expect((params as unknown as { providerOptions?: unknown }).providerOptions).toBeUndefined();
  });

  it('applies the adapter-config default order, only, sort and caching under providerOptions.gateway', () => {
    const params = buildParams();
    applyVercelGatewayProviderOptions(
      params,
      {
        order: ['vertex', 'anthropic'],
        only: ['vertex', 'anthropic'],
        sort: 'cost',
        caching: 'auto',
      },
      undefined,
    );
    expect((params as unknown as { providerOptions?: unknown }).providerOptions).toEqual({
      gateway: {
        order: ['vertex', 'anthropic'],
        only: ['vertex', 'anthropic'],
        sort: 'cost',
        caching: 'auto',
      },
    });
  });

  it('lets per-request metadata override the adapter-config default', () => {
    const params = buildParams();
    applyVercelGatewayProviderOptions(
      params,
      { sort: 'cost' },
      {
        vercelGatewayProviderOptions: { sort: 'tps' },
      },
    );
    expect((params as unknown as { providerOptions?: unknown }).providerOptions).toEqual({
      gateway: { sort: 'tps' },
    });
  });

  it('merges a request-metadata field the config default did not set', () => {
    const params = buildParams();
    applyVercelGatewayProviderOptions(
      params,
      { caching: 'auto' },
      {
        vercelGatewayProviderOptions: { order: ['bedrock'] },
      },
    );
    expect((params as unknown as { providerOptions?: unknown }).providerOptions).toEqual({
      gateway: { order: ['bedrock'], caching: 'auto' },
    });
  });

  it('ignores malformed request metadata rather than throwing', () => {
    const params = buildParams();
    expect(() =>
      applyVercelGatewayProviderOptions(params, undefined, {
        vercelGatewayProviderOptions: { sort: 'not-a-metric', caching: 'always' },
      }),
    ).not.toThrow();
    expect((params as unknown as { providerOptions?: unknown }).providerOptions).toBeUndefined();
  });
});
