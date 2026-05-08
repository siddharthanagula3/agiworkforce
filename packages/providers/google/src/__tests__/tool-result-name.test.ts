/**
 * Regression test: `tool_result` blocks must translate with the original
 * function name in `functionResponse.name`, NOT the opaque toolUseId.
 *
 * Background: Gemini's `functionResponse.name` MUST match a
 * `tools.functionDeclarations[].name`. Prior versions of this translator
 * passed `block.toolUseId` (a value like `toolu_01ABC...`) as the name,
 * which Gemini cannot match — multi-turn tool-use across providers was
 * broken on the Gemini side. The fix tracks `toolUseId → name` from the
 * preceding assistant `tool_use` block.
 */

import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';

describe('Gemini tool_result name mapping', () => {
  it('uses the original function name from the preceding tool_use', () => {
    const req: ChatRequest = {
      model: 'gemini-3.1-pro-preview',
      messages: [
        { role: 'user', content: 'What is the weather in SF?' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01ABC',
              name: 'get_weather',
              input: { city: 'San Francisco' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolUseId: 'toolu_01ABC',
              content: 'sunny, 72F',
            },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);

    // The third content entry should be the tool_result, translated to
    // a functionResponse part with `name: 'get_weather'` (NOT the toolUseId).
    const lastContent = translated.contents[translated.contents.length - 1];
    expect(lastContent).toBeDefined();
    expect(lastContent?.role).toBe('user');
    const part = lastContent?.parts[0];
    expect(part?.functionResponse).toBeDefined();
    expect(part?.functionResponse?.name).toBe('get_weather');
    expect(part?.functionResponse?.name).not.toBe('toolu_01ABC');
    expect(part?.functionResponse?.response).toEqual({ output: 'sunny, 72F' });
  });

  it('handles multiple tool_use → tool_result pairs in one turn', () => {
    const req: ChatRequest = {
      model: 'gemini-3.1-pro-preview',
      messages: [
        { role: 'user', content: 'Run the diagnostics.' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_A',
              name: 'check_disk',
              input: {},
            },
            {
              type: 'tool_use',
              id: 'toolu_B',
              name: 'check_network',
              input: {},
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', toolUseId: 'toolu_A', content: 'disk OK' },
            { type: 'tool_result', toolUseId: 'toolu_B', content: 'network OK' },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);
    const lastContent = translated.contents[translated.contents.length - 1];
    expect(lastContent?.parts).toHaveLength(2);
    expect(lastContent?.parts[0]?.functionResponse?.name).toBe('check_disk');
    expect(lastContent?.parts[1]?.functionResponse?.name).toBe('check_network');
  });

  it('falls back to toolUseId only when no matching tool_use is present', () => {
    // Defensive fallback: malformed transcript with no preceding tool_use.
    // We don't crash; we use the toolUseId so the call still has *some* name.
    const req: ChatRequest = {
      model: 'gemini-3.1-pro-preview',
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: 'toolu_orphan', content: 'orphan result' }],
        },
      ],
    };

    const translated = translateChatRequest(req);
    const lastContent = translated.contents[translated.contents.length - 1];
    const part = lastContent?.parts[0];
    expect(part?.functionResponse?.name).toBe('toolu_orphan');
  });

  it('matches tool_result to tool_use by id only — not by positional index', () => {
    // Cross-provider contract: ToolResultBlock has only `toolUseId` (no
    // `name`). When tool_results arrive in an order that differs from the
    // tool_use call order, matching MUST resolve via the id-→name map, not
    // via array position. This test would fail if the translator paired
    // results to uses by index.
    const req: ChatRequest = {
      model: 'gemini-3.1-pro-preview',
      messages: [
        { role: 'user', content: 'parallel calls in flipped order' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu_first', name: 'fn_alpha', input: {} },
            { type: 'tool_use', id: 'tu_second', name: 'fn_beta', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            // results returned in REVERSE order vs. the tool_use list.
            { type: 'tool_result', toolUseId: 'tu_second', content: 'beta-out' },
            { type: 'tool_result', toolUseId: 'tu_first', content: 'alpha-out' },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);
    const lastContent = translated.contents[translated.contents.length - 1];
    expect(lastContent?.parts).toHaveLength(2);
    // First result block referenced tu_second, so it MUST resolve to fn_beta.
    expect(lastContent?.parts[0]?.functionResponse?.name).toBe('fn_beta');
    expect(lastContent?.parts[0]?.functionResponse?.response).toEqual({ output: 'beta-out' });
    expect(lastContent?.parts[1]?.functionResponse?.name).toBe('fn_alpha');
    expect(lastContent?.parts[1]?.functionResponse?.response).toEqual({ output: 'alpha-out' });
  });
});
