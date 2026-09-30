export interface MaskPoint {
  x: number;
  y: number;
}

export interface MaskStroke {
  width: number;
  points: MaskPoint[];
}

export interface ImageDimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const STORED_BLOCK_MAX = 0xffff;
const BASE64_CHUNK = 0x8000;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
    const startOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) {
      return {
        height: (bytes[offset + 5]! << 8) + bytes[offset + 6]!,
        width: (bytes[offset + 7]! << 8) + bytes[offset + 8]!,
      };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
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

export function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length > 24 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegDimensions(bytes);
  if (
    bytes.length > 30 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return webpDimensions(bytes);
  }
  return null;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1)
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32BE(out, 0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeUint32BE(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / STORED_BLOCK_MAX));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let offset = 2;
  for (let block = 0; block < blocks; block += 1) {
    const start = block * STORED_BLOCK_MAX;
    const length = Math.min(STORED_BLOCK_MAX, raw.length - start);
    out[offset] = block === blocks - 1 ? 1 : 0;
    out[offset + 1] = length & 0xff;
    out[offset + 2] = (length >>> 8) & 0xff;
    out[offset + 3] = ~length & 0xff;
    out[offset + 4] = (~length >>> 8) & 0xff;
    out.set(raw.subarray(start, start + length), offset + 5);
    offset += 5 + length;
  }
  writeUint32BE(out, offset, adler32(raw));
  return out;
}

function stamp(
  alpha: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): void {
  const r2 = radius * radius;
  const top = Math.max(0, Math.floor(cy - radius));
  const bottom = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = top; y <= bottom; y += 1) {
    const dy = y - cy;
    const span = Math.sqrt(Math.max(0, r2 - dy * dy));
    const left = Math.max(0, Math.floor(cx - span));
    const right = Math.min(width - 1, Math.ceil(cx + span));
    alpha.fill(0, y * width + left, y * width + right + 1);
  }
}

export function hasMaskArea(strokes: readonly MaskStroke[]): boolean {
  return strokes.some((stroke) => stroke.points.length > 0);
}

export function maskPngBase64(strokes: readonly MaskStroke[], size: ImageDimensions): string {
  const { width, height } = size;
  const alpha = new Uint8Array(width * height).fill(255);
  for (const stroke of strokes) {
    const radius = Math.max(1, (stroke.width * width) / 2);
    const step = Math.max(1, radius / 2);
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      const previous = index > 0 ? stroke.points[index - 1]! : point;
      const px = previous.x * width;
      const py = previous.y * height;
      const distance = Math.hypot(x - px, y - py);
      const steps = Math.max(1, Math.ceil(distance / step));
      for (let s = 0; s <= steps; s += 1) {
        stamp(
          alpha,
          width,
          height,
          px + ((x - px) * s) / steps,
          py + ((y - py) * s) / steps,
          radius,
        );
      }
    });
  }
  const rowLength = 1 + width * 2;
  const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    for (let x = 0; x < width; x += 1) raw[rowStart + 2 + x * 2] = alpha[y * width + x]!;
  }
  const header = new Uint8Array(13);
  writeUint32BE(header, 0, width);
  writeUint32BE(header, 4, height);
  header[8] = 8;
  header[9] = 4;
  const parts = [
    new Uint8Array(PNG_SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return bytesToBase64(png);
}
