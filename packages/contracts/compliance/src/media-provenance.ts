import {
  hasAiActProvenanceClaim,
  serialiseAiActProvenanceClaim,
  type AiActProvenanceClaim,
} from '@agiworkforce/types';

export const DIGITAL_SOURCE_TYPE =
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

export type ProvenanceVideoMimeType = 'video/mp4' | 'video/quicktime' | 'video/webm';

export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export interface VideoProvenancePatch {
  readonly offset: number;
  readonly bytes: Uint8Array;
}

export interface VideoProvenancePlan {
  readonly patches: readonly VideoProvenancePatch[];
  readonly append: Uint8Array;
}

const AGI_NAMESPACE = 'https://agiworkforce.com/ns/provenance/1.0/';
const PROVENANCE_ATTRIBUTE = 'agi:Provenance="';

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PNG_XMP_KEYWORD = 'XML:com.adobe.xmp';
const JPEG_XMP_NAMESPACE = 'http://ns.adobe.com/xap/1.0/\0';
const JPEG_EXIF_HEADER = 'Exif\0\0';
const JPEG_MAX_SEGMENT_LENGTH = 0xffff;
const WEBP_XMP_FLAG = 0x04;
const WEBP_ALPHA_FLAG = 0x10;
const ISO_XMP_UUID = Uint8Array.of(
  0xbe,
  0x7a,
  0xcf,
  0xcb,
  0x97,
  0xa9,
  0x42,
  0xe8,
  0x9c,
  0x71,
  0x99,
  0x94,
  0x91,
  0xe3,
  0xaf,
  0xac,
);
const ISO_MAX_TOP_LEVEL_BOXES = 10_000;
const EBML_HEADER_ID = [0x1a, 0x45, 0xdf, 0xa3];
const MATROSKA_SEGMENT_ID = [0x18, 0x53, 0x80, 0x67];
const MATROSKA_HEAD_BYTES = 4096;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function ascii(text: string): Uint8Array {
  return encoder.encode(text);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function readU32be(bytes: Uint8Array, at: number): number | null {
  if (at < 0 || at + 4 > bytes.length) return null;
  return new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);
}

function readU32le(bytes: Uint8Array, at: number): number | null {
  if (at < 0 || at + 4 > bytes.length) return null;
  return new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true);
}

function readU16be(bytes: Uint8Array, at: number): number | null {
  if (at < 0 || at + 2 > bytes.length) return null;
  return new DataView(bytes.buffer, bytes.byteOffset + at, 2).getUint16(0);
}

function startsWith(bytes: Uint8Array, prefix: ArrayLike<number>, at = 0): boolean {
  if (at < 0 || at + prefix.length > bytes.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[at + index] !== prefix[index]) return false;
  }
  return true;
}

function fourcc(bytes: Uint8Array, at: number): string | null {
  if (at < 0 || at + 4 > bytes.length) return null;
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function buildMediaXmpPacket(claim: AiActProvenanceClaim): string {
  let attributes =
    `Iptc4xmpExt:DigitalSourceType="${DIGITAL_SOURCE_TYPE}" ` +
    `xmp:CreatorTool="${xmlEscape(claim.claim_generator)}"`;
  if (claim.generated_at) attributes += ` xmp:CreateDate="${xmlEscape(claim.generated_at)}"`;
  attributes += ` ${PROVENANCE_ATTRIBUTE}${xmlEscape(serialiseAiActProvenanceClaim(claim))}"`;
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" ' +
    'xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" ' +
    'xmlns:xmp="http://ns.adobe.com/xap/1.0/" ' +
    `xmlns:agi="${AGI_NAMESPACE}" ${attributes}/>` +
    '</rdf:RDF>' +
    '</x:xmpmeta>' +
    '<?xpacket end="r"?>'
  );
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface PngChunk {
  readonly type: string;
  readonly raw: Uint8Array;
  readonly data: Uint8Array;
}

function pngChunks(bytes: Uint8Array): PngChunk[] | null {
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    const length = readU32be(bytes, offset);
    const type = fourcc(bytes, offset + 4);
    if (length === null || type === null) return null;
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    chunks.push({
      type,
      raw: bytes.subarray(offset, end),
      data: bytes.subarray(offset + 8, offset + 8 + length),
    });
    offset = end;
    if (type === 'IEND') break;
  }
  if (chunks[0]?.type !== 'IHDR' || chunks[chunks.length - 1]?.type !== 'IEND') return null;
  return chunks;
}

