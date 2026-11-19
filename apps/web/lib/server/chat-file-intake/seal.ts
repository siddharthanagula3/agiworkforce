import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { CHAT_LARGE_FILE_POLICY, isChatImageMimeType } from '@/lib/chat-attachment-policy';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordModerationEvent } from '@/lib/moderation';
import { matchDenylistedSha256 } from '@/lib/moderation/hash-denylist';
import {
  readSourceScan,
  judgeSourceScanVerdict,
  type SourceScanClientOptions,
  type SourceScanVerdict,
} from '@/lib/security/source-scan-client';
import { assertFileStorageAvailable } from '@/lib/server/file-storage';
import {
  getMediaAssetByContentHash,
  insertScannedChatFileMediaAsset,
} from '@/lib/server/media-assets';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { ObjectStorageTimeoutError } from '@/lib/server/object-storage';
import { objectStorageCopyTimeoutMs } from '@/lib/server/object-storage-timeouts';
import { recordGeneratedArtifactBytes } from '@/lib/services/infrastructure-cost';
import { completeSealing, type ChatFileIntakeRow } from './store';
import {
  endDirective,
  endHeldIntake,
  purgeIntakeObjects,
  retryScanAttempt,
  type ChatFileIntakeDirective,
  type IntakeTransitionDeps,
} from './transitions';

const MAX_SEAL_COPIES = 3;

export type SealCommitOutcome = 'sealed' | 'not_held';

export interface SealDeps {
  findAssetByHash(row: ChatFileIntakeRow, sha256: string): Promise<string | null>;
  /** False when the person's storage cannot take the file; other failures throw. */
  storageAvailable(row: ChatFileIntakeRow): Promise<boolean>;
  /** Inserts the media row and seals the intake in one transaction. */
  commit(input: {
    row: ChatFileIntakeRow;
    runId: string;
    verdict: SourceScanVerdict;
    sealedKey: string;
    nowMs: number;
  }): Promise<SealCommitOutcome>;
  /** Seals the intake onto a media row the person already holds for these bytes. */
  attach(input: {
    row: ChatFileIntakeRow;
    runId: string;
    assetId: string;
    nowMs: number;
  }): Promise<SealCommitOutcome>;
}

export interface SealContext extends IntakeTransitionDeps {
  scanner: SourceScanClientOptions;
  policy: typeof CHAT_LARGE_FILE_POLICY;
  seal: SealDeps;
}

class SealNotHeldError extends Error {
  constructor() {
    super('The intake is no longer held in sealing by this run.');
    this.name = 'SealNotHeldError';
  }
}

function isCopyTimeout(error: unknown): boolean {
  return (
    error instanceof ObjectStorageTimeoutError ||
    (error instanceof Error && error.name === 'TimeoutError')
  );
}

async function sealedCopyPresent(
  deps: SealContext,
  sealedKey: string,
  byteCount: number,
): Promise<boolean> {
  const head = await deps.objects.head(sealedKey);
  return head !== null && head.contentLength === byteCount;
}

/**
 * A timed-out copy may still have finished, and only this copy writes the
 * sealed key, so its presence with the right length settles it. Anything else
 * is copied again, at most three times in all.
 */
async function copyToSealedKey(
  deps: SealContext,
  row: ChatFileIntakeRow,
  verdict: SourceScanVerdict,
  sealedKey: string,
): Promise<'copied' | 'changed' | 'unfinished'> {
  if (await sealedCopyPresent(deps, sealedKey, row.byteCount)) return 'copied';
  const timeoutMs = objectStorageCopyTimeoutMs(row.byteCount);
  for (let copy = 1; copy <= MAX_SEAL_COPIES; copy += 1) {
    try {
      const copied = await deps.objects.copyIfUnchanged({
        sourceKey: row.stagingKey,
        destinationKey: sealedKey,
        etag: verdict.etag,
        timeoutMs,
      });
      return copied ? 'copied' : 'changed';
    } catch (error) {
      logger.warn(
        { intakeId: row.id, copy, timedOut: isCopyTimeout(error) },
        '[chat-files] the sealing copy did not answer',
      );
      if (isCopyTimeout(error) && (await sealedCopyPresent(deps, sealedKey, row.byteCount))) {
        return 'copied';
      }
    }
  }
  return 'unfinished';
}

async function deleteSealedKey(deps: SealContext, intakeId: string, sealedKey: string) {
  try {
    await deps.objects.delete(sealedKey);
  } catch (error) {
    logger.error(
      { intakeId, objectKey: sealedKey, error: error instanceof Error ? error.message : error },
      '[chat-files] a sealed copy no intake points at could not be deleted',
    );
  }
}

