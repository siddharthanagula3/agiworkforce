import { describe, expect, it } from 'vitest';

import { CREDENTIAL_SCAN_GUARD_BYTES } from '@/lib/security/upload-scan';
import { decodeXmlEntities } from '@/lib/server/office-document-text';

import { characterReferenceFinder, xmlReferenceDecoder } from '../xml-reference-decoder';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodedInChunks(text: string, chunkBytes: number): string {
  const bytes = encoder.encode(text);
  const view = xmlReferenceDecoder();
  const parts: Uint8Array[] = [];
  for (let at = 0; at < bytes.byteLength; at += chunkBytes) {
    parts.push(view.push(bytes.subarray(at, at + chunkBytes)).slice());
  }
  parts.push(view.end().slice());
  return decoder.decode(Buffer.concat(parts));
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

const CHUNK_SIZES = [1, 2, 3, 5, 7, 64];

describe('the reference decoder the package scan reads decoded text through', () => {
  it.each([
    'ghp_&#x61;bc',
    'sk_live_E&#88;AMPLE',
    'E&#38;#x41;MPLE',
    '&#38;amp;',
    '&#38;lt;',
    '&amp;#x61;',
    '&#38;&#35;x61;',
    '&#x26;#97;',
    '&lt;t&gt; &quot;a&apos; &amp;amp;',
    '&#X41; &#x; &#; & &# &#x &l &am',
    '&#00000097;&#x0000061;',
    'Caf&#xE9; &#x1F600; &#8364;',
    'no references at all',
    '&&&#x61;&&',
  ])('decodes %j exactly as preparation does, whatever the chunk size', (text) => {
    for (const size of CHUNK_SIZES)
      expect(decodedInChunks(text, size)).toBe(decodeXmlEntities(text));
  });

  it('agrees with preparation over generated text that spells references within references', () => {
    const alphabet = [
      '&',
      '#',
      'x',
      'X',
      ';',
      '0',
      '3',
      '8',
      '4',
      '1',
      'a',
      'l',
      't',
      'g',
      'm',
      'p',
      'q',
      'u',
      'o',
      's',
      ' ',
      'é',
    ];
    const random = seededRandom(20_261_118);
    let compared = 0;
    for (let sample = 0; sample < 3_000; sample += 1) {
      const length = Math.floor(random() * 40);
      const text = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join('');
      let expected: string;
      try {
        expected = decodeXmlEntities(text);
      } catch (error) {
        if (error instanceof RangeError) continue;
        throw error;
      }
      const size = CHUNK_SIZES[sample % CHUNK_SIZES.length]!;
      expect(decodedInChunks(text, size)).toBe(expected);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(2_500);
  });

  it('gives back a reference past the last code point as written, where preparation throws', () => {
    expect(() => decodeXmlEntities('&#99999999;')).toThrow(RangeError);
    expect(decodedInChunks('a&#99999999;b&#x110000;c', 3)).toBe('a&#99999999;b&#x110000;c');
  });

  it('decodes a reference behind any number of leading zeros, and gives back at most a scan guard of them from one that is not closed', () => {
    const zeros = '0'.repeat(CREDENTIAL_SCAN_GUARD_BYTES + 10);
    expect(decodedInChunks(`ghp_&#${zeros}97;`, 4_096)).toBe('ghp_a');
    expect(decodedInChunks(`&#x${zeros}z`, 4_096)).toBe(
      `&#x${'0'.repeat(CREDENTIAL_SCAN_GUARD_BYTES)}z`,
    );
  });

  it('writes a lone surrogate as the replacement character stored text holds', () => {
    expect(decodedInChunks('a&#xD800;b', 2)).toBe('a�b');
  });

  it('passes a chunk with no ampersand through untouched', () => {
    const view = xmlReferenceDecoder();
    const chunk = encoder.encode('plain text');
    expect(view.push(chunk)).toBe(chunk);
    expect(view.end().byteLength).toBe(0);
  });
});

describe('the finder that decides whether a member is read again decoded', () => {
  function finds(...chunks: string[]): boolean {
    const finder = characterReferenceFinder();
    for (const chunk of chunks) finder.push(encoder.encode(chunk));
    return finder.found;
  }

  it('finds a numeric reference, also when a chunk ends between its ampersand and hash', () => {
    expect(finds('key &#x61;')).toBe(true);
    expect(finds('key &', '#97;')).toBe(true);
  });

  it('finds none in named references or a lone ampersand', () => {
    expect(finds('a &amp; b &lt;c&gt;', ' & #1')).toBe(false);
  });
});
