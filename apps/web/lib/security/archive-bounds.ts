import 'server-only';

import type JSZip from 'jszip';

export const MAX_ARCHIVE_MEMBERS = 2_000;

/**
 * A member that inflates to more than this multiple of the whole archive is a
 * decompression bomb: no honest document compresses that far.
 */
export const MAX_DECOMPRESSION_RATIO = 120;

export type DecompressionLimit = 'members' | 'total_bytes' | 'ratio';

export class DecompressionLimitError extends Error {
  constructor(readonly limit: DecompressionLimit) {
    super(`Archive exceeded its ${limit} bound`);
    this.name = 'DecompressionLimitError';
  }
}

export interface DecompressionBudget {
  readonly ceiling: number;
  readonly spent: number;
  admitMembers(count: number): void;
  spend(bytes: number): void;
}

export function decompressionBudget(
  compressedBytes: number,
  maxTotalBytes: number,
  maxMembers = MAX_ARCHIVE_MEMBERS,
): DecompressionBudget {
  const ratioCeiling = Math.max(compressedBytes, 1) * MAX_DECOMPRESSION_RATIO;
  const ceiling = Math.min(maxTotalBytes, ratioCeiling);
  let spent = 0;

  return {
    ceiling,
    get spent() {
      return spent;
    },
    admitMembers(count: number) {
      if (count > maxMembers) throw new DecompressionLimitError('members');
    },
    spend(bytes: number) {
      spent += bytes;
      if (spent > ceiling) {
        throw new DecompressionLimitError(ceiling === ratioCeiling ? 'ratio' : 'total_bytes');
      }
    },
  };
}

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
