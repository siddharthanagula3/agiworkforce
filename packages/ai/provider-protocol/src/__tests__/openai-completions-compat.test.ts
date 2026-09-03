import { describe, expect, it } from 'vitest';

import { detectOpenAICompletionsCompat } from '../openai-completions-compat';

const STREAMING_USAGE_FIXTURES: ReadonlyArray<{
  provider: string;
  baseUrl: string;
}> = [
  { provider: 'deepseek', baseUrl: 'https://api.deepseek.com' },
  { provider: 'xai', baseUrl: 'https://api.x.ai/v1' },
  { provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { provider: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { provider: 'zhipu', baseUrl: 'https://api.z.ai/v1' },
  { provider: 'minimax', baseUrl: 'https://api.minimax.io/v1' },
  { provider: 'perplexity', baseUrl: 'https://api.perplexity.ai' },
];

const UNAFFECTED_NON_STANDARD_FIXTURES: ReadonlyArray<{
  provider: string;
  baseUrl: string;
}> = [
  { provider: 'chutes', baseUrl: 'https://llm.chutes.ai/v1' },
  { provider: 'mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { provider: 'opencode', baseUrl: 'https://opencode.ai/zen/v1' },
];

describe('detectOpenAICompletionsCompat · streaming usage', () => {
  it.each(STREAMING_USAGE_FIXTURES)(
    'requests streaming usage for $provider at $baseUrl',
    ({ provider, baseUrl }) => {
      const detected = detectOpenAICompletionsCompat({ provider, baseUrl });
      expect(detected.defaults.supportsUsageInStreaming).toBe(true);
    },
  );

  it.each(UNAFFECTED_NON_STANDARD_FIXTURES)(
    'leaves unconfirmed non-standard host $provider at $baseUrl requesting no streaming usage',
    ({ provider, baseUrl }) => {
      const detected = detectOpenAICompletionsCompat({ provider, baseUrl });
      expect(detected.defaults.supportsUsageInStreaming).toBe(false);
    },
  );

  it('does not grant an arbitrary unrecognized custom proxy streaming usage by host alone', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'some-unlisted-vendor',
      baseUrl: 'https://llm.example.com/v1',
    });
    expect(detected.defaults.supportsUsageInStreaming).toBe(false);
  });

  it('does not change deepseek supportsStore/supportsStrictMode (still non-standard for those)', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
    });
    expect(detected.defaults.supportsStore).toBe(false);
    expect(detected.defaults.supportsStrictMode).toBe(false);
  });

  it('does not change xai supportsReasoningEffort (still disabled for xai-native)', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'xai',
      baseUrl: 'https://api.x.ai/v1',
    });
    expect(detected.defaults.supportsReasoningEffort).toBe(false);
  });
});
