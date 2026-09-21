export const IMAGE_METADATA_FORMATS = ['jpeg', 'png', 'webp', 'gif'] as const;

export type ImageMetadataFormat = (typeof IMAGE_METADATA_FORMATS)[number];

export const DEFAULT_IMAGE_ORIENTATION = 1;

export type ImageMetadataResult =
  | {
      status: 'stripped';
      format: ImageMetadataFormat;
      bytes: Uint8Array<ArrayBuffer>;
      orientation: number;
    }
  | { status: 'unreadable' };

const UNREADABLE: ImageMetadataResult = { status: 'unreadable' };

const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
const JPEG_APP0 = 0xe0;
const JPEG_APP1 = 0xe1;
const JPEG_APP2 = 0xe2;
const JPEG_APP14 = 0xee;
const JPEG_APP15 = 0xef;
const JPEG_COMMENT = 0xfe;

const TIFF_ORIENTATION_TAG = 0x0112;
const MAX_ORIENTATION = 8;

// Everything a decoder needs and nothing that describes the camera or the
// place: text, time and vendor chunks are not on these lists.
const PNG_KEPT_CHUNKS: ReadonlySet<string> = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'bKGD',
  'hIST',
  'pHYs',
  'sPLT',
  'acTL',
  'fcTL',
  'fdAT',
  'cICP',
  'mDCv',
  'cLLi',
]);

const WEBP_KEPT_CHUNKS: ReadonlySet<string> = new Set([
  'VP8X',
  'ICCP',
  'ANIM',
  'ANMF',
  'ALPH',
  'VP8 ',
  'VP8L',
]);

const WEBP_EXIF_FLAG = 0x08;
const WEBP_XMP_FLAG = 0x04;

function isAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return value;
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset + 3] ?? 0) * 0x1000000 +
      ((bytes[offset + 2] ?? 0) << 16) +
      ((bytes[offset + 1] ?? 0) << 8) +
      (bytes[offset] ?? 0)) >>>
    0
  );
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Orientation out of a TIFF header, which is what an Exif payload is once its
 * own prefix is removed. Anything unreadable answers upright rather than guess.
 */
export function readExifOrientation(tiff: Uint8Array): number {
  if (tiff.length < 8) return DEFAULT_IMAGE_ORIENTATION;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return DEFAULT_IMAGE_ORIENTATION;

  const u16 = (offset: number): number =>
    little
      ? (bytesAt(tiff, offset) | (bytesAt(tiff, offset + 1) << 8)) >>> 0
      : ((bytesAt(tiff, offset) << 8) | bytesAt(tiff, offset + 1)) >>> 0;
  const u32 = (offset: number): number =>
    little
      ? (bytesAt(tiff, offset) +
          bytesAt(tiff, offset + 1) * 0x100 +
          bytesAt(tiff, offset + 2) * 0x10000 +
          bytesAt(tiff, offset + 3) * 0x1000000) >>>
        0
      : readU32BE(tiff, offset);

  if (u16(2) !== 0x2a) return DEFAULT_IMAGE_ORIENTATION;
  const directory = u32(4);
  if (directory + 2 > tiff.length) return DEFAULT_IMAGE_ORIENTATION;
  const entries = u16(directory);
  for (let i = 0; i < entries; i += 1) {
    const entry = directory + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) !== TIFF_ORIENTATION_TAG) continue;
    const value = u16(entry + 8);
    return value >= 1 && value <= MAX_ORIENTATION ? value : DEFAULT_IMAGE_ORIENTATION;
  }
  return DEFAULT_IMAGE_ORIENTATION;
}

function bytesAt(bytes: Uint8Array, offset: number): number {
  return bytes[offset] ?? 0;
}

/** A TIFF block whose single entry is the orientation. */
function orientationTiff(orientation: number): Uint8Array {
  return new Uint8Array([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    (orientation >> 8) & 0xff,
    orientation & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

export function detectImageFormat(bytes: Uint8Array): ImageMetadataFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    isAscii(bytes, 1, 'PNG') &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 12 && isAscii(bytes, 0, 'RIFF') && isAscii(bytes, 8, 'WEBP')) {
    return 'webp';
  }
  if (bytes.length >= 6 && (isAscii(bytes, 0, 'GIF87a') || isAscii(bytes, 0, 'GIF89a'))) {
    return 'gif';
  }
  return null;
}

function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === JPEG_APP0) return isAscii(payload, 0, 'JFIF') && payload[4] === 0;
  if (marker === JPEG_APP2) return isAscii(payload, 0, 'ICC_PROFILE') && payload[11] === 0;
  if (marker === JPEG_APP14) return isAscii(payload, 0, 'Adobe');
  if (marker >= JPEG_APP0 && marker <= JPEG_APP15) return false;
  return marker !== JPEG_COMMENT;
}

