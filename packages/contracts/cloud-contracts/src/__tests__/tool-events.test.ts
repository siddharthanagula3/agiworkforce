
import { describe, expect, it } from 'vitest';
import {
  ToolStatusPayloadSchema,
  parseToolStatusDelta,
  parseToolApprovalRequestDelta,
  parseToolResultDelta,
  SearchResultSourceSchema,
  parseSearchResultsDelta,
} from '../tool-events';

describe('ToolStatusPayloadSchema / parseToolStatusDelta', () => {
  it('accepts a running mcp_tool_use event with status_phrase and args (tool-loop.ts:239-251)', () => {
    const payload = {
      type: 'mcp_tool_use',
      name: 'github.search_issues',
      status: 'running',
      status_phrase: 'Searching issues',
      args: { query: 'is:open' },
    };
    expect(ToolStatusPayloadSchema.safeParse(payload).success).toBe(true);
    expect(parseToolStatusDelta(payload)).toEqual(payload);
  });

  it('accepts a completed/failed event without status_phrase or args', () => {
    const payload = { type: 'mcp_tool_use', name: 'github.search_issues', status: 'completed' };
    expect(parseToolStatusDelta(payload)).toEqual(payload);
  });

  it('accepts the server_tool_use variant emitted by stream-transform.ts (different status vocabulary)', () => {
    const payload = { type: 'server_tool_use', name: 'web_search', status: 'searching' };
    expect(parseToolStatusDelta(payload)).toEqual(payload);
  });

  it('returns null for a payload missing required fields', () => {
    expect(parseToolStatusDelta({ type: 'mcp_tool_use', status: 'running' })).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(parseToolStatusDelta(undefined)).toBeNull();
    expect(parseToolStatusDelta(null)).toBeNull();
    expect(parseToolStatusDelta('x')).toBeNull();
  });
});

describe('ToolApprovalRequestPayloadSchema / parseToolApprovalRequestDelta', () => {
  const payload = {
    tool_call_id: 'call_1',
    name: 'github.create_issue',
    args: { title: 'Bug' },
  };

  it('accepts the server wire shape (tool-loop.ts:275-283)', () => {
    expect(parseToolApprovalRequestDelta(payload)).toEqual(payload);
  });

  it('returns null when tool_call_id is missing', () => {
    const { tool_call_id: _omitted, ...rest } = payload;
    expect(parseToolApprovalRequestDelta(rest)).toBeNull();
  });

  it('returns null when args is not an object', () => {
    expect(parseToolApprovalRequestDelta({ ...payload, args: 'nope' })).toBeNull();
  });
});

describe('ToolResultPayloadSchema / parseToolResultDelta', () => {
  const payload = {
    tool_call_id: 'call_1',
    name: 'github.create_issue',
    content: 'Created issue #42',
    is_error: false,
  };

  it('accepts the server wire shape (tool-loop.ts:327-332)', () => {
    expect(parseToolResultDelta(payload)).toEqual(payload);
  });

  it('accepts an error result', () => {
    const errorPayload = { ...payload, content: 'API rate limited', is_error: true };
    expect(parseToolResultDelta(errorPayload)).toEqual(errorPayload);
  });

  it('returns null when is_error is missing', () => {
    const { is_error: _omitted, ...rest } = payload;
    expect(parseToolResultDelta(rest)).toBeNull();
  });
});

describe('SearchResultSourceSchema / parseSearchResultsDelta', () => {
  const urlFetchDelta = {
    tool: 'url_fetch',
    content: [
      { type: 'web_search_result', url: 'https://example.com', title: 'Example', position: 1 },
    ],
  };

  const webSearchDelta = {
    content: [
      {
        type: 'web_search_result',
        url: 'https://example.com/a',
        title: 'A',
        encrypted_content: 'snippet a',
        position: 1,
      },
      {
        type: 'web_search_result',
        url: 'https://example.com/b',
        title: 'B',
        encrypted_content: 'snippet b',
        position: 2,
      },
    ],
  };

  it('parses the tool-loop.ts url_fetch shape (tool-loop.ts:365-373), preserving the tool field', () => {
    const parsed = parseSearchResultsDelta(urlFetchDelta);
    expect(parsed).toEqual({ tool: 'url_fetch', sources: urlFetchDelta.content });
  });

  it('parses the research-loop.ts web_search shape (research-loop.ts:217-226), tool undefined', () => {
    const parsed = parseSearchResultsDelta(webSearchDelta);
    expect(parsed).toEqual({ tool: undefined, sources: webSearchDelta.content });
  });

  it('salvages valid sources and drops malformed entries', () => {
    const parsed = parseSearchResultsDelta({
      content: [webSearchDelta.content[0], { type: 'web_search_result' }, null, 'nope'],
    });
    expect(parsed?.sources).toEqual([webSearchDelta.content[0]]);
  });

  it('returns { sources: [] } when content is absent', () => {
    expect(parseSearchResultsDelta({ tool: 'url_fetch' })).toEqual({
      tool: 'url_fetch',
      sources: [],
    });
  });

  it('returns null for the raw Anthropic error passthrough shape (content is an object, not an array)', () => {
    expect(
      parseSearchResultsDelta({
        content: { type: 'web_search_tool_result_error', error_code: 'unavailable' },
      }),
    ).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(parseSearchResultsDelta(undefined)).toBeNull();
    expect(parseSearchResultsDelta('x')).toBeNull();
  });

  it('SearchResultSourceSchema rejects a source missing url', () => {
    const { url: _omitted, ...rest } = webSearchDelta.content[0]!;
    expect(SearchResultSourceSchema.safeParse(rest).success).toBe(false);
  });
});
