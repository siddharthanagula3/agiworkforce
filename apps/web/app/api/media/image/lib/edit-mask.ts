import 'server-only';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_COLOR_TYPES_WITH_ALPHA = new Set([4, 6]);

interface ImageSize {
  width: number;
  height: number;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 33 && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function pngSize(bytes: Uint8Array): ImageSize {
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

function pngHasAlpha(bytes: Uint8Array): boolean {
  if (PNG_COLOR_TYPES_WITH_ALPHA.has(bytes[25]!)) return true;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'tRNS') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + length;
  }
  return false;
}

function jpegSize(bytes: Uint8Array): ImageSize | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return {
        height: (bytes[offset + 5]! << 8) + bytes[offset + 6]!,
        width: (bytes[offset + 7]! << 8) + bytes[offset + 8]!,
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  const header = String.fromCharCode(...bytes.subarray(0, 4));
  const format = String.fromCharCode(...bytes.subarray(8, 12));
  if (header !== 'RIFF' || format !== 'WEBP' || bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') {
    return {
      width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
      height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function imageSize(bytes: Uint8Array): ImageSize | null {
  if (isPng(bytes)) return pngSize(bytes);
  return jpegSize(bytes) ?? webpSize(bytes);
}

export function editMaskProblem(sourceBytes: Uint8Array, maskBytes: Uint8Array): string | null {
  if (!isPng(maskBytes)) {
    return 'The mask must be a PNG image. Draw the area to change, or upload a PNG mask.';
  }
  if (!pngHasAlpha(maskBytes)) {
    return 'The mask needs transparency: the transparent part marks the area to change.';
  }
  const source = imageSize(sourceBytes);
  const mask = pngSize(maskBytes);
  if (source && (source.width !== mask.width || source.height !== mask.height)) {
    return `The mask is ${mask.width}×${mask.height} but the image is ${source.width}×${source.height}. They must be the same size.`;
  }
  return null;
}
