import { describe, expect, it } from 'vitest';
import {
  resolveBundledOpenAIResponsesEndpointClass,
  resolveProviderRequestCapabilities,
} from '../index';

describe('banned provider policy', () => {
  it.each(['https://api.cerebras.ai/v1', 'https://example-resource.openai.azure.com/openai/v1'])(
    'does not classify %s as a bundled provider endpoint',
    (baseUrl) => {
      expect(resolveBundledOpenAIResponsesEndpointClass(baseUrl)).toBe('custom');
    },
  );

  it('does not grant Azure OpenAI native Responses capabilities', () => {
    expect(
      resolveProviderRequestCapabilities({
        provider: 'azure-openai',
        api: 'azure-openai-responses',
        baseUrl: 'https://example-resource.openai.azure.com/openai/v1',
      }),
    ).toMatchObject({
      endpointClass: 'custom',
      usesKnownNativeOpenAIEndpoint: false,
      usesKnownNativeOpenAIRoute: false,
      allowsResponsesStore: false,
    });
  });
});
