/**
 * Regression tests for combining Gemini built-in tools with function calling.
 *
 * Live repro (2026-07-10, gemini-3.5-flash, Web search toggle + url_fetch):
 * a request carrying BOTH a built-in tool ({ google_search: {} } via
 * rawVendorTools) AND functionDeclarations fails with 400 INVALID_ARGUMENT
 * ("Please enable tool_config.include_server_side_tool_invocations to use
 * Built-in tools with Function calling."). The translate layer must set
 * `toolConfig.includeServerSideToolInvocations: true` for exactly that
 * combination — and ONLY that combination, so single-kind requests keep their
 * byte-identical bodies.
 */
import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

const FUNCTION_TOOL = {
  name: 'url_fetch',
  description: 'fetch a page',
  inputSchema: { type: 'object' as const, properties: { url: { type: 'string' } } },
};

describe('toolConfig.includeServerSideToolInvocations', () => {
  it('is set when built-in tools and functionDeclarations are combined', () => {
    const req: ChatRequest = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'read https://example.com' }],
      tools: [FUNCTION_TOOL],
      rawVendorTools: [{ google_search: {} }],
    };
    const out = translateChatRequest(req);
    expect(out.toolConfig).toEqual({ includeServerSideToolInvocations: true });
  });

  it('merges with a functionCallingConfig from toolChoice', () => {
    const req: ChatRequest = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'x' }],
      tools: [FUNCTION_TOOL],
      rawVendorTools: [{ google_search: {} }],
      toolChoice: 'auto',
    };
    const out = translateChatRequest(req);
    expect(out.toolConfig).toEqual({
      functionCallingConfig: { mode: 'AUTO' },
      includeServerSideToolInvocations: true,
    });
  });

  it('is absent for functionDeclarations-only requests (byte-stable)', () => {
    const out = translateChatRequest({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'x' }],
      tools: [FUNCTION_TOOL],
    });
    expect(out.toolConfig).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('includeServerSideToolInvocations');
  });

  it('is absent for built-in-only requests (byte-stable)', () => {
    const out = translateChatRequest({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'x' }],
      rawVendorTools: [{ google_search: {} }],
    });
    expect(out.toolConfig).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('includeServerSideToolInvocations');
  });

  it('replays assistant functionCall parts with the documented injected-call dummy signature', () => {
    // Gemini 3 400s on replayed functionCall parts without a thought
    // signature; the OpenAI-compat wire cannot carry the real one, so the
    // translate layer attaches the documented skip value for injected calls.
    const out = translateChatRequest({
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'read the page' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'url_fetch',
              input: { url: 'https://example.com/' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: 'call_1', content: 'page text' }],
        },
      ],
      tools: [FUNCTION_TOOL],
      rawVendorTools: [{ google_search: {} }],
    });
    const modelTurn = out.contents.find((c) => c.role === 'model');
    const fcPart = modelTurn?.parts.find((p) => p.functionCall);
    expect(fcPart?.thoughtSignature).toBe('skip_thought_signature_validator');
    // The paired functionResponse keeps the resolved function name.
    const responsePart = out.contents.flatMap((c) => c.parts).find((p) => p.functionResponse);
    expect(responsePart?.functionResponse?.name).toBe('url_fetch');
  });

  it('is absent for tool-free requests and keeps toolChoice-only configs unchanged', () => {
    const bare = translateChatRequest({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(bare.toolConfig).toBeUndefined();

    const choiceOnly = translateChatRequest({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'x' }],
      tools: [FUNCTION_TOOL],
      toolChoice: 'required',
    });
    expect(choiceOnly.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    expect(JSON.stringify(choiceOnly)).not.toContain('includeServerSideToolInvocations');
  });
});
