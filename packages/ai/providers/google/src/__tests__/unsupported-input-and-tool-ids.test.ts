import { describe, expect, it } from 'vitest';
import { UNSUPPORTED_FILE_INPUT_ERROR_NAME, type StreamChunk } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';
import { translateGeminiStream } from '../stream';
import type { GeminiStreamChunk } from '../types';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

async function toolIds(chunks: GeminiStreamChunk[]): Promise<string[]> {
  const ids: string[] = [];
  for await (const chunk of translateGeminiStream(fromArray(chunks))) {
    if ((chunk as StreamChunk).type === 'tool-use-start') {
      ids.push((chunk as Extract<StreamChunk, { type: 'tool-use-start' }>).toolUseId);
    }
  }
  return ids;
}

describe('Gemini input the route cannot carry', () => {
  it('refuses an image given by link instead of sending the turn without it', () => {
    let thrown: unknown;
    try {
      translateChatRequest({
        model: GOOGLE_DEFAULT_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this picture?' },
              { type: 'image', source: { type: 'url', url: 'https://example.com/cat.png' } },
            ],
          },
        ],
      });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error | undefined)?.name).toBe(UNSUPPORTED_FILE_INPUT_ERROR_NAME);
  });
});

describe('Gemini tool call ids', () => {
  it('names each tool result after the call it answers when ids repeat across turns', () => {
    const translated = translateChatRequest({
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [
        { role: 'user', content: 'Check the weather, then the time.' },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'gemini-tool-1', name: 'get_weather', input: {} }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: 'gemini-tool-1', content: 'sunny' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'gemini-tool-1', name: 'get_time', input: {} }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: 'gemini-tool-1', content: '09:00' }],
        },
      ],
    });
    const responseNames = translated.contents.flatMap((content) =>
      content.parts.flatMap((part) => (part.functionResponse ? [part.functionResponse.name] : [])),
    );
    expect(responseNames).toEqual(['get_weather', 'get_time']);
  });

  it('keeps the id Gemini assigned when it sends one', async () => {
    const ids = await toolIds([
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { id: 'call-7', name: 'lookup', args: {} } }],
            },
            finishReason: 'STOP',
          },
        ],
      },
    ]);
    expect(ids).toEqual(['call-7']);
  });
});
