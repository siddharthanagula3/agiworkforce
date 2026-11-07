import 'server-only';

import type JSZip from 'jszip';

import { DecompressionLimitError, type DecompressionBudget } from './archive-budget';

export {
  DecompressionLimitError,
  MAX_ARCHIVE_MEMBERS,
  MAX_DECOMPRESSION_RATIO,
  MAX_OFFICE_UNCOMPRESSED_BYTES,
  decompressionBudget,
  type DecompressionBudget,
  type DecompressionLimit,
} from './archive-budget';

/**
 * The uncompressed size in a zip header is written by whoever built the
 * archive, so the only bound that holds counts bytes as they inflate.
 */
export async function readArchiveMember(
  entry: JSZip.JSZipObject,
  budget: DecompressionBudget,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  const remaining = budget.ceiling - budget.spent;

  await new Promise<void>((resolve, reject) => {
    const stream = entry.nodeStream('nodebuffer');
    let settled = false;
    // Pausing stops the inflate worker. Destroying it makes the adapter push
    // into an ended stream, which throws out of band.
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error);
    };
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.byteLength;
      if (total > remaining) {
        fail(new DecompressionLimitError('ratio'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', fail);
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
  });

  budget.spend(total);
  return new Uint8Array(Buffer.concat(chunks, total));
}

export function declaredMemberSize(entry: JSZip.JSZipObject): number {
  const size = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data
    ?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : 0;
}
