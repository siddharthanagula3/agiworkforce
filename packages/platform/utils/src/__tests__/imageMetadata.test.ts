import { describe, expect, it } from 'vitest';

import {
  detectImageFormat,
  readExifOrientation,
  stripImageMetadata,
  type ImageMetadataResult,
} from '../imageMetadata';

const NEEDLE = {
  make: 'AGIFIXTURECAM',
  taken: 'AGIFIXTURETIME',
  xmp: 'AGIFIXTUREXMP',
  iptc: 'AGIFIXTUREIPTC',
  text: 'AGIFIXTURETEXT',
  icc: 'AGIFIXTUREICC',
  pixels: 'AGIFIXTUREPIXELS',
} as const;

function ascii(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i));
  return out;
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function contains(bytes: Uint8Array, text: string): boolean {
  const needle = ascii(text);
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * A big-endian Exif block carrying the four things a phone photo leaks: the
 * camera, the capture time, the coordinates and the orientation.
 */
function exifTiff(orientation: number): number[] {
  const make = ascii(`${NEEDLE.make} 12`).concat([0]);
  const taken = ascii(`${NEEDLE.taken} 2024`).concat([0]);
  const makeAt = 62;
  const takenAt = makeAt + make.length;
  const gpsAt = takenAt + taken.length;
  const latitudeAt = gpsAt + 30;

  const gps = [
    ...u16(2),
    ...u16(0x0001),
    ...u16(2),
    ...u32(2),
    ...ascii('N'),
    0,
    0,
    0,
    ...u16(0x0002),
    ...u16(5),
    ...u32(3),
    ...u32(latitudeAt),
    ...u32(0),
  ];
  const latitude = [...u32(37), ...u32(1), ...u32(46), ...u32(1), ...u32(2994), ...u32(100)];

  return [
    ...ascii('MM'),
    ...u16(0x2a),
    ...u32(8),
    ...u16(4),
    ...u16(0x010f),
    ...u16(2),
    ...u32(make.length),
    ...u32(makeAt),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u16(0x0132),
    ...u16(2),
    ...u32(taken.length),
    ...u32(takenAt),
    ...u16(0x8825),
    ...u16(4),
    ...u32(1),
    ...u32(gpsAt),
    ...u32(0),
    ...make,
    ...taken,
    ...gps,
    ...latitude,
  ];
}

function jpegSegment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...u16(payload.length + 2), ...payload];
}

const ICC_PAYLOAD = [...ascii('ICC_PROFILE'), 0, 1, 1, ...ascii(NEEDLE.icc)];
const ENTROPY = [...ascii(NEEDLE.pixels), 0x0a, 0x33, 0x7f];

function jpegFixture(orientation: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...jpegSegment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...jpegSegment(0xe1, [...ascii('Exif'), 0, 0, ...exifTiff(orientation)]),
    ...jpegSegment(0xe1, [
      ...ascii('http://ns.adobe.com/xap/1.0/'),
      0,
      ...ascii(`<x:xmpmeta>${NEEDLE.xmp}</x:xmpmeta>`),
    ]),
    ...jpegSegment(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii(NEEDLE.iptc)]),
    ...jpegSegment(0xe2, ICC_PAYLOAD),
    ...jpegSegment(0xfe, ascii(NEEDLE.text)),
    ...jpegSegment(0xdb, [0x00, 0x10, 0x11]),
    ...jpegSegment(0xc0, [0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x11, 0x00]),
    ...jpegSegment(0xc4, [0x00, 0x01, 0x02]),
    ...jpegSegment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    ...ENTROPY,
    0xff,
    0xd9,
  ]);
}

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function fixtureCrc32(values: number[]): number {
  let crc = 0xffffffff;
  for (const value of values) crc = (CRC_TABLE[(crc ^ value) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(fixtureCrc32(body))];
}

const PNG_SIGNATURE = [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IDAT = [...ascii(NEEDLE.pixels), 0x01, 0x02];

function pngFixture(orientation: number): Uint8Array {
  return new Uint8Array([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', [...u32(1), ...u32(1), 8, 2, 0, 0, 0]),
    ...pngChunk('eXIf', exifTiff(orientation)),
    ...pngChunk('iCCP', [...ascii('p'), 0, 0, ...ascii(NEEDLE.icc)]),
    ...pngChunk('tEXt', [...ascii('Model'), 0, ...ascii(NEEDLE.make)]),
    ...pngChunk('zTXt', [...ascii('Raw'), 0, 0, ...ascii(NEEDLE.text)]),
    ...pngChunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...ascii(NEEDLE.xmp)]),
    ...pngChunk('tIME', [...u16(2024), 5, 13, 14, 30, ...ascii('')]),
    ...pngChunk('IDAT', PNG_IDAT),
    ...pngChunk('IEND', []),
  ]);
}

