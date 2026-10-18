import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { translateChatRequest } from '../translate';

const FIXTURE_MODEL_ID = 'fixture-ollama-model';

function requestWithFile(mediaType: string, text: string): ChatRequest {
  return {
    model: FIXTURE_MODEL_ID,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarise the attachment.' },
          {
            type: 'file',
            filename: 'notes.txt',
            source: { type: 'base64', mediaType, data: Buffer.from(text).toString('base64') },
          },
        ],
      },
    ],
  };
}

describe('Ollama file input', () => {
  it('inlines a text attachment instead of dropping it', () => {
    const translated = translateChatRequest(requestWithFile('text/plain', 'quarterly numbers'));
    const content = translated.messages[0]?.content ?? '';
    expect(content).toContain('Summarise the attachment.');
    expect(content).toContain('quarterly numbers');
  });

  it('refuses an attachment it cannot carry rather than sending the turn without it', () => {
    expect(() => translateChatRequest(requestWithFile('application/zip', 'PK'))).toThrow();
  });
});
