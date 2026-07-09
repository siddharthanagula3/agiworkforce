/**
 * Adapter contract test: createMistralAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction.
 */

import { describe, expect, it } from 'vitest';
import { detectOpenAICompletionsCompat } from '@agiworkforce/llm-normalize';
import { translateChatRequest } from '@agiworkforce/providers-openai';

import { createMistralAdapter } from '../index';

describe('createMistralAdapter', () => {
  it('returns adapter with id="mistral" and label="Mistral AI"', () => {
    const adapter = createMistralAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('mistral');
    expect(adapter.label).toBe('Mistral AI');
  });

  it('declares an api-key auth method with envVar MISTRAL_API_KEY', () => {
    const adapter = createMistralAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('MISTRAL_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createMistralAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('mistral');
    }
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createMistralAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });
});

describe('mistral compat detection (max_tokens quirk)', () => {
  it('resolves maxTokensField to "max_tokens" (not "max_completion_tokens") for mistral', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      id: 'mistral-large-2512',
    });
    expect(detected.defaults.maxTokensField).toBe('max_tokens');
    expect(detected.defaults.supportsStore).toBe(false);
    expect(detected.defaults.supportsReasoningEffort).toBe(false);
  });

  it('translateChatRequest emits max_tokens (not max_completion_tokens) for a mistral request', () => {
    const detected = detectOpenAICompletionsCompat({
      provider: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      id: 'mistral-large-2512',
    });
    const params = translateChatRequest(
      {
        model: 'mistral-large-2512',
        messages: [{ role: 'user', content: 'hi' }],
        maxOutputTokens: 512,
      },
      { compat: detected.defaults, provider: 'mistral' },
    );
    expect(params.max_tokens).toBe(512);
    expect(params.max_completion_tokens).toBeUndefined();
  });
});