function isPngXmp(chunk: PngChunk): boolean {
  return (
    chunk.type === 'iTXt' &&
    startsWith(chunk.data, ascii(PNG_XMP_KEYWORD)) &&
    chunk.data[PNG_XMP_KEYWORD.length] === 0
  );
}

function embedPng(bytes: Uint8Array, xmp: string): Uint8Array | null {
  const chunks = pngChunks(bytes);
  if (!chunks) return null;
  const text = concat([ascii(PNG_XMP_KEYWORD), Uint8Array.of(0, 0, 0, 0, 0), ascii(xmp)]);
  const typed = concat([ascii('iTXt'), text]);
  const label = concat([u32be(text.length), typed, u32be(crc32(typed))]);
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    if (isPngXmp(chunk)) continue;
    parts.push(chunk.raw);
    if (chunk.type === 'IHDR') parts.push(label);
  }
  return concat(parts);
}

interface JpegSegment {
  readonly marker: number;
  readonly bytes: Uint8Array;
}

function jpegSegments(bytes: Uint8Array): { segments: JpegSegment[]; tail: Uint8Array } | null {
  const segments: JpegSegment[] = [];
  let offset = 2;
  for (;;) {
    if (bytes[offset] !== 0xff) return null;
    let markerAt = offset + 1;
    while (bytes[markerAt] === 0xff) markerAt += 1;
    const marker = bytes[markerAt];
    if (marker === undefined) return null;
    if (marker === 0xda) return { segments, tail: bytes.subarray(offset) };
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) return null;
    const length = readU16be(bytes, markerAt + 1);
    if (length === null || length < 2) return null;
    const end = markerAt + 1 + length;
    if (end > bytes.length) return null;
    segments.push({ marker, bytes: bytes.subarray(markerAt - 1, end) });
    offset = end;
  }
}

function isJpegXmp(segment: JpegSegment): boolean {
  return segment.marker === 0xe1 && startsWith(segment.bytes, ascii(JPEG_XMP_NAMESPACE), 4);
}

function jpegLeads(segment: JpegSegment): boolean {
  if (segment.marker === 0xe0) return true;
  return segment.marker === 0xe1 && startsWith(segment.bytes, ascii(JPEG_EXIF_HEADER), 4);
}

function embedJpeg(bytes: Uint8Array, xmp: string): Uint8Array | null {
  const parsed = jpegSegments(bytes);
  if (!parsed) return null;
  const payload = concat([ascii(JPEG_XMP_NAMESPACE), ascii(xmp)]);
  const length = 2 + payload.length;
  if (length > JPEG_MAX_SEGMENT_LENGTH) return null;
  const label = concat([Uint8Array.of(0xff, 0xe1, length >> 8, length & 0xff), payload]);
  const kept = parsed.segments.filter((segment) => !isJpegXmp(segment));
  let lead = 0;
  while (lead < kept.length && jpegLeads(kept[lead]!)) lead += 1;
  return concat([
    Uint8Array.of(0xff, 0xd8),
    ...kept.slice(0, lead).map((segment) => segment.bytes),
    label,
    ...kept.slice(lead).map((segment) => segment.bytes),
    parsed.tail,
  ]);
}

interface WebpChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && fourcc(bytes, 0) === 'RIFF' && fourcc(bytes, 8) === 'WEBP';
}

function webpChunks(bytes: Uint8Array): WebpChunk[] | null {
  const declared = readU32le(bytes, 4);
  if (declared === null) return null;
  const end = Math.min(declared + 8, bytes.length);
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset + 8 <= end) {
    const type = fourcc(bytes, offset);
    const size = readU32le(bytes, offset + 4);
    if (type === null || size === null || offset + 8 + size > bytes.length) return null;
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + size) });
    offset += 8 + size + (size & 1);
  }
  return chunks.length > 0 ? chunks : null;
}

