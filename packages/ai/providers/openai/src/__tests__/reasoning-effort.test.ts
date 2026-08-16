import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

const compat = detectOpenAICompletionsCompat({
  id: 'gpt-test',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
}).defaults;

function baseReq(overrides: Partial<ChatRequest>): ChatRequest {
  return {
    model: 'gpt-test',
    messages: [{ role: 'user', content: 'hi' }],
    ...overrides,
  };
}

describe('translateChatRequest reasoning_effort · explicit effort bypass', () => {
  it('uses req.effort directly, bypassing the budgetTokens-derived heuristic', () => {
    const req = baseReq({
      effort: 'medium',
      thinking: { type: 'enabled', budgetTokens: 16384 },
    });
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.reasoning_effort).toBe('medium');
  });

  it('falls back to the budgetTokens heuristic when req.effort is absent', () => {
    const req = baseReq({ thinking: { type: 'enabled', budgetTokens: 20000 } });
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.reasoning_effort).toBe('high');
  });

  it('sets no reasoning_effort when neither effort nor thinking is present', () => {
    const req = baseReq({});
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.reasoning_effort).toBeUndefined();
  });
});

describe('translateChatRequest reasoning_effort · hasTools gate (provider "openai" only)', () => {
  it('omits reasoning_effort when function tools are present, for provider "openai"', () => {
    const req = baseReq({
      effort: 'high',
      tools: [{ name: 'lookup', description: 'find', inputSchema: { type: 'object' } }],
    });
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.reasoning_effort).toBeUndefined();
  });

  it('omits reasoning_effort when the only "tool" is a Responses-only type that gets stripped to zero', () => {
    const req = baseReq({
      effort: 'high',
      rawVendorTools: [{ type: 'web_search_preview' }],
    });
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.tools).toBeUndefined();
    expect(out.reasoning_effort).toBeUndefined();
  });

  it('does NOT omit reasoning_effort for a compat provider even with tools present', () => {
    const req = baseReq({
      model: 'some-groq-model',
      effort: 'high',
      tools: [{ name: 'lookup', description: 'find', inputSchema: { type: 'object' } }],
    });
    const out = translateChatRequest(req, { compat, provider: 'groq' });
    expect(out.reasoning_effort).toBe('high');
  });
});
