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

function rawBlock(filename: string, mediaType: string, bytes: Uint8Array): FileInputBlock {
  return {
    filename,
    source: { type: 'base64', mediaType, data: Buffer.from(bytes).toString('base64') },
  };
}

describe('decodeTextFileBlock', () => {
  it('round-trips utf-8 beyond ascii', () => {
    expect(decodeTextFileBlock(block('note.txt', 'text/plain', 'naïve, 名前'))).toBe('naïve, 名前');
  });

  // A lone 0x80 continuation byte starts no sequence, so no encoding produces
  // it and a lenient decoder silently hands the model a replacement character.
  it('refuses bytes that are not text instead of replacing them', () => {
    const undecodable = rawBlock('notes.txt', 'text/plain', new Uint8Array([0x68, 0x80, 0x69]));
    expect(() => decodeTextFileBlock(undecodable)).toThrow(UnsupportedFileInputError);
    try {
      decodeTextFileBlock(undecodable);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedFileInputError);
      const refusal = error as UnsupportedFileInputError;
      expect(refusal.reason).toBe('not_text');
      expect(refusal.name).toBe(UNSUPPORTED_FILE_INPUT_ERROR_NAME);
      expect(refusal.message).toContain('notes.txt');
      expect(refusal.message).not.toContain('�');
    }
  });

  it('reads a file that states its own encoding with a byte order mark', () => {
    const utf16le = new Uint8Array([0xff, 0xfe, 0x4a, 0x00, 0x6f, 0x00, 0x73, 0x00, 0xe9, 0x00]);
    const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x4a, 0x00, 0x6f, 0x00, 0x73, 0x00, 0xe9]);
    const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x4a, 0x6f, 0x73, 0xc3, 0xa9]);
    for (const bytes of [utf16le, utf16be, utf8Bom]) {
      expect(decodeTextFileBlock(rawBlock('names.csv', 'text/csv', bytes))).toBe('José');
    }
  });

  it('never guesses an encoding the file did not state', () => {
    const latin1 = new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]);
    expect(() => decodeTextFileBlock(rawBlock('names.csv', 'text/csv', latin1))).toThrow(
      UnsupportedFileInputError,
    );
  });

  it('never returns a replacement character for bytes it accepted', () => {
    for (const bytes of [
      new Uint8Array([0xc3, 0xa9]),
      new Uint8Array([0xe5, 0x90, 0x8d]),
      new Uint8Array([0xf0, 0x9f, 0x92, 0xa1]),
    ]) {
      expect(decodeTextFileBlock(rawBlock('n.txt', 'text/plain', bytes))).not.toContain('�');
    }
  });

  it('refuses through the path an adapter actually takes', () => {
    const undecodable = rawBlock('report.csv', 'text/csv', new Uint8Array([0xff, 0xfe, 0x41]));
    expect(() => inlineFileBlockAsText(undecodable, CAPABILITY)).toThrow(UnsupportedFileInputError);
    expect(() => renderFileBlockAsText(undecodable)).toThrow(UnsupportedFileInputError);
  });

  it('does not name a model capability for bytes no model could read', () => {
    try {
      inlineFileBlockAsText(rawBlock('x.txt', 'text/plain', new Uint8Array([0x80])), CAPABILITY);
      expect.unreachable();
    } catch (error) {
      expect((error as UnsupportedFileInputError).message).not.toContain(CAPABILITY);
    }
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