function webpCanvas(chunk: WebpChunk): { width: number; height: number; alpha: boolean } | null {
  const { data } = chunk;
  if (chunk.type === 'VP8X') {
    if (data.length < 10) return null;
    const width = (data[4]! | (data[5]! << 8) | (data[6]! << 16)) + 1;
    const height = (data[7]! | (data[8]! << 8) | (data[9]! << 16)) + 1;
    return { width, height, alpha: (data[0]! & WEBP_ALPHA_FLAG) !== 0 };
  }
  if (chunk.type === 'VP8 ') {
    if (data.length < 10 || !startsWith(data, [0x9d, 0x01, 0x2a], 3)) return null;
    return {
      width: (data[6]! | (data[7]! << 8)) & 0x3fff,
      height: (data[8]! | (data[9]! << 8)) & 0x3fff,
      alpha: false,
    };
  }
  if (chunk.type === 'VP8L') {
    if (data.length < 5 || data[0] !== 0x2f) return null;
    const bits = readU32le(data, 1)!;
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      alpha: ((bits >>> 28) & 1) === 1,
    };
  }
  return null;
}

function webpChunkBytes(type: string, data: Uint8Array): Uint8Array {
  return concat([
    ascii(type),
    u32le(data.length),
    data,
    data.length % 2 === 1 ? Uint8Array.of(0) : new Uint8Array(0),
  ]);
}

function embedWebp(bytes: Uint8Array, xmp: string): Uint8Array | null {
  const chunks = webpChunks(bytes);
  const first = chunks?.[0];
  if (!chunks || !first) return null;
  const parts: Uint8Array[] = [ascii('WEBP')];
  if (first.type === 'VP8X') {
    const header = first.data.slice();
    if (header.length === 0) return null;
    header[0] = header[0]! | WEBP_XMP_FLAG;
    parts.push(webpChunkBytes('VP8X', header));
  } else {
    const canvas = webpCanvas(first);
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const header = new Uint8Array(10);
    header[0] = WEBP_XMP_FLAG | (canvas.alpha ? WEBP_ALPHA_FLAG : 0);
    const widthLess = canvas.width - 1;
    const heightLess = canvas.height - 1;
    header.set([widthLess & 0xff, (widthLess >> 8) & 0xff, (widthLess >> 16) & 0xff], 4);
    header.set([heightLess & 0xff, (heightLess >> 8) & 0xff, (heightLess >> 16) & 0xff], 7);
    parts.push(webpChunkBytes('VP8X', header), webpChunkBytes(first.type, first.data));
  }
  for (const chunk of chunks.slice(1)) {
    if (chunk.type === 'XMP ') continue;
    parts.push(webpChunkBytes(chunk.type, chunk.data));
  }
  parts.push(webpChunkBytes('XMP ', ascii(xmp)));
  const body = concat(parts);
  return concat([ascii('RIFF'), u32le(body.length), body]);
}

export function embedImageProvenance(
  bytes: Uint8Array,
  claim: AiActProvenanceClaim,
): Uint8Array | null {
  const xmp = buildMediaXmpPacket(claim);
  if (startsWith(bytes, PNG_SIGNATURE)) return embedPng(bytes, xmp);
  if (startsWith(bytes, [0xff, 0xd8])) return embedJpeg(bytes, xmp);
  if (isWebp(bytes)) return embedWebp(bytes, xmp);
  return null;
}

async function planIsoMedia(source: ByteSource, xmp: string): Promise<VideoProvenancePlan | null> {
  const patches: VideoProvenancePatch[] = [];
  let offset = 0;
  let boxes = 0;
  while (offset < source.size) {
    boxes += 1;
    if (boxes > ISO_MAX_TOP_LEVEL_BOXES) return null;
    const head = await source.read(offset, Math.min(16, source.size - offset));
    if (head.length < 8) return null;
    if (offset === 0 && fourcc(head, 4) !== 'ftyp') return null;
    const declared = readU32be(head, 0)!;
    let boxSize = declared;
    let headerSize = 8;
    if (declared === 1) {
      if (head.length < 16) return null;
      const high = readU32be(head, 8)!;
      if (high > 0x1fffff) return null;
      boxSize = high * 0x100000000 + readU32be(head, 12)!;
      headerSize = 16;
    } else if (declared === 0) {
      boxSize = source.size - offset;
      if (boxSize > 0xffffffff) return null;
      patches.push({ offset, bytes: u32be(boxSize) });
    }
    if (boxSize < headerSize || offset + boxSize > source.size) return null;
    offset += boxSize;
  }
  const payload = concat([ISO_XMP_UUID, ascii(xmp)]);
  const size = 8 + payload.length;
  return { patches, append: concat([u32be(size), ascii('uuid'), payload]) };
}

