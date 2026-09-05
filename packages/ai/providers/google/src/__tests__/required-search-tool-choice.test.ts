import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';

const SEARCH_TOOL_NAME = 'web_search';

function request(overrides: Partial<ChatRequest>): ChatRequest {
  return {
    model: 'gemini-test',
    messages: [{ role: 'user', content: "Today's headline please" }],
    ...overrides,
  };
}

describe('required-search tool choice on the Gemini API', () => {
  it('allows only the search function when the turn requires a search', () => {
    const out = translateChatRequest(
      request({
        tools: [
          {
            name: SEARCH_TOOL_NAME,
            description: 'Search the web.',
            inputSchema: { type: 'object' },
          },
        ],
        toolChoice: { type: 'tool', name: SEARCH_TOOL_NAME },
      }),
    );

    expect(out.toolConfig).toEqual({
      functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [SEARCH_TOOL_NAME] },
    });
  });

  it('carries the built-in search tool without a tool config', () => {
    const out = translateChatRequest(request({ rawVendorTools: [{ google_search: {} }] }));

    expect(out.tools).toEqual([{ google_search: {} }]);
    expect(out.toolConfig).toBeUndefined();
  });
});
