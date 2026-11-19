import 'server-only';

import {
  CHAT_FILE_INTAKE_STATES,
  isChatFileIntakeCancellable,
  type ChatFileIntakeState,
} from '@agiworkforce/cloud-contracts';
import { supportsMultipartUploads, type StoredObjectHead } from '@agiworkforce/object-storage';

import { logger } from '@/lib/logger';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import {
  copyPrivateObjectIfUnchanged,
  deletePrivateObject,
  getPresignedPrivateDownloadUrl,
  getPrivateObjectStream,
  headPrivateObject,
} from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import type { ChatFileInspectionCursor } from './full-inspection';
import { admitScanUnavailableRefund } from './quotas';
import {
  sqlChatFileIntakeStore,
  type ChatFileIntakeRow,
  type ChatFileIntakeStore,
  type EndedIntake,
  type IntakeDb,
  type IntakeEnding,
} from './store';

/** The storage an intake touches: its staging key, its sealed key and its multipart upload. */
export interface IntakeObjects {
  head(key: string): Promise<StoredObjectHead | null>;
  /** At most `maxBytes` from the start of the object, or null when it is gone. */
  readHead(key: string, maxBytes: number): Promise<Uint8Array | null>;
  copyIfUnchanged(input: {
    sourceKey: string;
    destinationKey: string;
    etag: string;
    timeoutMs: number;
  }): Promise<boolean>;
  presignGet(input: { key: string; fileName: string; expiresInSeconds: number }): Promise<string>;
  delete(key: string): Promise<void>;
  /** Bytes the parts already stored hold, or null when they cannot be listed. */
  uploadedBytes(input: { key: string; uploadId: string }): Promise<number | null>;
  /** True once the upload is gone, whether this call aborted it or it was already absent. */
  abortUpload(input: { key: string; uploadId: string }): Promise<boolean>;
}

export interface IntakeTransitionDeps {
  store: ChatFileIntakeStore;
  objects: IntakeObjects;
  now(): number;
}

