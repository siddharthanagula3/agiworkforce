import { describe, expect, it } from 'vitest';
import { buildProvenanceClaim } from '../article50-marker';
import {
  DIGITAL_SOURCE_TYPE,
  buildMediaXmpPacket,
  embedImageProvenance,
  embedVideoProvenance,
  extractEmbeddedProvenance,
  planVideoProvenance,
} from '../media-provenance';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6goXBCQJc0gUHQAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0xMC0yM1QwNDozNjowOSswMDowMCcjGgIAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMTAtMjNUMDQ6MzY6MDkrMDA6MDBWfqK+AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTEwLTIzVDA0OjM2OjA5KzAwOjAwAWuDYQAAAAtJREFUCNdjYIAAAAAIAAEvIN0xAAAAAElFTkSuQmCC';
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAEAAQDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==';
const WEBP_LOSSY =
  'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoEAAQAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=';
const WEBP_EXTENDED =
  'UklGRmAAAABXRUJQVlA4WAoAAAAQAAAAAwAAAwAAQUxQSAoAAAABB1DAiAhERP8DVlA4IDAAAADQAQCdASoEAAQAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=';

const claim = buildProvenanceClaim({
  kind: 'image',
  provider: 'fixture-provider',
  model: 'fixture-image-model',
  generatedAt: '2026-10-22T10:00:00.000Z',
  contentHashSha256: 'b'.repeat(64),
});
const videoClaim = buildProvenanceClaim({
  kind: 'video',
  provider: 'fixture-provider',
  model: 'fixture-video-model',
  generatedAt: '2026-10-22T10:00:00.000Z',
});

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function occurrences(bytes: Uint8Array, text: string): number {
  return Buffer.from(bytes).toString('latin1').split(text).length - 1;
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(Buffer.from(type, 'latin1'), 4);
  out.set(payload, 8);
  return out;
}

function join(...parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(parts));
}

function isoFile(openEnded = false): Uint8Array {
  const ftyp = box('ftyp', new Uint8Array(Buffer.from('isom\0\0\0\0isom', 'latin1')));
  const moov = box('moov', new Uint8Array(12));
  const mdat = box('mdat', new Uint8Array(40).fill(7));
  if (openEnded) new DataView(mdat.buffer).setUint32(0, 0);
  return join(ftyp, moov, mdat);
}

function matroskaFile(unknownSize: boolean): Uint8Array {
  const ebml = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x82, 0x81, 0x00);
  const body = Uint8Array.of(0x1f, 0x43, 0xb6, 0x75, 0x83, 0xe7, 0x81, 0x00);
  const size = unknownSize
    ? Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)
    : Uint8Array.of(0x01, 0, 0, 0, 0, 0, 0, body.length);
  return join(ebml, Uint8Array.of(0x18, 0x53, 0x80, 0x67), size, body);
}

describe('media provenance, images', () => {
  it.each([
    ['png', PNG],
    ['jpeg', JPEG],
    ['lossy webp', WEBP_LOSSY],
    ['extended webp', WEBP_EXTENDED],
  ])('writes the claim into a %s and reads it back', (_name, encoded) => {
    const original = fromBase64(encoded);
    const labelled = embedImageProvenance(original, claim);
    expect(labelled).not.toBeNull();
    expect(labelled!.length).toBeGreaterThan(original.length);
    expect(extractEmbeddedProvenance(original)).toBeNull();
    expect(extractEmbeddedProvenance(labelled!)).toEqual(claim);
    expect(occurrences(labelled!, DIGITAL_SOURCE_TYPE)).toBe(1);
  });

  it('keeps the original image data untouched', () => {
    const png = fromBase64(PNG);
    const labelled = embedImageProvenance(png, claim)!;
    const idat = Buffer.from(png).indexOf(Buffer.from('IDAT', 'latin1'));
    const idatChunk = Buffer.from(png).subarray(idat - 4, idat + 4 + 11 + 4);
    expect(Buffer.from(labelled).includes(idatChunk)).toBe(true);

    const jpeg = fromBase64(JPEG);
    const labelledJpeg = embedImageProvenance(jpeg, claim)!;
    const scanStart = Buffer.from(jpeg).indexOf(Uint8Array.of(0xff, 0xda));
    expect(Buffer.from(labelledJpeg).subarray(-(jpeg.length - scanStart))).toEqual(
      Buffer.from(jpeg).subarray(scanStart),
    );
  });

  it('declares the xmp chunk in the extended webp header', () => {
    const labelled = embedImageProvenance(fromBase64(WEBP_LOSSY), claim)!;
    expect(Buffer.from(labelled).subarray(12, 16).toString('latin1')).toBe('VP8X');
    expect(labelled[20]! & 0x04).toBe(0x04);
    const riffSize = new DataView(labelled.buffer, labelled.byteOffset).getUint32(4, true);
    expect(riffSize).toBe(labelled.length - 8);
  });

  it('replaces an earlier claim instead of stacking a second one', () => {
    for (const encoded of [PNG, JPEG, WEBP_LOSSY, WEBP_EXTENDED]) {
      const once = embedImageProvenance(fromBase64(encoded), claim)!;
      const newer = buildProvenanceClaim({
        kind: 'image',
        provider: 'other-provider',
        model: 'other-image-model',
        generatedAt: '2026-10-22T11:00:00.000Z',
      });
      const twice = embedImageProvenance(once, newer)!;
      expect(occurrences(twice, 'agi:Provenance=')).toBe(1);
      expect(extractEmbeddedProvenance(twice)).toEqual(newer);
    }
  });

  it('refuses bytes it cannot label rather than passing them through', () => {
    expect(embedImageProvenance(new Uint8Array([1, 2, 3, 4]), claim)).toBeNull();
    expect(embedImageProvenance(fromBase64(PNG).subarray(0, 40), claim)).toBeNull();
    expect(embedImageProvenance(fromBase64(JPEG).subarray(0, 60), claim)).toBeNull();
    expect(embedImageProvenance(fromBase64(WEBP_LOSSY).subarray(0, 30), claim)).toBeNull();
  });

  it('escapes the claim so a hostile model name cannot break out of the packet', () => {
    const hostile = buildProvenanceClaim({
      kind: 'image',
      provider: 'p"><x/>',
      model: 'm&\'"<',
      generatedAt: '2026-10-22T10:00:00.000Z',
    });
    const packet = buildMediaXmpPacket(hostile);
    expect(packet).not.toContain('<x/>');
    const labelled = embedImageProvenance(fromBase64(PNG), hostile)!;
    expect(extractEmbeddedProvenance(labelled)).toEqual(hostile);
  });
});