const UNSEALED_ENDINGS: ReadonlySet<ChatFileIntakeRow['state']> = new Set<
  ChatFileIntakeRow['state']
>(['rejected', 'failed', 'cancelled']);

/**
 * The run ended without sealing. A row that is gone or ended unsealed leaves
 * no pointer to the sealed key, so the copy goes. A row that is `sealed` or
 * `sealing` may point at that same key, so it stays. `held` is what a run
 * that still holds its row answers.
 */
async function notHeld(
  deps: SealContext,
  intakeId: string,
  sealedKey: string,
  held = 'superseded',
): Promise<ChatFileIntakeDirective> {
  const row = await deps.store.get(intakeId);
  if (row === null) {
    await deleteSealedKey(deps, intakeId, sealedKey);
    return endDirective('row_gone');
  }
  if (UNSEALED_ENDINGS.has(row.state)) {
    await deleteSealedKey(deps, intakeId, sealedKey);
    return endDirective('superseded');
  }
  return endDirective(held);
}

/**
 * A step delivered again after its seal committed finds the row sealed by its
 * own run, and carries on to preparation, which is idempotent, instead of
 * ending with a file that is never prepared.
 */
async function resumeSealed(
  deps: SealContext,
  intakeId: string,
  runId: string,
): Promise<ChatFileIntakeDirective> {
  const current = await deps.store.get(intakeId);
  if (current?.state === 'sealed' && current.workflowRunId === runId && current.mediaAssetId) {
    return finishSealed(deps, current.id, current.mediaAssetId);
  }
  return endDirective('superseded');
}

async function commitSeal(
  deps: SealContext,
  input: Parameters<SealDeps['commit']>[0],
): Promise<SealCommitOutcome | 'row_gone'> {
  try {
    return await deps.seal.commit(input);
  } catch (error) {
    if ((await deps.store.get(input.row.id)) !== null) throw error;
    logger.warn(
      { intakeId: input.row.id, error: error instanceof Error ? error.message : error },
      '[chat-files] the seal failed after its intake row was removed',
    );
    await deleteSealedKey(deps, input.row.id, input.sealedKey);
    return 'row_gone';
  }
}

async function finishSealed(
  deps: SealContext,
  intakeId: string,
  assetId: string,
): Promise<ChatFileIntakeDirective> {
  const row = await deps.store.get(intakeId);
  if (row?.state === 'sealed') await purgeIntakeObjects(deps, row);
  return { next: 'prepare', assetId };
}

async function backToScan(
  deps: SealContext,
  row: ChatFileIntakeRow,
  runId: string,
  poll: boolean,
): Promise<ChatFileIntakeDirective> {
  const back = await deps.store.returnToScanning({ intakeId: row.id, runId, nowMs: deps.now() });
  if (!back) return endDirective('superseded');
  if (poll) {
    return { next: 'poll', pollIndex: 0, scanningSinceMs: null, deadlineMs: null };
  }
  return retryScanAttempt(deps, back, runId, deps.policy.intake.maxScanAttempts);
}

/**
 * The only code that creates a media row for a large chat file. Its clearance
 * is the scanner's own answer, read again here, never a stored row or the
 * output of an earlier step.
 */
