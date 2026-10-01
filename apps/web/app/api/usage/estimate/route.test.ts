// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  chargeCreditsForMicrousd,
  listChatModels,
  requireProviderDefaultModel,
  resolveMaxOutputTokens,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/server/rls-db');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/cors');

const mocks = vi.hoisted(() => ({ userScopedDb: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getUserScopedDb: (...args: unknown[]) => mocks.userScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimitHandler: (handler: unknown) => handler,
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: (handler: unknown) => handler,
}));

import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { IpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { POST } from './route';

const MODEL = requireProviderDefaultModel('openai');
function requireUnpricedChatModel(): string {
  const model = listChatModels().find((entry) => entry.inputCost === 0 && entry.outputCost === 0);
  if (!model) throw new Error('The catalog lists no unpriced chat model to refuse.');
  return model.id;
}

const UNPRICED_MODEL = requireUnpricedChatModel();

function estimate(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/usage/estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function estimated(body: unknown) {
  const response = await POST(estimate(body));
  expect(response.status).toBe(200);
  return (await response.json()) as {
    object: string;
    model: string;
    input_tokens: number;
    max_output_tokens: number;
    credits: { min: number; max: number };
  };
}

const MESSAGES = [
  { role: 'system', content: 'You answer briefly.' },
  { role: 'user', content: 'Summarise the attached quarterly report in three bullet points.' },
];

beforeEach(() => {
  mocks.userScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
});

describe('POST /api/usage/estimate', () => {
  it('prices the prompt alone as the floor and the prompt with the full reply as the ceiling', async () => {
    const response = await POST(estimate({ model: MODEL, messages: MESSAGES, max_tokens: 800 }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({ object: 'usage.estimate', model: MODEL, max_output_tokens: 800 });
    expect(body.input_tokens).toBeGreaterThan(0);
    expect(body.credits).toEqual({
      min: chargeCreditsForMicrousd(
        LLMCostCalculator.estimateListCostMicrousd(MODEL, body.input_tokens, 0) as number,
      ),
      max: chargeCreditsForMicrousd(
        LLMCostCalculator.estimateListCostMicrousd(MODEL, body.input_tokens, 800) as number,
      ),
    });
    expect(body.credits.max).toBeGreaterThan(body.credits.min);
    expect(JSON.stringify(body)).not.toMatch(/usd|cents|\$/iu);
    expect(mocks.userScopedDb).toHaveBeenCalledWith(expect.anything(), {
      apiKeyScope: 'usage:read',
    });
  });

  it('bounds the reply by the model output limit when the body sets none', async () => {
    const body = await estimated({ model: MODEL, messages: MESSAGES });

    expect(body.max_output_tokens).toBe(resolveMaxOutputTokens(MODEL));
  });

  it('counts only the text parts of a message', async () => {
    const plain = await estimated({
      model: MODEL,
      messages: [{ role: 'user', content: 'Describe this chart.' }],
    });
    const parts = await estimated({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this chart.' },
            { type: 'image_url', image_url: { url: 'https://example.com/chart.png' } },
          ],
        },
      ],
    });

    expect(parts.input_tokens).toBe(plain.input_tokens);
  });

  it('counts tool definitions as prompt input', async () => {
    const without = await estimated({ model: MODEL, messages: MESSAGES });
    const withTools = await estimated({
      model: MODEL,
      messages: MESSAGES,
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_order',
            description: 'Find an order by its number and return its status and items.',
            parameters: { type: 'object', properties: { number: { type: 'string' } } },
          },
        },
      ],
    });

    expect(withTools.input_tokens).toBeGreaterThan(without.input_tokens);
    expect(withTools.credits.min).toBeGreaterThanOrEqual(without.credits.min);
  });

  it('refuses a model the catalogue does not know', async () => {
    const response = await POST(estimate({ model: 'not-a-model', messages: MESSAGES }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('Unknown model: not-a-model');
  });

  it('refuses a model whose price is known only after its route resolves', async () => {
    const response = await POST(estimate({ model: UNPRICED_MODEL, messages: MESSAGES }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('has no published per-token price');
  });

  it.each([
    ['no messages', { model: MODEL, messages: [] }],
    ['no model', { messages: MESSAGES }],
    [
      'a reply bound that is not a positive whole number',
      { model: MODEL, messages: MESSAGES, max_tokens: 0 },
    ],
  ])('refuses a body with %s', async (_case, body) => {
    const response = await POST(estimate(body));

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(
      'An estimate takes a chat completions body',
    );
  });

  it('refuses a body that is not JSON', async () => {
    const response = await POST(estimate('{"model":'));

    expect(response.status).toBe(400);
  });

  it('refuses a caller who is not signed in without saying why the session failed', async () => {
    mocks.userScopedDb.mockRejectedValue(new Error('jwt expired at 10:02'));

    const response = await POST(estimate({ model: MODEL, messages: MESSAGES }));

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('jwt expired');
  });

  it.each([
    [
      'an API key without the usage read scope',
      new ApiKeyScopeError('API key does not have the required scope'),
    ],
    [
      'a workspace that requires MFA',
      new MfaRequiredError('Multi-factor authentication is required'),
    ],
    ['an address outside the workspace allow list', new IpNotAllowedError()],
  ])(
    'passes through the refusal for %s rather than reporting a sign-in problem',
    async (_case, error) => {
      mocks.userScopedDb.mockRejectedValue(error);

      const response = await POST(estimate({ model: MODEL, messages: MESSAGES }));

      expect(response.status).toBe(403);
    },
  );
});
