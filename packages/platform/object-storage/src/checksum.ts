import { createHash } from 'node:crypto';

const CHECKSUM_ALGORITHM = 'sha256';

export function objectChecksum(data: Uint8Array): string {
  return createHash(CHECKSUM_ALGORITHM).update(data).digest('base64');
}
