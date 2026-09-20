import { describe, expect, it, vi } from 'vitest';
import { createTypeSafeDecisionProvider } from '../typesafe-decisions';

const config = {
  apiKey: 'synthetic-test-key',
  baseURL: 'https://decision.example',
  model: 'test-version',
  timeoutMs: 100,
  maxRetries: 0,
};

describe('TypeSafe adapter', () => {
  it('batches all primitive types and preserves distributions and usage', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: config.model,
            usage: { input_tokens: 100, output_tokens: 10 },
            answers: {
              category: {
                type: 'choice',
                choice: 'a',
                confidence: 0.8,
                probabilities: { a: 0.9, b: 0.1 },
              },
              relevant: { type: 'noul', noul: 0.8 },
              severity: {
                type: 'score',
                score: 0.3,
                confidence: 0.4,
                probabilities: { '0': 0.7, '1': 0.3 },
                legend: { '0': 'Low', '1': 'High' },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const provider = createTypeSafeDecisionProvider({ ...config, fetch });
    const result = await provider.evaluate(
      {
        state: 'synthetic text',
        questions: {
          category: { kind: 'choice', instruction: 'Which?', options: { a: 'A', b: 'B' } },
          relevant: { kind: 'boolean', instruction: 'Relevant?' },
          severity: { kind: 'score', instruction: 'Severity?', levels: ['Low', 'High'] },
        },
      },
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://decision.example/v1/systemone');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: config.model,
      questions: {
        category: { type: 'choice' },
        relevant: { type: 'noul' },
        severity: { type: 'score', criteria: ['Low', 'High'] },
      },
    });
    expect(result).toMatchObject({
      inputTokens: 100,
      outputTokens: 10,
      answers: { relevant: { kind: 'boolean', probability: 0.8 }, severity: { value: 0.3 } },
    });
  });
  it.each([401, 422, 429, 500, 529])(
    'does not retry status %s or log provider bodies',
    async (status) => {
      const fetch = vi.fn(
        async () => new Response('{"error":{"message":"private body"}}', { status }),
      );
      const provider = createTypeSafeDecisionProvider({ ...config, fetch });
      await expect(
        provider.evaluate(
          { state: 'synthetic', questions: { a: { kind: 'boolean', instruction: 'Yes?' } } },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
