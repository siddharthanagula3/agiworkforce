import { describe, expect, it, vi } from 'vitest';

import {
  createVercelGatewayEvaluator,
  VercelGatewayEvaluationError,
  type EvaluationQuestions,
} from './evaluation';

const QUESTIONS = {
  depth: {
    type: 'choice',
    instructions: 'Choose the depth.',
    criteria: { short: 'Short.', normal: 'Normal.' },
  },
  explain: {
    type: 'boolean',
    instructions: 'Is an explanation needed?',
  },
} as const satisfies EvaluationQuestions;

const VALID_RESPONSE = {
  model: 'evaluation-model',
  answers: {
    depth: { type: 'choice', choice: 'short', probabilities: { short: 0.9, normal: 0.1 } },
    explain: { type: 'boolean', probability: 0.2 },
  },
  usage: { inputTokens: 120, outputTokens: 14 },
  providerMetadata: {
    gateway: {
      routing: { resolvedProvider: 'evaluation-provider' },
      cost: '0.0000124',
      generationId: 'gen_test',
    },
  },
};

describe('Vercel Gateway evaluation', () => {
  it('sends one native evaluation request and retains sub-cent cost', async () => {
    const fetcher = vi.fn(async () => Response.json(VALID_RESPONSE));
    const evaluator = createVercelGatewayEvaluator({ apiKey: 'secret', fetch: fetcher });
    const result = await evaluator.evaluate({
      model: 'evaluation-model',
      state: { message: 'Status?' },
      questions: QUESTIONS,
      providerOptions: { gateway: { only: ['evaluation-provider'] } },
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/evaluate');
    expect(init.headers).toEqual({
      authorization: 'Bearer secret',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'evaluation-model',
      questions: QUESTIONS,
      providerOptions: { gateway: { only: ['evaluation-provider'] } },
    });
    expect(result).toMatchObject({
      usage: { inputTokens: 120, outputTokens: 14 },
      resolvedProvider: 'evaluation-provider',
      generationId: 'gen_test',
      providerCostMicrousd: 12,
    });
  });

  it('passes cancellation to fetch', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      throw init?.signal?.reason;
    });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const evaluator = createVercelGatewayEvaluator({ apiKey: 'secret', fetch: fetcher });
    await expect(
      evaluator.evaluate({
        model: 'evaluation-model',
        state: 'state',
        questions: QUESTIONS,
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
  });

  it('does not expose an HTTP response body', async () => {
    const fetcher = vi.fn(async () => new Response('credential=private', { status: 429 }));
    const evaluator = createVercelGatewayEvaluator({ apiKey: 'secret', fetch: fetcher });
    const error = await evaluator
      .evaluate({ model: 'evaluation-model', state: 'state', questions: QUESTIONS })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VercelGatewayEvaluationError);
    expect(String(error)).not.toContain('private');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    {
      ...VALID_RESPONSE,
      answers: { ...VALID_RESPONSE.answers, extra: { type: 'boolean', probability: 1 } },
    },
    { ...VALID_RESPONSE, answers: { explain: VALID_RESPONSE.answers.explain } },
    {
      ...VALID_RESPONSE,
      answers: {
        ...VALID_RESPONSE.answers,
        depth: { type: 'choice', choice: 'invented', probabilities: { short: 0.9, normal: 0.1 } },
      },
    },
    { ...VALID_RESPONSE, usage: { inputTokens: -1, outputTokens: 2 } },
  ])('rejects malformed answer contracts', async (payload) => {
    const evaluator = createVercelGatewayEvaluator({
      apiKey: 'secret',
      fetch: vi.fn(async () => Response.json(payload)),
    });
    await expect(
      evaluator.evaluate({ model: 'evaluation-model', state: 'state', questions: QUESTIONS }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
