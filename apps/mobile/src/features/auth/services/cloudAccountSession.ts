import { storage } from '@/lib/mmkv';

const CLOUD_CACHE_OWNER_KEY = 'cloud-cache-owner-id';

let runtimeOwnerId: string | null = null;
let accountEpoch = 0;

export interface CloudAccountEpoch {
  ownerId: string;
  epoch: number;
}

export interface CloudAccountActivation {
  ownerId: string;
  previousOwnerId: string | null;
  changed: boolean;
}

export class StaleCloudAccountOperationError extends Error {
  constructor() {
    super('Cloud account changed while this operation was in flight');
    this.name = 'StaleCloudAccountOperationError';
  }
}

export function activateCloudAccount(userId: string): CloudAccountActivation {
  const ownerId = userId.trim();
  if (!ownerId) {
    throw new Error('Cloud cache ownership requires a non-empty Clerk user id');
  }

  const persistedOwnerId = storage.getString(CLOUD_CACHE_OWNER_KEY)?.trim() || null;
  const previousOwnerId = runtimeOwnerId ?? persistedOwnerId;
  const changed = previousOwnerId !== ownerId;
  if (changed) accountEpoch += 1;

  runtimeOwnerId = ownerId;
  storage.set(CLOUD_CACHE_OWNER_KEY, ownerId);
  return { ownerId, previousOwnerId, changed };
}

export function invalidateCloudAccount(): void {
  const persistedOwnerId = storage.getString(CLOUD_CACHE_OWNER_KEY)?.trim() || null;
  if (runtimeOwnerId !== null || persistedOwnerId !== null) {
    accountEpoch += 1;
  }
  runtimeOwnerId = null;
  storage.delete(CLOUD_CACHE_OWNER_KEY);
}

export function captureCloudAccountEpoch(): CloudAccountEpoch | null {
  return runtimeOwnerId === null ? null : { ownerId: runtimeOwnerId, epoch: accountEpoch };
}

export function isCloudAccountEpochCurrent(
  snapshot: CloudAccountEpoch | null | undefined,
): snapshot is CloudAccountEpoch {
  return (
    snapshot !== null &&
    snapshot !== undefined &&
    runtimeOwnerId === snapshot.ownerId &&
    accountEpoch === snapshot.epoch
  );
}

export function assertCloudAccountEpochCurrent(
  snapshot: CloudAccountEpoch | null | undefined,
): asserts snapshot is CloudAccountEpoch {
  if (!isCloudAccountEpochCurrent(snapshot)) {
    throw new StaleCloudAccountOperationError();
  }
}

export function isStaleCloudAccountOperation(
  error: unknown,
): error is StaleCloudAccountOperationError {
  return error instanceof StaleCloudAccountOperationError;
}

export function __resetCloudAccountSessionForTests(): void {
  runtimeOwnerId = null;
  accountEpoch = 0;
}
