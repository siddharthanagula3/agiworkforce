/**
 * Stable client identity for one billable Managed Cloud chat operation.
 *
 * Callers own `operationId`: create it once at the user-action boundary and
 * reuse it for every transport retry. This module deliberately does not mint a
 * random value, because creating identity inside a retry loop defeats
 * idempotency. A deliberate continuation, regeneration, or tool resume must use
 * a new operation id.
 */

export type ManagedChatSurface = 'web' | 'desktop' | 'mobile';
export type ManagedChatPurpose = 'send' | 'continue' | 'tool-resume' | 'compare';

export interface ManagedChatIdempotencyIdentity {
  surface: ManagedChatSurface;
  purpose: ManagedChatPurpose;
  operationId: string;
}

const KEY_PATTERN =
  /^agi\.chat\.(web|desktop|mobile)\.(send|continue|tool-resume|compare)\.[A-Za-z0-9_-]{8,72}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,72}$/;

export function createManagedChatIdempotencyKey(identity: ManagedChatIdempotencyIdentity): string {
  if (!OPERATION_ID_PATTERN.test(identity.operationId)) {
    throw new Error('Managed chat operationId must be 8-72 URL-safe characters');
  }

  const key = `agi.chat.${identity.surface}.${identity.purpose}.${identity.operationId}`;
  if (!KEY_PATTERN.test(key) || key.length > 128) {
    throw new Error('Managed chat idempotency identity is invalid');
  }
  return key;
}

/** True only for the AGI-owned, version-1 managed-chat key namespace. */
export function isManagedChatIdempotencyKey(value: string): boolean {
  return KEY_PATTERN.test(value) && value.length <= 128;
}
