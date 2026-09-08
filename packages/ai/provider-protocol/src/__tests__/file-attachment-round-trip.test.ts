import { describe, expect, it } from 'vitest';

import { openAIWireRequestToChatRequest } from '../openai-wire-compat';

/**
 * The whole path a chat attachment travels, in one test.
 *
 * The browser QA that found AGI-17 exercised exactly this: a small text file
 * attached in the composer, hydrated into an OpenAI-wire `file` part, parsed
 * into a canonical `file` block, and translated for whichever route Auto
 * picked. Every unit along the way had passing tests; nothing joined them up,
 * so a translator that threw for every file block in the middle of that chain
 * went unnoticed until a person attached a .txt and got "the model failed to
 * produce a response".
 *
 * The translator half lives in each provider package, where the wire format
 * is. This asserts the half that is shared: that a hydrated attachment
 * survives the wire boundary as a file block carrying its real media type.
 */
function wireRequestWithFile(filename: string, mimeType: string, body: string) {
  const data = Buffer.from(body, 'utf8').toString('base64');
  return {
    model: 'fixture-model',
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: 'What value appears inside the attached file?' },
          {
            type: 'file',
            file: {
              filename,
              mime_type: mimeType,
              file_data: `data:${mimeType};base64,${data}`,
            },
          },
        ],
      },
    ],
  };
}

describe('a hydrated chat attachment reaching the canonical request', () => {
  it.each([
    ['qa-secret-value.txt', 'text/plain', 'ORANGE-77'],
    ['qa-sales.csv', 'text/csv', 'region,revenue\nemea,120'],
    ['data.json', 'application/json', '{"answer":42}'],
  ])('carries %s through as a file block with its own media type', (filename, mime, body) => {
    const request = openAIWireRequestToChatRequest(wireRequestWithFile(filename, mime, body));
    const content = request.messages[0]?.content;

    expect(Array.isArray(content)).toBe(true);
    const fileBlock = (content as Array<{ type: string }>).find((b) => b.type === 'file');

    expect(fileBlock).toMatchObject({
      type: 'file',
      filename,
      source: { type: 'base64', mediaType: mime },
    });
    expect(
      Buffer.from((fileBlock as unknown as { source: { data: string } }).source.data, 'base64').toString(
        'utf8',
      ),
    ).toBe(body);
  });

  it('keeps the user’s own words as a separate block', () => {
    const request = openAIWireRequestToChatRequest(wireRequestWithFile('n.txt', 'text/plain', 'x'));
    const content = request.messages[0]?.content as Array<{ type: string; text?: string }>;

    expect(content[0]).toEqual({
      type: 'text',
      text: 'What value appears inside the attached file?',
    });
  });
});
