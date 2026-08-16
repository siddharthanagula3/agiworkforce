import { describe, expect, it } from 'vitest';

import {
  anthropicResponder,
  extractResponse,
  readModelCatalog,
  resolveAnthropicModel,
} from '../src/anthropic';
import type { EvalCase } from '../src/types';

const evalCase: EvalCase = {
  id: 'golden/example',
  family: 'reasoning',
  risk: 'low',
  expected: 'answer',
  prompt: 'What is 17 multiplied by 23? Reply with the number only.',
  checks: [{ kind: 'includesAny', values: ['391'] }],
};

const catalog = {
  providers: { anthropic: { defaultModel: 'fixture-model' } },
  models: { 'fixture-model': { provider: 'anthropic', apiModelId: 'fixture-wire-model' } },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('resolveAnthropicModel', () => {
  it('resolves the catalog default', () => {
    expect(resolveAnthropicModel(catalog)).toEqual({
      id: 'fixture-model',
      apiModelId: 'fixture-wire-model',
    });
  });

  it('resolves against the committed model catalog', () => {
    const resolved = resolveAnthropicModel(readModelCatalog());
    expect(resolved.apiModelId.length).toBeGreaterThan(0);
  });

  it('refuses a catalog it cannot read a model out of', () => {
    expect(() => resolveAnthropicModel(null)).toThrow(/not an object/);
    expect(() => resolveAnthropicModel({ models: {} })).toThrow(/defaultModel/);
    expect(() => resolveAnthropicModel({ ...catalog, models: {} })).toThrow(
      /no models\.fixture-model/,
    );
    expect(() =>
      resolveAnthropicModel({
        ...catalog,
        models: { 'fixture-model': { provider: 'openai', apiModelId: 'x' } },
      }),
    ).toThrow(/not an anthropic model/);
    expect(() =>
      resolveAnthropicModel({ ...catalog, models: { 'fixture-model': { provider: 'anthropic' } } }),
    ).toThrow(/apiModelId/);
  });
});

describe('extractResponse', () => {
  it('joins the text blocks and keeps the stop reason', () => {
    expect(
      extractResponse({
        content: [
          { type: 'text', text: '39' },
          { type: 'thinking', thinking: 'ignored' },
          { type: 'text', text: '1' },
        ],
        stop_reason: 'end_turn',
      }),
    ).toEqual({ text: '391', stopReason: 'end_turn' });
  });

  it('survives a payload with nothing usable in it', () => {
    expect(extractResponse({})).toEqual({ text: '' });
    expect(extractResponse(null)).toEqual({ text: '' });
    expect(extractResponse({ content: 'not-a-list' })).toEqual({ text: '' });
  });

  it('keeps a refusal stop with no text, which the grader reads as a refusal', () => {
    expect(extractResponse({ content: [], stop_reason: 'refusal' })).toEqual({
      text: '',
      stopReason: 'refusal',
    });
  });
});

describe('anthropicResponder', () => {
  it('sends one Messages request carrying the resolved model and the prompt', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const respond = anthropicResponder({
      apiKey: 'test-key',
      apiModelId: 'fixture-wire-model',
      maxOutputTokens: 64,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse({ content: [{ type: 'text', text: '391' }], stop_reason: 'end_turn' });
      },
    });

    expect(await respond(evalCase)).toEqual({ text: '391', stopReason: 'end_turn' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);

    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      model: 'fixture-wire-model',
      max_tokens: 64,
      messages: [{ role: 'user', content: evalCase.prompt }],
    });
  });

  it('fails the run on a provider error instead of scoring an empty answer', async () => {
    const respond = anthropicResponder({
      apiKey: 'test-key',
      apiModelId: 'fixture-wire-model',
      fetchImpl: async () => jsonResponse({ error: { message: 'overloaded' } }, 529),
    });
    await expect(respond(evalCase)).rejects.toThrow(/anthropic 529 for golden\/example/);
  });

  it('refuses to build without a key', () => {
    expect(() => anthropicResponder({ apiKey: '', apiModelId: 'fixture-wire-model' })).toThrow(
      /requires an API key/,
    );
  });
});
