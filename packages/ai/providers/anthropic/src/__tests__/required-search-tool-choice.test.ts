import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';

const SEARCH_TOOL_NAME = 'web_search';

const NATIVE_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: SEARCH_TOOL_NAME,
  allowed_callers: ['direct'],
};

function request(overrides: Partial<ChatRequest>): ChatRequest {
  return {
    model: 'claude-test',
    messages: [{ role: 'user', content: "Today's headline please" }],
    ...overrides,
  };
}

describe('required-search tool choice on the Messages API', () => {
  it('names a platform-executed search function in the tool choice', () => {
    const out = translateChatRequest(
      request({
        tools: [{ name: SEARCH_TOOL_NAME, description: 'Search the web.', inputSchema: {} }],
        toolChoice: { type: 'tool', name: SEARCH_TOOL_NAME },
      }),
    );

    expect(out.tool_choice).toEqual({ type: 'tool', name: SEARCH_TOOL_NAME });
  });

  it('carries the native server tool without a tool choice', () => {
    const out = translateChatRequest(request({ rawVendorTools: [NATIVE_SEARCH_TOOL] }));

    expect(out.tools).toEqual([NATIVE_SEARCH_TOOL]);
    expect(out.tool_choice).toBeUndefined();
  });
});
