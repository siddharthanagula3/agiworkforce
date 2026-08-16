import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

const FUNCTION_TOOL = {
  name: 'url_fetch',
  description: 'fetch a page',
  inputSchema: { type: 'object' as const, properties: { url: { type: 'string' } } },
};

describe('toolConfig.includeServerSideToolInvocations', () => {
  it('is set when built-in tools and functionDeclarations are combined', () => {
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'read https://example.com' }],
      tools: [FUNCTION_TOOL],
      rawVendorTools: [{ google_search: {} }],
    };
    const out = translateChatRequest(req);
    expect(out.toolConfig).toEqual({ includeServerSideToolInvocations: true });
  });

  it('merges with a functionCallingConfig from toolChoice', () => {
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
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
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'x' }],
      tools: [FUNCTION_TOOL],
    });
    expect(out.toolConfig).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('includeServerSideToolInvocations');
  });

  it('is absent for built-in-only requests (byte-stable)', () => {
    const out = translateChatRequest({
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'x' }],
      rawVendorTools: [{ google_search: {} }],
    });
    expect(out.toolConfig).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('includeServerSideToolInvocations');
  });

  it('replays assistant functionCall parts with the documented injected-call dummy signature', () => {
    const out = translateChatRequest({
      model: GOOGLE_DEFAULT_MODEL_ID,
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
    const responsePart = out.contents.flatMap((c) => c.parts).find((p) => p.functionResponse);
    expect(responsePart?.functionResponse?.name).toBe('url_fetch');
  });

  it('is absent for tool-free requests and keeps toolChoice-only configs unchanged', () => {
    const bare = translateChatRequest({
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(bare.toolConfig).toBeUndefined();

    const choiceOnly = translateChatRequest({
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'x' }],
      tools: [FUNCTION_TOOL],
      toolChoice: 'required',
    });
    expect(choiceOnly.toolConfig).toEqual({ functionCallingConfig: { mode: 'ANY' } });
    expect(JSON.stringify(choiceOnly)).not.toContain('includeServerSideToolInvocations');
  });
});
