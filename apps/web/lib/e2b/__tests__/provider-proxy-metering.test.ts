import { describe, expect, it, vi } from 'vitest';

vi.mock('@agiworkforce/types', () => ({
  normalizeModelId: (model: string) => (model === 'alias-model' ? 'canonical-model' : null),
  resolveMaxOutputTokens: () => 4096,
}));

import {
  parseProviderProxyMeteredRequest,
  ProviderProxyRequestShapeError,
} from '@/lib/e2b/provider-proxy-metering';

describe('provider-proxy metered request parsing', () => {
  it('canonicalises the model the harness names', () => {
    const parsed = parseProviderProxyMeteredRequest(
      'anthropic_messages',
      JSON.stringify({ model: 'alias-model', messages: [] }),
    );
    expect(parsed.model).toBe('canonical-model');
    expect(parsed.requestedModel).toBe('alias-model');
  });

  it('keeps a provider-native id the catalogue does not canonicalise', () => {
    const parsed = parseProviderProxyMeteredRequest(
      'anthropic_messages',
      JSON.stringify({ model: 'vendor-native-id', messages: [] }),
    );
    expect(parsed.model).toBe('vendor-native-id');
  });

  it('scales the prompt estimate with the material the request actually carries', () => {
    const short = parseProviderProxyMeteredRequest(
      'anthropic_messages',
      JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
    );
    const long = parseProviderProxyMeteredRequest(
      'anthropic_messages',
      JSON.stringify({
        model: 'm',
        messages: [{ role: 'user', content: 'x'.repeat(4000) }],
      }),
    );
    expect(long.estimatedPromptTokens).toBeGreaterThan(short.estimatedPromptTokens + 900);
  });

  it('reads the declared output ceiling per endpoint and falls back to the model default', () => {
    const anthropic = parseProviderProxyMeteredRequest(
      'anthropic_messages',
      JSON.stringify({ model: 'm', max_tokens: 100 }),
    );
    const responses = parseProviderProxyMeteredRequest(
      'openai_responses',
      JSON.stringify({ model: 'm', max_output_tokens: 200 }),
    );
    const chat = parseProviderProxyMeteredRequest(
      'openai_chat_completions',
      JSON.stringify({ model: 'm', max_completion_tokens: 300 }),
    );
    const legacyChat = parseProviderProxyMeteredRequest(
      'openai_chat_completions',
      JSON.stringify({ model: 'm', max_tokens: 400 }),
    );
    const undeclared = parseProviderProxyMeteredRequest(
      'anthropic_messages',
      JSON.stringify({ model: 'm' }),
    );

    expect(anthropic.estimatedCompletionTokens).toBe(100);
    expect(responses.estimatedCompletionTokens).toBe(200);
    expect(chat.estimatedCompletionTokens).toBe(300);
    expect(legacyChat.estimatedCompletionTokens).toBe(400);
    expect(undeclared.estimatedCompletionTokens).toBe(4096);
  });

  it('charges an embeddings call for no output tokens', () => {
    const parsed = parseProviderProxyMeteredRequest(
      'openai_embeddings',
      JSON.stringify({ model: 'm', input: 'text' }),
    );
    expect(parsed.estimatedCompletionTokens).toBe(0);
  });

  it('opts a streamed chat completion into usage without disturbing any other body', () => {
    const streamed = parseProviderProxyMeteredRequest(
      'openai_chat_completions',
      JSON.stringify({ model: 'm', stream: true, stream_options: { other: 1 } }),
    );
    expect(JSON.parse(streamed.forwardBody)).toMatchObject({
      stream_options: { other: 1, include_usage: true },
    });

    const raw = JSON.stringify({ model: 'm', stream: false });
    expect(parseProviderProxyMeteredRequest('openai_chat_completions', raw).forwardBody).toBe(raw);
    const responsesRaw = JSON.stringify({ model: 'm', stream: true });
    expect(parseProviderProxyMeteredRequest('openai_responses', responsesRaw).forwardBody).toBe(
      responsesRaw,
    );
  });

  it('refuses a body it cannot price', () => {
    for (const body of ['not json', '[]', JSON.stringify({ messages: [] })]) {
      expect(() => parseProviderProxyMeteredRequest('anthropic_messages', body)).toThrow(
        ProviderProxyRequestShapeError,
      );
    }
    expect(() =>
      parseProviderProxyMeteredRequest('anthropic_messages', JSON.stringify({ model: '  ' })),
    ).toThrow(/names no model/);
  });
});
