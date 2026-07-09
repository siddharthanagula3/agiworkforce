import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';
import { detectOpenAICompletionsCompat } from '@agiworkforce/llm-normalize';

const compat = detectOpenAICompletionsCompat({
  id: 'gpt-test',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
}).defaults;

describe('rawVendorTools passthrough (openai)', () => {
  it('appends provider-native tool payloads verbatim after translated tools', () => {
    const vendorTool = { type: 'web_search_preview' };
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
});
