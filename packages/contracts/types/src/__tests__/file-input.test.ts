import { describe, expect, it } from 'vitest';

import {
  decodeTextFileBlock,
  inlineFileBlockAsText,
  isTextLikeFileMediaType,
  renderFileBlockAsText,
  UnsupportedFileInputError,
  UNSUPPORTED_FILE_INPUT_ERROR_NAME,
  type FileInputBlock,
} from '../file-input';

function block(filename: string, mediaType: string, body: string): FileInputBlock {
  return {
    filename,
    source: { type: 'base64', mediaType, data: Buffer.from(body, 'utf8').toString('base64') },
  };
}

const CAPABILITY = 'this route carries text and images only';

describe('isTextLikeFileMediaType', () => {
  it.each([
    'text/plain',
    'text/csv',
    'text/markdown',
    'TEXT/PLAIN',
    'text/plain; charset=utf-8',
    'application/json',
    'application/csv',
    'application/x-ndjson',
    'application/yaml',
    'application/xml',
    'application/vnd.api+json',
    'image/svg+xml',
  ])('accepts %s', (mediaType) => {
    expect(isTextLikeFileMediaType(mediaType)).toBe(true);
  });

  it.each([
    'application/pdf',
    'application/octet-stream',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    '',
  ])('refuses %s', (mediaType) => {
    expect(isTextLikeFileMediaType(mediaType)).toBe(false);
  });
});

describe('decodeTextFileBlock', () => {
  it('round-trips utf-8 beyond ascii', () => {
    expect(decodeTextFileBlock(block('note.txt', 'text/plain', 'naïve — 名前'))).toBe(
      'naïve — 名前',
    );
  });
});

describe('renderFileBlockAsText', () => {
  it('names the file so the model can tell it from the prompt', () => {
    const rendered = renderFileBlockAsText(block('qa-sales.csv', 'text/csv', 'a,b\n1,2'));

    expect(rendered).toContain('name="qa-sales.csv"');
    expect(rendered).toContain('type="text/csv"');
    expect(rendered).toContain('a,b\n1,2');
  });

  it('drops the charset parameter from the declared type', () => {
    const rendered = renderFileBlockAsText(block('n.txt', 'text/plain; charset=utf-8', 'x'));

    expect(rendered).toContain('type="text/plain"');
  });
});

describe('inlineFileBlockAsText', () => {
  it('inlines a text-like file', () => {
    expect(inlineFileBlockAsText(block('n.txt', 'text/plain', 'GRAPE-3'), CAPABILITY)).toContain(
      'GRAPE-3',
    );
  });

  it('raises a named error a classifier can recognise without importing this module', () => {
    let thrown: unknown;
    try {
      inlineFileBlockAsText(block('brief.pdf', 'application/pdf', 'bytes'), CAPABILITY);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsupportedFileInputError);
    expect((thrown as Error).name).toBe(UNSUPPORTED_FILE_INPUT_ERROR_NAME);
    expect((thrown as UnsupportedFileInputError).filename).toBe('brief.pdf');
    expect((thrown as UnsupportedFileInputError).mediaType).toBe('application/pdf');
  });

  it('quotes back what the route can take, so the message is actionable', () => {
    expect(() =>
      inlineFileBlockAsText(block('brief.pdf', 'application/pdf', 'bytes'), CAPABILITY),
    ).toThrow(new RegExp(CAPABILITY));
  });
});