function endOfScan(bytes: Uint8Array, from: number): number {
  let cursor = from;
  while (cursor + 1 < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    const next = bytes[cursor + 1] ?? 0;
    if (next === 0xff) {
      cursor += 1;
      continue;
    }
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      cursor += 2;
      continue;
    }
    return cursor;
  }
  return bytes.length;
}

function stripJpeg(bytes: Uint8Array): ImageMetadataResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return UNREADABLE;

  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation = DEFAULT_IMAGE_ORIENTATION;
  let offset = 2;
  let sawScan = false;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return UNREADABLE;
    let marker = bytes[offset + 1] ?? 0;
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1] ?? 0;
    }

    if (marker === JPEG_EOI) {
      parts.push(new Uint8Array([0xff, JPEG_EOI]));
      if (!sawScan) return UNREADABLE;
      if (orientation !== DEFAULT_IMAGE_ORIENTATION) {
        parts.splice(1, 0, jpegExifSegment(orientation));
      }
      return { status: 'stripped', format: 'jpeg', bytes: concat(parts), orientation };
    }

    if (offset + 3 >= bytes.length) return UNREADABLE;
    const length = readU16BE(bytes, offset + 2);
    if (length < 2) return UNREADABLE;
    const end = offset + 2 + length;
    if (end > bytes.length) return UNREADABLE;

    const payload = bytes.subarray(offset + 4, end);
    if (marker === JPEG_APP1 && isAscii(payload, 0, 'Exif') && payload[4] === 0) {
      orientation = readExifOrientation(payload.subarray(6));
    } else if (keepJpegSegment(marker, payload)) {
      parts.push(bytes.subarray(offset, end));
    }

    offset = end;
    if (marker === JPEG_SOS) {
      const scanEnd = endOfScan(bytes, end);
      parts.push(bytes.subarray(end, scanEnd));
      offset = scanEnd;
      sawScan = true;
    }
  }

  return UNREADABLE;
}

function jpegExifSegment(orientation: number): Uint8Array {
  const tiff = orientationTiff(orientation);
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  payload.set(tiff, 6);
  const segment = new Uint8Array(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = JPEG_APP1;
  segment[2] = ((payload.length + 2) >> 8) & 0xff;
  segment[3] = (payload.length + 2) & 0xff;
  segment.set(payload, 4);
  return segment;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  chunk[0] = (data.length >>> 24) & 0xff;
  chunk[1] = (data.length >>> 16) & 0xff;
  chunk[2] = (data.length >>> 8) & 0xff;
  chunk[3] = data.length & 0xff;
  for (let i = 0; i < 4; i += 1) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  chunk[8 + data.length] = (crc >>> 24) & 0xff;
  chunk[9 + data.length] = (crc >>> 16) & 0xff;
  chunk[10 + data.length] = (crc >>> 8) & 0xff;
  chunk[11 + data.length] = crc & 0xff;
  return chunk;
}

function stripPng(bytes: Uint8Array): ImageMetadataResult {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let orientation = DEFAULT_IMAGE_ORIENTATION;
  let offset = 8;
  let headerIndex = -1;
  let sawPixels = false;
  let sawEnd = false;

  while (offset + 12 <= bytes.length) {
    const length = readU32BE(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return UNREADABLE;
    const type = asciiAt(bytes, offset + 4, 4);

    if (type === 'IHDR') {
      if (parts.length !== 1) return UNREADABLE;
      headerIndex = 2;
    }
    if (type === 'IDAT') sawPixels = true;

    if (type === 'eXIf') {
      orientation = readExifOrientation(bytes.subarray(offset + 8, offset + 8 + length));
    } else if (PNG_KEPT_CHUNKS.has(type)) {
      parts.push(bytes.subarray(offset, end));
    }

    offset = end;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }

  if (headerIndex < 0 || !sawPixels || !sawEnd) return UNREADABLE;
  if (orientation !== DEFAULT_IMAGE_ORIENTATION) {
    parts.splice(headerIndex, 0, pngChunk('eXIf', orientationTiff(orientation)));
  }
  return { status: 'stripped', format: 'png', bytes: concat(parts), orientation };
}

function webpChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const padded = data.length + (data.length & 1);
  const chunk = new Uint8Array(8 + padded);
  for (let i = 0; i < 4; i += 1) chunk[i] = fourcc.charCodeAt(i);
  chunk[4] = data.length & 0xff;
  chunk[5] = (data.length >>> 8) & 0xff;
  chunk[6] = (data.length >>> 16) & 0xff;
  chunk[7] = (data.length >>> 24) & 0xff;
  chunk.set(data, 8);
  return chunk;
}

function stripWebp(bytes: Uint8Array): ImageMetadataResult {
  const declared = readU32LE(bytes, 4);
  const limit = Math.min(bytes.length, 8 + declared);
  if (limit < 12) return UNREADABLE;

  const chunks: Uint8Array[] = [];
  let orientation = DEFAULT_IMAGE_ORIENTATION;
  let header: Uint8Array | null = null;
  let sawPixels = false;
  let offset = 12;

  while (offset + 8 <= limit) {
    const fourcc = asciiAt(bytes, offset, 4);
    const size = readU32LE(bytes, offset + 4);
    const end = offset + 8 + size + (size & 1);
    if (end > limit) return UNREADABLE;

    if (fourcc === 'EXIF') {
      orientation = readExifOrientation(bytes.subarray(offset + 8, offset + 8 + size));
    } else if (WEBP_KEPT_CHUNKS.has(fourcc)) {
      if (fourcc === 'VP8X') {
        if (size < 10) return UNREADABLE;
        header = bytes.slice(offset, end);
        header[8] = (header[8] ?? 0) & ~(WEBP_EXIF_FLAG | WEBP_XMP_FLAG) & 0xff;
        chunks.push(header);
      } else {
        if (fourcc === 'VP8 ' || fourcc === 'VP8L' || fourcc === 'ANMF') sawPixels = true;
        chunks.push(bytes.subarray(offset, end));
      }
    }

    offset = end;
  }

  if (!sawPixels) return UNREADABLE;
  if (orientation !== DEFAULT_IMAGE_ORIENTATION && header) {
    header[8] = ((header[8] ?? 0) | WEBP_EXIF_FLAG) & 0xff;
    chunks.push(webpChunk('EXIF', orientationTiff(orientation)));
  }

  let payloadSize = 4;
  for (const chunk of chunks) payloadSize += chunk.length;
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46], 0);
  head[4] = payloadSize & 0xff;
  head[5] = (payloadSize >>> 8) & 0xff;
  head[6] = (payloadSize >>> 16) & 0xff;
  head[7] = (payloadSize >>> 24) & 0xff;
  head.set([0x57, 0x45, 0x42, 0x50], 8);

  return {
    status: 'stripped',
    format: 'webp',
    bytes: concat([head, ...chunks]),
    orientation,
  };
}

