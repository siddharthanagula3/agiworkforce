import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

describe('rawVendorTools passthrough (anthropic)', () => {
  it('appends provider-native tool payloads verbatim after translated tools', () => {
    const vendorTool = {
      type: 'web_search_20260209',
      name: 'web_search',
      allowed_callers: ['direct'],
    };
    const req: ChatRequest = {
      model: 'claude-test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'lookup', description: 'find', inputSchema: { type: 'object' } }],
      rawVendorTools: [vendorTool],
    };
    const out = translateChatRequest(req);
    expect(out.tools).toHaveLength(2);
    expect(out.tools?.[0]).toMatchObject({ name: 'lookup' });
    expect(out.tools?.[1]).toEqual(vendorTool);
  });

  it('omits tools entirely when neither tools nor rawVendorTools present', () => {
    const out = translateChatRequest({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(out.tools).toBeUndefined();
  });
});
