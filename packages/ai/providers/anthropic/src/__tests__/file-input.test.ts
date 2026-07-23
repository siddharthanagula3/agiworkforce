import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { translateChatRequest } from '../translate';

function requestWithFile(mediaType: string, data: string): ChatRequest {
  return {
    model: 'claude-haiku-4.5',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Read this file' },
          {
            type: 'file',
            filename: mediaType === 'application/pdf' ? 'brief.pdf' : 'notes.txt',
            source: { type: 'base64', mediaType, data },
          },
        ],
      },
    ],
  };
}

describe('Anthropic file input translation', () => {
  it('maps PDFs to base64 document blocks', () => {
    const translated = translateChatRequest(requestWithFile('application/pdf', 'JVBERg=='));

    expect(translated.messages[0]?.content).toEqual([
      { type: 'text', text: 'Read this file' },
      {
        type: 'document',
        title: 'brief.pdf',
        source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERg==' },
      },
    ]);
  });

  it('decodes text files into plain-text document blocks', () => {
    const translated = translateChatRequest(requestWithFile('text/plain', 'aGVsbG8='));

    expect(translated.messages[0]?.content).toEqual([
      { type: 'text', text: 'Read this file' },
      {
        type: 'document',
        title: 'notes.txt',
        source: { type: 'text', media_type: 'text/plain', data: 'hello' },
      },
    ]);
  });

  it('rejects unsupported document MIME types instead of silently dropping bytes', () => {
    expect(() =>
      translateChatRequest(
        requestWithFile(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'AA==',
        ),
      ),
    ).toThrow('Anthropic document input does not support');
  });
});
