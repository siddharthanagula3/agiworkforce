import { describe, expect, it } from 'vitest';
import { normalizePromotionalChatHistory } from './promotional-chat-request';

describe('text-only promotional chat history', () => {
  it('preserves historical text while omitting unsupported prior files and images', () => {
    const result = normalizePromotionalChatHistory([
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: 'Read this invoice.' },
          { type: 'file' as const, file: { asset_id: 'fixture-file' } },
        ],
      },
      {
        role: 'assistant',
        content: 'The total is $10.',
      },
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: 'What is in this logo?' },
          { type: 'image_url' as const, image_url: { url: 'fixture-image' } },
        ],
      },
      { role: 'assistant', content: 'It says AGI.' },
      { role: 'user', content: 'Reply with hello.' },
    ]);

    expect(result[0]?.content).toContain('Read this invoice.');
    expect(result[0]?.content).toContain('attachment in this earlier message is unavailable');
    expect(result[2]?.content).toContain('What is in this logo?');
    expect(result[2]?.content).not.toContain('fixture-image');
    expect(result[4]?.content).toBe('Reply with hello.');
    expect(result.every((message) => typeof message.content === 'string')).toBe(true);
  });

  it('does not silently strip an attachment from the current user turn', () => {
    const current = {
      role: 'user',
      content: [
        { type: 'text' as const, text: 'Read this file.' },
        { type: 'file' as const, file: { asset_id: 'fixture-current' } },
      ],
    };

    const result = normalizePromotionalChatHistory([
      { role: 'assistant', content: 'Earlier reply' },
      current,
    ]);

    expect(result[1]).toBe(current);
  });
});
