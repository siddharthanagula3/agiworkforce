import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

describe('Gemini tool_result name mapping', () => {
  it('translates canonical file bytes to Gemini inlineData', () => {
    const translated = translateChatRequest({
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read this file' },
            {
              type: 'file',
              filename: 'notes.txt',
              source: { type: 'base64', mediaType: 'text/plain', data: 'aGVsbG8=' },
            },
          ],
        },
      ],
    });

    expect(translated.contents[0]?.parts).toEqual([
      { text: 'Read this file' },
      { inlineData: { mimeType: 'text/plain', data: 'aGVsbG8=' } },
    ]);
  });

  it('uses the original function name from the preceding tool_use', () => {
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
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
      model: GOOGLE_DEFAULT_MODEL_ID,
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
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
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

  it('matches tool_result to tool_use by id only, not by positional index', () => {
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
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
            { type: 'tool_result', toolUseId: 'tu_second', content: 'beta-out' },
            { type: 'tool_result', toolUseId: 'tu_first', content: 'alpha-out' },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);
    const lastContent = translated.contents[translated.contents.length - 1];
    expect(lastContent?.parts).toHaveLength(2);
    expect(lastContent?.parts[0]?.functionResponse?.name).toBe('fn_beta');
    expect(lastContent?.parts[0]?.functionResponse?.response).toEqual({ output: 'beta-out' });
    expect(lastContent?.parts[1]?.functionResponse?.name).toBe('fn_alpha');
    expect(lastContent?.parts[1]?.functionResponse?.response).toEqual({ output: 'alpha-out' });
  });
});
