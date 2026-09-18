export type SniffedImageFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export type ImageStructureRejection =
  'empty' | 'too_large' | 'unknown_format' | 'malformed' | 'active_content';

export type ImageStructureVerdict =
  | { valid: true; format: SniffedImageFormat; byteLength: number }
  | { valid: false; reason: ImageStructureRejection; format?: SniffedImageFormat };

export const MAX_INSPECTED_IMAGE_BYTES = 25 * 1024 * 1024;

const ACTIVE_CONTENT = /<(?:\?xml|!doctype|svg|html|script|iframe|embed|object)\b/i;

function looksLikeActiveContent(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  return ACTIVE_CONTENT.test(head);
}

function sniffFormat(bytes: Buffer): SniffedImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes.readUInt32BE(0) === 0x89504e47 &&
    bytes.readUInt32BE(4) === 0x0d0a1a0a
  )
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii')))
    return 'image/gif';
  return null;
}

// A strict parse is also the polyglot defence: every format below must end
// exactly where its terminator sits, so appended payloads fail the parse.
function hasValidPngStructure(bytes: Buffer): boolean {
  if (bytes.length < 45) return false;
  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      if (bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0)
        return false;
      sawHeader = true;
    }
    if (type === 'IDAT' && length > 0) sawImageData = true;
    if (type === 'IEND') return length === 0 && end === bytes.length && sawHeader && sawImageData;
    offset = end;
  }
  return false;
}

function hasValidJpegStructure(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    return false;
  }

  let offset = 2;
  let sawFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0x00 || marker === 0xd8 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false;

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (segmentLength < 8) return false;
      if (bytes.readUInt16BE(offset + 3) === 0 || bytes.readUInt16BE(offset + 5) === 0)
        return false;
      sawFrame = true;
    }

    if (marker === 0xda) return sawFrame && offset + segmentLength < bytes.length - 2;
    offset += segmentLength;
  }
  return false;
}

function hasValidWebpStructure(bytes: Buffer): boolean {
  if (bytes.length < 20 || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  const chunkType = bytes.subarray(12, 16).toString('ascii');
  const chunkLength = bytes.readUInt32LE(16);
  const paddedLength = chunkLength + (chunkLength % 2);
  return (
    ['VP8 ', 'VP8L', 'VP8X'].includes(chunkType) &&
    chunkLength > 0 &&
    20 + paddedLength <= bytes.length
  );
}

function hasValidGifStructure(bytes: Buffer): boolean {
  if (bytes.length < 14 || bytes[bytes.length - 1] !== 0x3b) return false;
  return bytes.readUInt16LE(6) !== 0 && bytes.readUInt16LE(8) !== 0;
}

export function inspectImageBytes(
  bytes: Uint8Array,
  options: { maxBytes?: number } = {},
): ImageStructureVerdict {
  const maxBytes = options.maxBytes ?? MAX_INSPECTED_IMAGE_BYTES;
  if (bytes.length === 0) return { valid: false, reason: 'empty' };
  if (bytes.length > maxBytes) return { valid: false, reason: 'too_large' };
  if (looksLikeActiveContent(bytes)) return { valid: false, reason: 'active_content' };

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = sniffFormat(buffer);
  if (!format) return { valid: false, reason: 'unknown_format' };

  const structural =
    format === 'image/png'
      ? hasValidPngStructure(buffer)
      : format === 'image/jpeg'
        ? hasValidJpegStructure(buffer)
        : format === 'image/webp'
          ? hasValidWebpStructure(buffer)
          : hasValidGifStructure(buffer);

  if (!structural) return { valid: false, reason: 'malformed', format };
  return { valid: true, format, byteLength: bytes.length };
}
