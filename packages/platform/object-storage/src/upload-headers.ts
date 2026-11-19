import { type ObjectEncryption } from './types';

export const ENCRYPTION_ALGORITHM_HEADER = 'x-amz-server-side-encryption';
export const ENCRYPTION_KEY_ID_HEADER = 'x-amz-server-side-encryption-aws-kms-key-id';

export const ENCRYPTION_UPLOAD_HEADER_NAMES = [
  ENCRYPTION_ALGORITHM_HEADER,
  ENCRYPTION_KEY_ID_HEADER,
] as const;

/**
 * The headers a browser must send for a direct upload to be stored with the
 * encryption a server-side write would have asked for. They are the request
 * form of the `ServerSideEncryption` and `SSEKMSKeyId` fields the adapter
 * sets on its own writes.
 */
export function encryptionUploadHeaders(
  encryption: ObjectEncryption | undefined,
): Readonly<Record<string, string>> {
  if (!encryption) return {};
  return {
    [ENCRYPTION_ALGORITHM_HEADER]: encryption.algorithm,
    ...(encryption.keyId ? { [ENCRYPTION_KEY_ID_HEADER]: encryption.keyId } : {}),
  };
}
