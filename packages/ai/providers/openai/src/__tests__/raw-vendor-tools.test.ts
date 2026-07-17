import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';
import { detectOpenAICompletionsCompat } from '@agiworkforce/provider-protocol';

const compat = detectOpenAICompletionsCompat({
  id: 'gpt-test',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
}).defaults;

describe('rawVendorTools passthrough (openai)', () => {
  it('appends a provider-native tool payload verbatim after translated tools', () => {
    // Not one of the Responses-API-only types below -- this is the "ordinary" vendor
    // tool passthrough path, still verbatim.
    const vendorTool = { type: 'some_future_native_tool' };
    const req: ChatRequest = {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'lookup', description: 'find', inputSchema: { type: 'object' } }],
      rawVendorTools: [vendorTool],
    };
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.tools).toHaveLength(2);
    expect(out.tools?.[1]).toEqual(vendorTool);
  });

  // web_search_preview / code_interpreter exist only on OpenAI's Responses API --
  // /chat/completions (what translateChatRequest targets) rejects them with HTTP 400.
  // apps/web/lib/llm-providers/openai.ts strips them for exactly this reason (see its
  // OPENAI_RESPONSES_ONLY_TOOL_TYPES); translateChatRequest must reproduce that or a
  // request with web search enabled goes from a legacy no-op to a hard failure.
  it('strips web_search_preview and code_interpreter for provider "openai"', () => {
    const req: ChatRequest = {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hi' }],
      rawVendorTools: [{ type: 'web_search_preview' }, { type: 'code_interpreter' }],
    };
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.tools).toBeUndefined();
  });

  it('keeps other vendor tools alongside a stripped one for provider "openai"', () => {
    const survivingTool = { type: 'some_future_native_tool' };
    const req: ChatRequest = {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'hi' }],
      rawVendorTools: [{ type: 'web_search_preview' }, survivingTool],
    };
    const out = translateChatRequest(req, { compat, provider: 'openai' });
    expect(out.tools).toEqual([survivingTool]);
  });

  it('does NOT strip web_search_preview for a compat provider (e.g. groq)', () => {
    // None of the 9 openai-compat providers' legacy files strip these types --
    // request-processor.ts only ever injects web_search_preview for provider ===
    // 'openai', so stripping it for other providers here would be an unverified
    // behavior change for consumers this migration hasn't audited.
    const req: ChatRequest = {
      model: 'some-groq-model',
      messages: [{ role: 'user', content: 'hi' }],
      rawVendorTools: [{ type: 'web_search_preview' }],
    };
    const out = translateChatRequest(req, { compat, provider: 'groq' });
    expect(out.tools).toEqual([{ type: 'web_search_preview' }]);
  });
});
