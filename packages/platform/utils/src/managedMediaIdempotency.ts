/**
 * Stable client identity for one billable Managed Cloud media operation.
 *
 * Callers create `operationId` once at the user-action boundary and reuse the
 * resulting key for every transport retry. Operation ids are deliberately
 * path-free so client identity can never be mistaken for a host file path.
 */

export type ManagedMediaSurface = 'web' | 'mobile' | 'desktop';
export type ManagedMediaOperation = 'image' | 'video';

export interface ManagedMediaIdempotencyIdentity {
  surface: ManagedMediaSurface;
  operation: ManagedMediaOperation;
  operationId: string;
}

const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,72}$/;
const KEY_PATTERN = /^agi\.media\.(web|mobile|desktop)\.(image|video)\.([A-Za-z0-9_-]{8,72})$/;
const MAX_KEY_LENGTH = 128;

export function createManagedMediaIdempotencyKey(
  identity: ManagedMediaIdempotencyIdentity,
): string {
  if (!OPERATION_ID_PATTERN.test(identity.operationId)) {
    throw new Error('Managed media operationId must be 8-72 path-free URL-safe characters');
  }

  const key = `agi.media.${identity.surface}.${identity.operation}.${identity.operationId}`;
  if (!KEY_PATTERN.test(key) || key.length > MAX_KEY_LENGTH) {
    throw new Error('Managed media idempotency identity is invalid');
  }
  return key;
}

export function parseManagedMediaIdempotencyKey(
  value: string,
): ManagedMediaIdempotencyIdentity | null {
  if (value.length > MAX_KEY_LENGTH) return null;

  const match = KEY_PATTERN.exec(value);
  if (!match) return null;

  return {
    surface: match[1] as ManagedMediaSurface,
    operation: match[2] as ManagedMediaOperation,
    operationId: match[3]!,
  };
}

export function isManagedMediaIdempotencyKey(value: string): boolean {
  return parseManagedMediaIdempotencyKey(value) !== null;
}
