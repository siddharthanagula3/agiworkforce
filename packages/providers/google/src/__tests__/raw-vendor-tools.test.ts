import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

describe('rawVendorTools passthrough (google)', () => {
  it('appends native GeminiTool entries after functionDeclarations', () => {
    const req: ChatRequest = {
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'lookup', description: 'find', inputSchema: { type: 'object' } }],
      rawVendorTools: [{ google_search: {} }],
    };
    const out = translateChatRequest(req);
    expect(out.tools).toHaveLength(2);
    expect(out.tools?.[1]).toEqual({ google_search: {} });
  });

  it('emits only vendor tools when no ToolDefs given', () => {
    const out = translateChatRequest({
      model: 'gemini-test',
      messages: [{ role: 'user', content: 'x' }],
      rawVendorTools: [{ google_search: {} }],
    });
    expect(out.tools).toEqual([{ google_search: {} }]);
  });
});
