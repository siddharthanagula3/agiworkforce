/**
 * Regression test: a single ProviderMessage with multiple tool_result
 * blocks must emit one Ollama `role: "tool"` message per result. Earlier
 * versions of `translateMessage` returned a single OllamaChatMessage and
 * silently dropped every tool_result past the first plus any co-occurring
 * text content. Local LLM users are first-class per pricing model and hit
 * this constantly when the agent uses multiple tools per turn.
 */

import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';

describe('Ollama tool_result split', () => {
  it('emits one tool message per tool_result, preserving order', () => {
    const req: ChatRequest = {
      model: 'llama3.3',
      messages: [
        { role: 'user', content: 'Run two checks please.' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu1', name: 'check_a', input: {} },
            { type: 'tool_use', id: 'tu2', name: 'check_b', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', toolUseId: 'tu1', content: 'A=ok' },
            { type: 'tool_result', toolUseId: 'tu2', content: 'B=ok' },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);
    // user → assistant (with tool_calls) → tool(A) → tool(B)
    expect(translated.messages).toHaveLength(4);
    expect(translated.messages[0]?.role).toBe('user');
    expect(translated.messages[1]?.role).toBe('assistant');
    expect(translated.messages[1]?.tool_calls).toHaveLength(2);
    expect(translated.messages[2]).toEqual({ role: 'tool', content: 'A=ok' });
    expect(translated.messages[3]).toEqual({ role: 'tool', content: 'B=ok' });
  });

  it('emits text body PLUS tool messages when both are present', () => {
    const req: ChatRequest = {
      model: 'llama3.3',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Here are the results:' },
            { type: 'tool_result', toolUseId: 'tu1', content: 'first' },
            { type: 'tool_result', toolUseId: 'tu2', content: 'second' },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);
    // user (text) → tool(first) → tool(second). Three total — earlier
    // versions emitted just one and dropped the text + the second result.
    expect(translated.messages).toHaveLength(3);
    expect(translated.messages[0]?.role).toBe('user');
    expect(translated.messages[0]?.content).toBe('Here are the results:');
    expect(translated.messages[1]).toEqual({ role: 'tool', content: 'first' });
    expect(translated.messages[2]).toEqual({ role: 'tool', content: 'second' });
  });

  it('handles a message with image + text correctly', () => {
    const req: ChatRequest = {
      model: 'llama3.3-vision',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image',
              source: {
                type: 'base64',
                mediaType: 'image/png',
                data: 'AAAA',
              },
            },
          ],
        },
      ],
    };

    const translated = translateChatRequest(req);
    expect(translated.messages).toHaveLength(1);
    const msg = translated.messages[0];
    expect(msg?.role).toBe('user');
    expect(msg?.content).toBe('What is in this image?');
    expect(msg?.images).toEqual(['AAAA']);
  });

  it('preserves a string-content message unchanged', () => {
    const req: ChatRequest = {
      model: 'llama3.3',
      messages: [{ role: 'user', content: 'hello world' }],
    };

    const translated = translateChatRequest(req);
    expect(translated.messages).toEqual([{ role: 'user', content: 'hello world' }]);
  });
});
