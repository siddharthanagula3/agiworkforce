import { readGeneratedFigureIdentity } from '@agiworkforce/cloud-contracts';
import { crc32 } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const RENDER_IDENTITY_KEY = 'agi-render-identity';
const CHUNK_HEADER_BYTES = 8;
const CHUNK_CHECKSUM_BYTES = 4;

export function readPngRenderIdentity(bytes: Buffer): string | undefined {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return undefined;
  let offset = PNG_SIGNATURE.length;
  while (offset + CHUNK_HEADER_BYTES + CHUNK_CHECKSUM_BYTES <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const start = offset + CHUNK_HEADER_BYTES;
    const end = start + length;
    if (end + CHUNK_CHECKSUM_BYTES > bytes.length) return undefined;
    const kind = bytes.toString('ascii', offset + 4, start);
    if (kind === 'tEXt') {
      if (crc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)) return undefined;
      const separator = bytes.indexOf(0, start);
      if (
        separator >= start &&
        separator < end &&
        bytes.toString('latin1', start, separator) === RENDER_IDENTITY_KEY
      ) {
        return readGeneratedFigureIdentity(bytes.toString('latin1', separator + 1, end));
      }
    }
    if (kind === 'IEND') return undefined;
    offset = end + CHUNK_CHECKSUM_BYTES;
  }
  return undefined;
}