function parseEbmlVint(
  bytes: Uint8Array,
  at: number,
): { length: number; value: number; unknown: boolean } | null {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (at + length > bytes.length) return null;
  const mask = 0xff >> length;
  let value = first & mask;
  let allOnes = (first & mask) === mask;
  for (let index = 1; index < length; index += 1) {
    const byte = bytes[at + index]!;
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  if (!allOnes && !Number.isSafeInteger(value)) return null;
  return { length, value, unknown: allOnes };
}

function encodeEbmlVint(value: number, length?: number): Uint8Array | null {
  let width = length ?? 1;
  const fits = (candidate: number) => value < 2 ** (7 * candidate) - 1;
  while (!fits(width)) {
    if (length !== undefined || width >= 8) return null;
    width += 1;
  }
  const out = new Uint8Array(width);
  let remaining = value;
  for (let index = width - 1; index >= 0; index -= 1) {
    out[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  out[0] = out[0]! | (0x80 >> (width - 1));
  return out;
}

function ebmlElement(id: ArrayLike<number>, payload: Uint8Array): Uint8Array {
  return concat([Uint8Array.from(id), encodeEbmlVint(payload.length)!, payload]);
}

async function planMatroska(source: ByteSource, xmp: string): Promise<VideoProvenancePlan | null> {
  const head = await source.read(0, Math.min(MATROSKA_HEAD_BYTES, source.size));
  if (!startsWith(head, EBML_HEADER_ID)) return null;
  const headerSize = parseEbmlVint(head, 4);
  if (!headerSize || headerSize.unknown) return null;
  const segmentAt = 4 + headerSize.length + headerSize.value;
  if (!startsWith(head, MATROSKA_SEGMENT_ID, segmentAt)) return null;
  const sizeAt = segmentAt + 4;
  const segmentSize = parseEbmlVint(head, sizeAt);
  if (!segmentSize) return null;

  const tag = ebmlElement(
    [0x12, 0x54, 0xc3, 0x67],
    ebmlElement(
      [0x73, 0x73],
      ebmlElement(
        [0x67, 0xc8],
        concat([ebmlElement([0x45, 0xa3], ascii('XMP')), ebmlElement([0x44, 0x87], ascii(xmp))]),
      ),
    ),
  );
  if (segmentSize.unknown) return { patches: [], append: tag };

  const dataStart = sizeAt + segmentSize.length;
  if (dataStart + segmentSize.value !== source.size) return null;
  const grown = encodeEbmlVint(segmentSize.value + tag.length, segmentSize.length);
  if (!grown) return null;
  return { patches: [{ offset: sizeAt, bytes: grown }], append: tag };
}

export async function planVideoProvenance(
  source: ByteSource,
  mimeType: ProvenanceVideoMimeType,
  claim: AiActProvenanceClaim,
): Promise<VideoProvenancePlan | null> {
  const xmp = buildMediaXmpPacket(claim);
  return mimeType === 'video/webm' ? planMatroska(source, xmp) : planIsoMedia(source, xmp);
}

export async function embedVideoProvenance(
  bytes: Uint8Array,
  mimeType: ProvenanceVideoMimeType,
  claim: AiActProvenanceClaim,
): Promise<Uint8Array | null> {
  const plan = await planVideoProvenance(
    { size: bytes.length, read: async (offset, length) => bytes.subarray(offset, offset + length) },
    mimeType,
    claim,
  );
  if (!plan) return null;
  const out = concat([bytes, plan.append]);
  for (const patch of plan.patches) out.set(patch.bytes, patch.offset);
  return out;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  const last = haystack.length - needle.length;
  outer: for (let start = 0; start <= last; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return start;
  }
  return -1;
}

export function extractEmbeddedProvenance(bytes: Uint8Array): AiActProvenanceClaim | null {
  const start = indexOfBytes(bytes, ascii(PROVENANCE_ATTRIBUTE));
  if (start < 0) return null;
  const from = start + PROVENANCE_ATTRIBUTE.length;
  const to = bytes.indexOf(0x22, from);
  if (to < 0) return null;
  try {
    const claim: unknown = JSON.parse(xmlUnescape(decoder.decode(bytes.subarray(from, to))));
    return hasAiActProvenanceClaim(claim) ? (claim as AiActProvenanceClaim) : null;
  } catch {
    return null;
  }
}