function webpChunk(fourcc: string, data: number[]): number[] {
  const padding = data.length & 1 ? [0] : [];
  return [...ascii(fourcc), ...u32le(data.length), ...data, ...padding];
}

const WEBP_PIXELS = [...ascii(NEEDLE.pixels), 0x20];

function webpFixture(orientation: number): Uint8Array {
  const body = [
    ...ascii('WEBP'),
    ...webpChunk('VP8X', [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...webpChunk('ICCP', ascii(NEEDLE.icc)),
    ...webpChunk('VP8 ', WEBP_PIXELS),
    ...webpChunk('EXIF', exifTiff(orientation)),
    ...webpChunk('XMP ', ascii(NEEDLE.xmp)),
  ];
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);
}

const GIF_PIXELS = [0x02, NEEDLE.pixels.length, ...ascii(NEEDLE.pixels), 0x00];

function gifFixture(): Uint8Array {
  return new Uint8Array([
    ...ascii('GIF89a'),
    ...[0x01, 0x00, 0x01, 0x00],
    0x00,
    0x00,
    0x00,
    0x21,
    0xf9,
    0x04,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x21,
    0xff,
    0x0b,
    ...ascii('NETSCAPE2.0'),
    0x03,
    0x01,
    0x00,
    0x00,
    0x00,
    0x21,
    0xfe,
    NEEDLE.text.length,
    ...ascii(NEEDLE.text),
    0x00,
    0x21,
    0xff,
    0x0b,
    ...ascii('XMP DataXMP'),
    NEEDLE.xmp.length,
    ...ascii(NEEDLE.xmp),
    0x00,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    ...GIF_PIXELS,
    0x3b,
  ]);
}

function stripped(bytes: Uint8Array): Extract<ImageMetadataResult, { status: 'stripped' }> {
  const result = stripImageMetadata(bytes);
  if (result.status !== 'stripped') throw new Error(`expected stripped, got ${result.status}`);
  return result;
}

function jpegMarkers(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let offset = 2;
  while (offset + 1 < bytes.length) {
    const marker = bytes[offset + 1] ?? 0;
    markers.push(marker);
    if (marker === 0xd9) break;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    offset += 2 + length;
    if (marker === 0xda) {
      while (offset + 1 < bytes.length) {
        const next = bytes[offset + 1] ?? 0;
        if (bytes[offset] === 0xff && next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        offset += 1;
      }
    }
  }
  return markers;
}

function pngChunkTypes(bytes: Uint8Array): string[] {
  const types: string[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length =
      ((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0);
    let type = '';
    for (let i = 0; i < 4; i += 1) type += String.fromCharCode(bytes[offset + 4 + i] ?? 0);
    const body: number[] = [];
    for (let i = 0; i < 4 + length; i += 1) body.push(bytes[offset + 4 + i] ?? 0);
    const declared =
      ((bytes[offset + 8 + length] ?? 0) * 0x1000000 +
        ((bytes[offset + 9 + length] ?? 0) << 16) +
        ((bytes[offset + 10 + length] ?? 0) << 8) +
        (bytes[offset + 11 + length] ?? 0)) >>>
      0;
    if (declared !== fixtureCrc32(body)) throw new Error(`chunk ${type} has a broken checksum`);
    types.push(type);
    offset += 12 + length;
  }
  return types;
}

function webpChunkNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    let fourcc = '';
    for (let i = 0; i < 4; i += 1) fourcc += String.fromCharCode(bytes[offset + i] ?? 0);
    const size =
      (bytes[offset + 4] ?? 0) +
      ((bytes[offset + 5] ?? 0) << 8) +
      ((bytes[offset + 6] ?? 0) << 16) +
      (bytes[offset + 7] ?? 0) * 0x1000000;
    names.push(fourcc);
    offset += 8 + size + (size & 1);
  }
  return names;
}

function findSequence(bytes: Uint8Array, values: number[]): number {
  outer: for (let i = 0; i + values.length <= bytes.length; i += 1) {
    for (let j = 0; j < values.length; j += 1) {
      if (bytes[i + j] !== values[j]) continue outer;
    }
    return i;
  }
  return -1;
}

describe('what leaves with a picture', () => {
  const upright = [
    ['JPEG', jpegFixture(1)],
    ['PNG', pngFixture(1)],
    ['WebP', webpFixture(1)],
    ['GIF', gifFixture()],
  ] as const;

  it.each(upright)('drops the camera, the time, the place and the notes from %s', (_name, file) => {
    const before = stripImageMetadata(file);
    expect(before.status).toBe('stripped');
    const after = stripped(file).bytes;

    expect(contains(file, NEEDLE.make) || contains(file, NEEDLE.xmp)).toBe(true);
    expect(contains(after, NEEDLE.make)).toBe(false);
    expect(contains(after, NEEDLE.taken)).toBe(false);
    expect(contains(after, NEEDLE.xmp)).toBe(false);
    expect(contains(after, NEEDLE.iptc)).toBe(false);
    expect(contains(after, NEEDLE.text)).toBe(false);
    expect(contains(after, 'NETSCAPE2.0') || _name !== 'GIF').toBe(true);
  });

  it.each(upright)('keeps the pixels of %s byte for byte', (_name, file) => {
    const after = stripped(file).bytes;
    expect(contains(after, NEEDLE.pixels)).toBe(true);
  });

  it('leaves the coordinates nowhere in the JPEG it produces', () => {
    const file = jpegFixture(1);
    const latitude = [...u32(37), ...u32(1), ...u32(46), ...u32(1)];
    expect(findSequence(file, latitude)).toBeGreaterThan(-1);
    expect(findSequence(stripped(file).bytes, latitude)).toBe(-1);
  });

  it('keeps the colour profile of a JPEG exactly as it was', () => {
    const after = stripped(jpegFixture(1)).bytes;
    expect(findSequence(after, ICC_PAYLOAD)).toBeGreaterThan(-1);
    expect(jpegMarkers(after)).toEqual([0xe0, 0xe2, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]);
  });

  it('keeps the colour profile of a PNG and drops every text chunk', () => {
    const after = stripped(pngFixture(1)).bytes;
    expect(pngChunkTypes(after)).toEqual(['IHDR', 'iCCP', 'IDAT', 'IEND']);
    expect(contains(after, NEEDLE.icc)).toBe(true);
  });

  it('keeps the colour profile of a WebP and clears the metadata flags', () => {
    const after = stripped(webpFixture(1)).bytes;
    expect(webpChunkNames(after)).toEqual(['VP8X', 'ICCP', 'VP8 ']);
    expect(after[20]).toBe(0x20);
    expect(contains(after, NEEDLE.icc)).toBe(true);
  });

  it('declares a RIFF size that matches the bytes it wrote', () => {
    const after = stripped(webpFixture(1)).bytes;
    const declared =
      (after[4] ?? 0) +
      ((after[5] ?? 0) << 8) +
      ((after[6] ?? 0) << 16) +
      (after[7] ?? 0) * 0x1000000;
    expect(declared + 8).toBe(after.length);
  });

  it('keeps the loop count of an animated GIF and drops its comment', () => {
    const after = stripped(gifFixture()).bytes;
    expect(contains(after, 'NETSCAPE2.0')).toBe(true);
    expect(contains(after, NEEDLE.text)).toBe(false);
    expect(contains(after, NEEDLE.xmp)).toBe(false);
    expect(after[after.length - 1]).toBe(0x3b);
  });
});

describe('which way up the picture is', () => {
  it('carries a rotated JPEG over as the only tag left', () => {
    const result = stripped(jpegFixture(6));
    expect(result.orientation).toBe(6);
    expect(jpegMarkers(result.bytes)).toEqual([0xe1, 0xe0, 0xe2, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]);

    const payloadLength = ((result.bytes[4] ?? 0) << 8) | (result.bytes[5] ?? 0);
    expect(payloadLength).toBe(34);
    expect(readExifOrientation(result.bytes.subarray(12, 4 + payloadLength))).toBe(6);
    expect(contains(result.bytes, NEEDLE.make)).toBe(false);
  });

  it('carries a rotated PNG over in an eXIf chunk that holds nothing else', () => {
    const result = stripped(pngFixture(8));
    expect(result.orientation).toBe(8);
    expect(pngChunkTypes(result.bytes)).toEqual(['IHDR', 'eXIf', 'iCCP', 'IDAT', 'IEND']);
    expect(contains(result.bytes, NEEDLE.make)).toBe(false);
  });

  it('carries a rotated WebP over and sets the flag back on', () => {
    const result = stripped(webpFixture(3));
    expect(result.orientation).toBe(3);
    expect(webpChunkNames(result.bytes)).toEqual(['VP8X', 'ICCP', 'VP8 ', 'EXIF']);
    expect(result.bytes[20]).toBe(0x28);
    expect(contains(result.bytes, NEEDLE.taken)).toBe(false);
  });

  it('writes no orientation tag at all when the picture is already upright', () => {
    expect(jpegMarkers(stripped(jpegFixture(1)).bytes)).not.toContain(0xe1);
    expect(pngChunkTypes(stripped(pngFixture(1)).bytes)).not.toContain('eXIf');
    expect(webpChunkNames(stripped(webpFixture(1)).bytes)).not.toContain('EXIF');
  });

  it('reads an orientation written the other way round', () => {
    const little = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(readExifOrientation(little)).toBe(7);
  });

  it('answers upright for a value no renderer would accept', () => {
    const tiff = new Uint8Array(exifTiff(9));
    expect(readExifOrientation(tiff)).toBe(1);
  });
});

describe('bytes it will not vouch for', () => {
  it('refuses a JPEG whose segments run past the end of the file', () => {
    const file = jpegFixture(1);
    const truncated = file.subarray(0, 40);
    expect(stripImageMetadata(truncated).status).toBe('unreadable');
  });

  it('refuses a JPEG that never reaches its end marker', () => {
    const file = jpegFixture(1);
    expect(stripImageMetadata(file.subarray(0, file.length - 2)).status).toBe('unreadable');
  });

  it('refuses a PNG with a chunk longer than the file', () => {
    const file = pngFixture(1);
    const broken = file.slice();
    broken[8] = 0x7f;
    expect(stripImageMetadata(broken).status).toBe('unreadable');
  });

  it('refuses a PNG that carries no pixels', () => {
    const headerOnly = new Uint8Array([
      ...PNG_SIGNATURE,
      ...pngChunk('IHDR', [...u32(1), ...u32(1), 8, 2, 0, 0, 0]),
      ...pngChunk('IEND', []),
    ]);
    expect(stripImageMetadata(headerOnly).status).toBe('unreadable');
  });

  it('refuses a WebP with no image chunk', () => {
    const body = [...ascii('WEBP'), ...webpChunk('EXIF', exifTiff(1))];
    const file = new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);
    expect(stripImageMetadata(file).status).toBe('unreadable');
  });

  it('refuses a GIF that stops before its trailer', () => {
    const file = gifFixture();
    expect(stripImageMetadata(file.subarray(0, file.length - 1)).status).toBe('unreadable');
  });

  it('refuses bytes that are not a picture at all', () => {
    expect(stripImageMetadata(new Uint8Array(ascii('%PDF-1.7'))).status).toBe('unreadable');
    expect(stripImageMetadata(new Uint8Array(0)).status).toBe('unreadable');
  });

  it('names the format from the bytes, not from a claim about them', () => {
    expect(detectImageFormat(pngFixture(1))).toBe('png');
    expect(detectImageFormat(jpegFixture(1))).toBe('jpeg');
    expect(detectImageFormat(webpFixture(1))).toBe('webp');
    expect(detectImageFormat(gifFixture())).toBe('gif');
    expect(detectImageFormat(new Uint8Array(ascii('GIF89')))).toBeNull();
  });
});

describe('the bytes the caller handed in', () => {
  it.each([
    ['JPEG', jpegFixture(6)],
    ['PNG', pngFixture(8)],
    ['WebP', webpFixture(3)],
    ['GIF', gifFixture()],
  ] as const)('is not touched while %s is stripped', (_name, file) => {
    const original = file.slice();
    const result = stripped(file);
    expect(Array.from(file)).toEqual(Array.from(original));
    expect(result.bytes).not.toBe(file);
  });

  it('strips an already stripped picture to the same bytes', () => {
    const once = stripped(jpegFixture(6)).bytes;
    const twice = stripped(once).bytes;
    expect(Array.from(twice)).toEqual(Array.from(once));
  });
});