describe('media provenance, video', () => {
  it.each(['video/mp4', 'video/quicktime'] as const)(
    'appends an xmp box to a closed %s file',
    async (mimeType) => {
      const original = isoFile();
      const labelled = await embedVideoProvenance(original, mimeType, videoClaim);
      expect(labelled).not.toBeNull();
      expect(Buffer.from(labelled!).subarray(0, original.length)).toEqual(Buffer.from(original));
      expect(extractEmbeddedProvenance(labelled!)).toEqual(videoClaim);
      expect(extractEmbeddedProvenance(original)).toBeNull();

      const view = new DataView(labelled!.buffer, labelled!.byteOffset);
      const appended = view.getUint32(original.length);
      expect(original.length + appended).toBe(labelled!.length);
      expect(
        Buffer.from(labelled!)
          .subarray(original.length + 4, original.length + 8)
          .toString('latin1'),
      ).toBe('uuid');
    },
  );

  it('fixes the length of a last box that ran to the end of the file', async () => {
    const original = isoFile(true);
    const labelled = (await embedVideoProvenance(original, 'video/mp4', videoClaim))!;
    const mdatAt = original.length - 48;
    expect(new DataView(labelled.buffer, labelled.byteOffset).getUint32(mdatAt)).toBe(48);
    expect(extractEmbeddedProvenance(labelled)).toEqual(videoClaim);
  });

  it('labels a webm segment of known size and keeps the size honest', async () => {
    const original = matroskaFile(false);
    const labelled = (await embedVideoProvenance(original, 'video/webm', videoClaim))!;
    expect(extractEmbeddedProvenance(labelled)).toEqual(videoClaim);
    const sizeAt = 9 + 4;
    expect(labelled[sizeAt]).toBe(0x01);
    const declared = new DataView(labelled.buffer, labelled.byteOffset).getUint32(sizeAt + 4);
    expect(sizeAt + 8 + declared).toBe(labelled.length);
  });

  it('labels a webm segment of unknown size by appending only', async () => {
    const original = matroskaFile(true);
    const plan = await planVideoProvenance(
      { size: original.length, read: async (o, l) => original.subarray(o, o + l) },
      'video/webm',
      videoClaim,
    );
    expect(plan?.patches).toEqual([]);
    expect(
      extractEmbeddedProvenance((await embedVideoProvenance(original, 'video/webm', videoClaim))!),
    ).toEqual(videoClaim);
  });

  it('reads only box headers when planning, never the media payload', async () => {
    const original = isoFile();
    const reads: number[] = [];
    const plan = await planVideoProvenance(
      {
        size: original.length,
        read: async (offset, length) => {
          reads.push(length);
          return original.subarray(offset, offset + length);
        },
      },
      'video/mp4',
      videoClaim,
    );
    expect(plan).not.toBeNull();
    expect(Math.max(...reads)).toBeLessThanOrEqual(16);
  });

  it('refuses files whose structure it cannot trust', async () => {
    const closed = isoFile();
    expect(
      await embedVideoProvenance(closed.subarray(0, closed.length - 3), 'video/mp4', videoClaim),
    ).toBeNull();
    expect(await embedVideoProvenance(new Uint8Array(40), 'video/mp4', videoClaim)).toBeNull();
    expect(await embedVideoProvenance(new Uint8Array(40), 'video/webm', videoClaim)).toBeNull();
    const trailing = join(matroskaFile(false), Uint8Array.of(0, 0));
    expect(await embedVideoProvenance(trailing, 'video/webm', videoClaim)).toBeNull();
  });
});