function endOfSubBlocks(bytes: Uint8Array, from: number): number {
  let cursor = from;
  while (cursor < bytes.length) {
    const size = bytes[cursor] ?? 0;
    if (size === 0) return cursor + 1;
    cursor += 1 + size;
  }
  return -1;
}

function stripGif(bytes: Uint8Array): ImageMetadataResult {
  if (bytes.length < 13) return UNREADABLE;
  const descriptor = bytes[10] ?? 0;
  let offset = 13;
  if (descriptor & 0x80) offset += 3 * (1 << ((descriptor & 0x07) + 1));
  if (offset > bytes.length) return UNREADABLE;

  const parts: Uint8Array[] = [bytes.subarray(0, offset)];
  let sawPixels = false;

  while (offset < bytes.length) {
    const block = bytes[offset] ?? 0;

    if (block === 0x3b) {
      parts.push(new Uint8Array([0x3b]));
      if (!sawPixels) return UNREADABLE;
      return { status: 'stripped', format: 'gif', bytes: concat(parts), orientation: 1 };
    }

    if (block === 0x21) {
      const label = bytes[offset + 1] ?? 0;
      const end = endOfSubBlocks(bytes, offset + 2);
      if (end < 0) return UNREADABLE;
      const loopCount =
        label === 0xff && bytes[offset + 2] === 0x0b && isAscii(bytes, offset + 3, 'NETSCAPE2.0');
      if (label === 0xf9 || loopCount) parts.push(bytes.subarray(offset, end));
      offset = end;
      continue;
    }

    if (block === 0x2c) {
      if (offset + 10 > bytes.length) return UNREADABLE;
      const local = bytes[offset + 9] ?? 0;
      let cursor = offset + 10;
      if (local & 0x80) cursor += 3 * (1 << ((local & 0x07) + 1));
      if (cursor + 1 > bytes.length) return UNREADABLE;
      const end = endOfSubBlocks(bytes, cursor + 1);
      if (end < 0) return UNREADABLE;
      parts.push(bytes.subarray(offset, end));
      sawPixels = true;
      offset = end;
      continue;
    }

    return UNREADABLE;
  }

  return UNREADABLE;
}

/**
 * Removes every segment that describes where, when and on what a picture was
 * taken, keeps the pixels and the colour profile byte for byte, and carries the
 * orientation over as the one tag that survives.
 */
export function stripImageMetadata(bytes: Uint8Array): ImageMetadataResult {
  switch (detectImageFormat(bytes)) {
    case 'jpeg':
      return stripJpeg(bytes);
    case 'png':
      return stripPng(bytes);
    case 'webp':
      return stripWebp(bytes);
    case 'gif':
      return stripGif(bytes);
    default:
      return UNREADABLE;
  }
}
