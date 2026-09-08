import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';
import { UNSUPPORTED_FILE_INPUT_ERROR_NAME } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';

import { translateChatRequest } from '../translate';
import { OPENAI_DEFAULT_MODEL_ID } from './model-fixtures';

const MODEL = OPENAI_DEFAULT_MODEL_ID;

const compat: OpenAICompletionsCompatDefaults = {
  supportsStore: true,
  supportsDeveloperRole: true,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  maxTokensField: 'max_completion_tokens',
  thinkingFormat: 'openai',
  visibleReasoningDetailTypes: [],
  supportsStrictMode: true,
};

function base64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

function requestWithFile(filename: string, mediaType: string, body: string): ChatRequest {
  return {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What value appears inside the attached file?' },
          {
            type: 'file',
            filename,
            source: { type: 'base64', mediaType, data: base64(body) },
          },
        ],
      },
    ],
  };
}

function userParts(request: ChatRequest): Array<Record<string, unknown>> {
  const translated = translateChatRequest(request, { compat, provider: 'openai' });
  const content = translated.messages[0]?.content;
  if (!Array.isArray(content)) throw new Error('expected multipart user content');
  return content as unknown as Array<Record<string, unknown>>;
}

describe('Chat Completions file input', () => {
  it('inlines a plain text attachment so the model can read it', () => {
    const parts = userParts(requestWithFile('qa-secret-value.txt', 'text/plain', 'ORANGE-77'));

    expect(parts[0]).toEqual({
      type: 'text',
      text: 'What value appears inside the attached file?',
    });
    expect(parts[1]?.['type']).toBe('text');
    expect(parts[1]?.['text']).toContain('ORANGE-77');
    expect(parts[1]?.['text']).toContain('qa-secret-value.txt');
  });

  it('inlines a CSV attachment with its rows intact', () => {
    const csv = 'region,revenue\nemea,120\napac,240';
    const parts = userParts(requestWithFile('qa-sales.csv', 'text/csv', csv));

    expect(parts[1]?.['text']).toContain('emea,120');
    expect(parts[1]?.['text']).toContain('apac,240');
  });

  it.each([
    ['data.json', 'application/json', '{"answer":42}', '42'],
    ['notes.md', 'text/markdown', '# heading', 'heading'],
    ['config.yaml', 'application/yaml', 'key: value', 'key: value'],
    ['events.ndjson', 'application/x-ndjson', '{"a":1}', '{"a":1}'],
    ['feed.xml', 'application/xml', '<item>one</item>', '<item>one</item>'],
  ])('inlines %s as text', (filename, mediaType, body, expected) => {
    const parts = userParts(requestWithFile(filename, mediaType, body));
    expect(parts[1]?.['text']).toContain(expected);
  });

  it('honours a media type that carries a charset parameter', () => {
    const parts = userParts(requestWithFile('note.txt', 'text/plain; charset=utf-8', 'PLUM-9'));
    expect(parts[1]?.['text']).toContain('PLUM-9');
  });

  it('still sends an image as an image part, not as inlined text', () => {
    const parts = userParts({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image.' },
            {
              type: 'image',
              source: { type: 'base64', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
            },
          ],
        },
      ],
    });

    expect(parts[1]?.['type']).toBe('image_url');
  });

  it.each([
    ['brief.pdf', 'application/pdf'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ])('refuses %s by name rather than throwing an opaque TypeError', (filename, mediaType) => {
    let thrown: unknown;
    try {
      translateChatRequest(requestWithFile(filename, mediaType, 'binary'), {
        compat,
        provider: 'openai',
      });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).name).toBe(UNSUPPORTED_FILE_INPUT_ERROR_NAME);
    expect((thrown as Error).message).toContain(filename);
    expect((thrown as Error).message).toContain(mediaType);
  });
});