async function drainHead(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const out = new Uint8Array(maxBytes);
  let filled = 0;
  try {
    while (filled < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const take = Math.min(value.byteLength, maxBytes - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return out.subarray(0, filled);
}

function multipartTarget() {
  const store = getObjectStore();
  const bucket = objectStorageConfig().privateBucket;
  if (!bucket || !supportsMultipartUploads(store)) return null;
  return { store, bucket };
}

export function defaultIntakeObjects(): IntakeObjects {
  return {
    head: (key) => headPrivateObject(key),
    async readHead(key, maxBytes) {
      if (maxBytes <= 0) return new Uint8Array(0);
      const stream = await getPrivateObjectStream(key, `bytes=0-${maxBytes - 1}`);
      if (!stream) return null;
      return drainHead(stream.body, maxBytes);
    },
    copyIfUnchanged: (input) => copyPrivateObjectIfUnchanged(input),
    presignGet: (input) => getPresignedPrivateDownloadUrl(input),
    delete: (key) => deletePrivateObject(key),
    async uploadedBytes({ key, uploadId }) {
      const target = multipartTarget();
      if (!target) return null;
      try {
        const parts = await target.store.listUploadedParts({
          bucket: target.bucket,
          key,
          uploadId,
        });
        return parts.reduce((total, part) => total + part.size, 0);
      } catch (error) {
        logger.warn({ error, objectKey: key }, '[chat-files] the stored parts could not be listed');
        return null;
      }
    },
    async abortUpload({ key, uploadId }) {
      const target = multipartTarget();
      if (!target) return false;
      try {
        await target.store.abortMultipartUpload({ bucket: target.bucket, key, uploadId });
        return true;
      } catch (abortError) {
        try {
          const pending = await target.store.listPendingMultipartUploads(target.bucket, key);
          if (!pending.some((upload) => upload.uploadId === uploadId)) return true;
        } catch (listError) {
          logger.warn(
            { error: errorText(listError), objectKey: key },
            '[chat-files] the pending uploads could not be listed',
          );
        }
        logger.warn(
          { error: errorText(abortError), objectKey: key },
          '[chat-files] an intake upload could not be aborted; the sweeper retries it',
        );
        return false;
      }
    },
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Deletes what an ended row points at, then records that it did. A row that
 * entered `sealing` and did not end sealed may have a finished copy under its
 * deterministic sealed key; nothing else can find that object, so it goes too.
 * A delete or an abort that fails leaves `objects_purged_at` unset for the
 * sweeper.
 */
export async function purgeIntakeObjects(
  deps: IntakeTransitionDeps,
  row: ChatFileIntakeRow,
): Promise<boolean> {
  const uploadGone =
    row.state === 'sealed' || row.multipartUploadId === null
      ? true
      : await deps.objects
          .abortUpload({ key: row.stagingKey, uploadId: row.multipartUploadId })
          .catch(() => false);
  const keys = [row.stagingKey];
  if (row.state !== 'sealed' && row.sealingEnteredAt !== null) {
    keys.push(sealedChatAttachmentPathname(row.stagingKey));
  }
  for (const key of keys) {
    try {
      await deps.objects.delete(key);
    } catch (error) {
      logger.warn(
        { intakeId: row.id, objectKey: key, error: errorText(error) },
        '[chat-files] an intake object could not be deleted; the sweeper retries it',
      );
      return false;
    }
  }
  if (!uploadGone) return false;
  return deps.store.markPurged({ intakeId: row.id, nowMs: deps.now() });
}

async function refundEnded(
  deps: IntakeTransitionDeps,
  ended: EndedIntake,
  storedBytes: number | null | undefined,
): Promise<number> {
  const { row, priorState } = ended;
  if (row.bytesRefundedAt !== null || row.dailyBytesCharged <= 0) return 0;
  const nowMs = deps.now();
  if (priorState === 'awaiting_parts') {
    const stored =
      storedBytes !== undefined
        ? storedBytes
        : row.multipartUploadId === null
          ? 0
          : await deps.objects.uploadedBytes({
              key: row.stagingKey,
              uploadId: row.multipartUploadId,
            });
    if (stored === null) return 0;
    return deps.store.refundDailyBytes({
      intakeId: row.id,
      bytes: row.byteCount - stored,
      nowMs,
    });
  }
  if (row.state === 'failed' && row.failureCode === 'scan_unavailable') {
    const admitted = await admitScanUnavailableRefund({
      userId: row.userId,
      intakeId: row.id,
      nowMs,
    });
    if (!admitted) return 0;
    return deps.store.refundDailyBytes({ intakeId: row.id, bytes: row.byteCount, nowMs });
  }
  return 0;
}

/**
 * Every ending goes through here: the compare-and-set, the refund its prior
 * state earns (Counters), and the purge. `storedBytes` is what the parts held
 * when the caller already listed them; otherwise they are listed here, before
 * the purge aborts the upload.
 */
export async function endChatFileIntake(
  deps: IntakeTransitionDeps,
  input: {
    intakeId: string;
    runId: string | null;
    from: readonly ChatFileIntakeState[];
    ending: IntakeEnding;
    userId?: string;
    storedBytes?: number | null;
  },
): Promise<EndedIntake | null> {
  const ended = await deps.store.end({
    intakeId: input.intakeId,
    runId: input.runId,
    from: input.from,
    ending: input.ending,
    nowMs: deps.now(),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
  });
  if (!ended) return null;
  try {
    await refundEnded(deps, ended, input.storedBytes);
  } catch (error) {
    logger.warn(
      { intakeId: ended.row.id, error: errorText(error) },
      '[chat-files] an intake refund failed and is not retried',
    );
  }
  await purgeIntakeObjects(deps, ended.row);
  return ended;
}

const CANCELLABLE_STATES: readonly ChatFileIntakeState[] = CHAT_FILE_INTAKE_STATES.filter(
  isChatFileIntakeCancellable,
);

export type CancelChatFileIntakeResult =
  | { outcome: 'cancelled'; row: ChatFileIntakeRow }
  | { outcome: 'not_cancellable'; row: ChatFileIntakeRow }
  | { outcome: 'missing' };

/**
 * `DELETE /api/files/intakes/:id`. From `sealing` on the file is already being
 * added, so the answer is the row as it stands and the person removes the
 * attachment as any other. A row that fell back from `sealing` to `scanning`
 * between the compare-and-set and the re-read is cancelled by one more attempt.
 */
export async function cancelChatFileIntake(
  deps: IntakeTransitionDeps,
  input: { userId: string; intakeId: string },
): Promise<CancelChatFileIntakeResult> {
  const cancel = () =>
    endChatFileIntake(deps, {
      intakeId: input.intakeId,
      runId: null,
      from: CANCELLABLE_STATES,
      ending: { state: 'cancelled', cancelReason: 'client' },
      userId: input.userId,
    });
  let row: ChatFileIntakeRow | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ended = await cancel();
    if (ended) return { outcome: 'cancelled', row: ended.row };
    row = await deps.store.get(input.intakeId);
    if (!row || row.userId !== input.userId) return { outcome: 'missing' };
    if (row.state === 'cancelled') return { outcome: 'cancelled', row };
    if (!isChatFileIntakeCancellable(row.state)) break;
  }
  return { outcome: 'not_cancellable', row: row! };
}

export function defaultIntakeTransitionDeps(
  db: IntakeDb,
  ownerUserId: string,
): IntakeTransitionDeps {
  return {
    store: sqlChatFileIntakeStore(db, ownerUserId),
    objects: defaultIntakeObjects(),
    now: Date.now,
  };
}

/**
 * Where a run goes next, and how long it sleeps first. Plain data, because it
 * crosses the step boundary of the workflow.
 */
export type ChatFileIntakeDirective =
  | { next: 'start' }
  | { next: 'inspect'; cursor?: ChatFileInspectionCursor }
  | {
      next: 'submit';
      sleepMs?: number;
      deferral?: { reason: 'queue_full' | 'source_budget'; remainingMs: number };
    }
  | {
      next: 'poll';
      sleepMs?: number;
      resume?: boolean;
      pollIndex: number;
      scanningSinceMs: number | null;
      deadlineMs: number | null;
    }
  | { next: 'seal' }
  | { next: 'prepare'; assetId: string }
  | { next: 'index'; assetId: string }
  | { next: 'end'; reason: string };

export const SCAN_RETRY_DELAYS_MS: readonly number[] = [10_000, 30_000, 60_000, 120_000];

export function endDirective(reason: string): ChatFileIntakeDirective {
  return { next: 'end', reason };
}

const SCAN_STATES: readonly ChatFileIntakeState[] = ['scanning'];

/** A run ends only the row it holds, from the state it holds it in. */
export async function endHeldIntake(
  deps: IntakeTransitionDeps,
  row: ChatFileIntakeRow,
  runId: string,
  ending: IntakeEnding,
): Promise<ChatFileIntakeDirective> {
  const ended = await endChatFileIntake(deps, {
    intakeId: row.id,
    runId,
    from: [row.state],
    ending,
    userId: row.userId,
  });
  return endDirective(ended ? ending.state : 'superseded');
}

/**
 * An attempt that did not finish. Its slot was counted when it was admitted
 * or when its submit failed, so this only decides whether another may start.
 */
export async function retryScanAttempt(
  deps: IntakeTransitionDeps,
  row: ChatFileIntakeRow,
  runId: string,
  maxScanAttempts: number,
): Promise<ChatFileIntakeDirective> {
  if (row.attempts >= maxScanAttempts) {
    const ended = await endChatFileIntake(deps, {
      intakeId: row.id,
      runId,
      from: SCAN_STATES,
      ending: { state: 'failed', failureCode: 'scan_unavailable' },
      userId: row.userId,
    });
    return endDirective(ended ? 'failed' : 'superseded');
  }
  const delay =
    SCAN_RETRY_DELAYS_MS[Math.min(Math.max(row.attempts - 1, 0), SCAN_RETRY_DELAYS_MS.length - 1)];
  return { next: 'submit', sleepMs: delay ?? 0 };
}