export async function sealChatFile(
  deps: SealContext,
  input: { intakeId: string; runId: string },
): Promise<ChatFileIntakeDirective> {
  const { runId } = input;
  const row = await deps.store.claim({
    intakeId: input.intakeId,
    runId,
    to: 'sealing',
    from: ['scanning'],
    nowMs: deps.now(),
  });
  if (!row) return resumeSealed(deps, input.intakeId, runId);
  if (row.scanJobId === null) return backToScan(deps, row, runId, false);

  const answer = await readSourceScan(row.scanJobId, deps.scanner);
  if (answer.kind === 'queued' || answer.kind === 'scanning') {
    return backToScan(deps, row, runId, true);
  }
  if (answer.kind !== 'done') return backToScan(deps, row, runId, false);
  const judgement = judgeSourceScanVerdict(answer.verdict);
  if (judgement.kind === 'rejected') {
    return endHeldIntake(deps, row, runId, {
      state: 'rejected',
      refusalCode: judgement.refusalCode,
    });
  }
  if (judgement.kind === 'retry') return backToScan(deps, row, runId, false);
  const verdict = answer.verdict;

  const staging = await deps.objects.head(row.stagingKey);
  if (
    staging === null ||
    staging.etag !== verdict.etag ||
    row.etag !== verdict.etag ||
    staging.contentLength !== row.byteCount ||
    verdict.bytes !== row.byteCount
  ) {
    return endHeldIntake(deps, row, runId, {
      state: 'rejected',
      refusalCode: 'changed_during_check',
    });
  }
  if (verdict.sha256 !== row.declaredSha256) {
    return endHeldIntake(deps, row, runId, { state: 'rejected', refusalCode: 'checksum_mismatch' });
  }

  const denylisted = matchDenylistedSha256(verdict.sha256);
  if (denylisted.matched) {
    recordModerationEvent({
      surface: 'upload',
      action: 'block',
      categories: ['known_illegal_media'],
      ruleIds: ['upload.hash-denylist'],
      userId: row.userId,
      contentSha256: denylisted.sha256,
      ...(denylisted.listLabel ? { listLabel: denylisted.listLabel } : {}),
      storageKey: row.stagingKey,
    });
    return endHeldIntake(deps, row, runId, { state: 'rejected', refusalCode: 'denylist' });
  }

  const sealedKey = sealedChatAttachmentPathname(row.stagingKey);
  const existing = await deps.seal.findAssetByHash(row, verdict.sha256);
  if (existing !== null) {
    const attached = await deps.seal.attach({ row, runId, assetId: existing, nowMs: deps.now() });
    if (attached === 'not_held') return notHeld(deps, row.id, sealedKey);
    await deleteSealedKey(deps, row.id, sealedKey);
    return finishSealed(deps, row.id, existing);
  }
  if (!(await deps.seal.storageAvailable(row))) {
    return endHeldIntake(deps, row, runId, { state: 'rejected', refusalCode: 'storage_full' });
  }

  const copy = await copyToSealedKey(deps, row, verdict, sealedKey);
  if (copy === 'changed') {
    return endHeldIntake(deps, row, runId, {
      state: 'rejected',
      refusalCode: 'changed_during_check',
    });
  }
  if (copy === 'unfinished') return notHeld(deps, row.id, sealedKey, 'copy_unfinished');

  const committed = await commitSeal(deps, { row, runId, verdict, sealedKey, nowMs: deps.now() });
  if (committed === 'row_gone') return endDirective('row_gone');
  if (committed === 'not_held') return notHeld(deps, row.id, sealedKey);
  const sealed = await deps.store.get(row.id);
  if (!sealed?.mediaAssetId) return endDirective('sealed');
  return finishSealed(deps, row.id, sealed.mediaAssetId);
}

function sealedMetadata(row: ChatFileIntakeRow): Record<string, unknown> {
  return {
    filename: row.fileName,
    origin: 'upload',
    surface: 'file',
    source: 'chat-attachment',
    previewable: isChatImageMimeType(row.mimeType) || row.mimeType === 'application/pdf',
  };
}

export function defaultSealDeps(db: DatabaseAdapter): SealDeps {
  return {
    async findAssetByHash(row, sha256) {
      const asset = await getMediaAssetByContentHash(
        row.userId,
        sha256,
        row.organizationId,
        db,
        row.temporaryChat,
        row.conversationId,
      );
      return asset?.id ?? null;
    },
    async storageAvailable(row) {
      try {
        await assertFileStorageAvailable(
          { db, userId: row.userId, organizationId: row.organizationId },
          row.byteCount,
        );
        return true;
      } catch (error) {
        if (isAppError(error) && error.statusCode < 500) return false;
        throw error;
      }
    },
    async commit({ row, runId, verdict, sealedKey, nowMs }) {
      const kind = isChatImageMimeType(row.mimeType) ? 'image' : 'file';
      try {
        await db.transaction(async (tx) => {
          const assetId = await insertScannedChatFileMediaAsset(
            {
              userId: row.userId,
              organizationId: row.organizationId,
              kind,
              mimeType: row.mimeType,
              byteSize: row.byteCount,
              storagePathname: sealedKey,
              conversationId: row.conversationId,
              temporaryChat: row.temporaryChat,
              scannedSha256: verdict.sha256,
              metadata: sealedMetadata(row),
            },
            tx,
          );
          const sealed = await completeSealing(tx, {
            userId: row.userId,
            intakeId: row.id,
            runId,
            mediaAssetId: assetId,
            nowMs,
          });
          if (!sealed) throw new SealNotHeldError();
        });
      } catch (error) {
        if (error instanceof SealNotHeldError) return 'not_held';
        throw error;
      }
      recordGeneratedArtifactBytes({
        userId: row.userId,
        organizationId: row.organizationId,
        bytes: row.byteCount,
        kind,
        provider: 'unknown',
        surface: null,
      });
      return 'sealed';
    },
    async attach({ row, runId, assetId, nowMs }) {
      const sealed = await completeSealing(db, {
        userId: row.userId,
        intakeId: row.id,
        runId,
        mediaAssetId: assetId,
        nowMs,
      });
      return sealed ? 'sealed' : 'not_held';
    },
  };
}
