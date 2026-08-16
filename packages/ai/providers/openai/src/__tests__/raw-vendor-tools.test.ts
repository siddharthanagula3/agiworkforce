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
    const req: ChatRequest = {
      model: 'some-groq-model',
      messages: [{ role: 'user', content: 'hi' }],
      rawVendorTools: [{ type: 'web_search_preview' }],
    };
    const out = translateChatRequest(req, { compat, provider: 'groq' });
    expect(out.tools).toEqual([{ type: 'web_search_preview' }]);
  });
});
