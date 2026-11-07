export const MAX_ARCHIVE_MEMBERS = 2_000;
export const MAX_DECOMPRESSION_RATIO = 120;
export const MAX_OFFICE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

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
