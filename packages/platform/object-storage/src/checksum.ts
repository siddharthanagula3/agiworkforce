import { createHash } from 'node:crypto';
import { ObjectChecksumMismatchError, type ObjectStore, type StoredObjectBytes } from './types';

const CHECKSUM_ALGORITHM = 'sha256';

export function objectChecksum(data: Uint8Array): string {
  return createHash(CHECKSUM_ALGORITHM).update(data).digest('base64');
}

export function assertObjectChecksum(key: string, data: Uint8Array, expected: string): void {
  const actual = objectChecksum(data);
  if (actual !== expected) throw new ObjectChecksumMismatchError(key, expected, actual);
}

export interface PutVerifiedObjectInput {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata?: Readonly<Record<string, string>>;
}

/**
 * Writes with the checksum the caller's bytes actually have and reads the
 * stored head back, so a host that silently accepted different bytes is a
 * failed write here rather than a corrupt object discovered at download.
 */
export async function putVerifiedObject(
  store: ObjectStore,
  input: PutVerifiedObjectInput,
): Promise<string> {
  const checksum = objectChecksum(input.body);
  await store.put({
    bucket: input.bucket,
    key: input.key,
    body: input.body,
    contentType: input.contentType,
    contentLength: input.body.byteLength,
    checksumSha256: checksum,
    metadata: input.metadata,
  });
  const head = await store.head(input.bucket, input.key);
  if (head?.checksumSha256 && head.checksumSha256 !== checksum) {
    throw new ObjectChecksumMismatchError(input.key, checksum, head.checksumSha256);
  }
  return checksum;
}

export async function getVerifiedObject(
  store: ObjectStore,
  bucket: string,
  key: string,
): Promise<StoredObjectBytes | null> {
  const stored = await store.get(bucket, key);
  if (!stored) return null;
  const head = await store.head(bucket, key);
  if (head?.checksumSha256) assertObjectChecksum(key, stored.data, head.checksumSha256);
  return stored;
}
