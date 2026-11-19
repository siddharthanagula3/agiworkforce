import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { NextRequest, NextResponse } from 'next/server';

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { logger } from '@/lib/logger';
import {
  deleteOrphanedPreparation,
  failStalledPreparations,
  listOrphanedPreparations,
} from '@/lib/server/chat-file-preparation';
import {
  defaultPreparationStorage,
  preparationKeyPrefix,
} from '@/lib/server/chat-file-preparation/derived-keys';
import { chatFileSchemaReady } from '@/lib/server/chat-file-intake/schema';
import {
  NON_TERMINAL_INTAKE_STATES,
  listIdleAwaitingPartsIntakes,
  listPrunableUnsealedSealingIntakes,
  listRedispatchableIntakes,
  listSealedIntakesWithIdlePreparation,
  listStalledIntakes,
  listUnpurgedTerminalIntakes,
  pruneTerminalIntakes,
} from '@/lib/server/chat-file-intake/store';
import {
  defaultIntakeObjects,
  defaultIntakeTransitionDeps,
  endChatFileIntake,
  purgeIntakeObjects,
} from '@/lib/server/chat-file-intake/transitions';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { lowPowerCronSkip } from '@/lib/server/cron-low-power';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { getNeonDb } from '@/lib/server/neon-db';
import { dispatchChatFileIntakeWorkflows } from '@/lib/workflows/start-chat-file-intake-workflow';

export const runtime = 'nodejs';
export const maxDuration = 240;

const REDISPATCH_BATCH_LIMIT = 50;
const IDLE_BATCH_LIMIT = 100;
const STALL_BATCH_LIMIT = 100;
const PURGE_BATCH_LIMIT = 100;
const PREPARATION_BATCH_LIMIT = 100;
const PRUNE_BATCH_LIMIT = 500;

interface SweepReport {
  redispatched: number;
  redispatchFailed: number;
  idlePreparations: number;
  idleCancelled: number;
  stalled: number;
  purged: number;
  orphanedPreparationsDeleted: number;
  preparationsFailed: number;
  pruned: number;
}

function derivedPrefixOf(userId: string): string {
  const key = preparationKeyPrefix(userId, 'prefix');
  return key.slice(0, key.indexOf('/', key.indexOf('/') + 1) + 1);
}

async function deleteOrphanedPreparations(db: DatabaseAdapter): Promise<number> {
  const orphans = await listOrphanedPreparations(db, { limit: PREPARATION_BATCH_LIMIT });
  if (orphans.length === 0) return 0;
  const storage = defaultPreparationStorage();
  let deleted = 0;
  for (const orphan of orphans) {
    const prefix = derivedPrefixOf(orphan.userId);
    let objectsGone = true;
    for (const key of orphan.derivedKeys) {
      if (!key.startsWith(prefix)) {
        objectsGone = false;
        logger.warn(
          { preparationId: orphan.id },
          '[chat-files] a derived key lies outside its prefix',
        );
        continue;
      }
      try {
        await storage.store.delete(storage.bucket, key);
      } catch (error) {
        objectsGone = false;
        logger.warn(
          { error, preparationId: orphan.id },
          '[chat-files] a derived object delete failed',
        );
      }
    }
    if (objectsGone && (await deleteOrphanedPreparation(db, orphan))) deleted += 1;
  }
  return deleted;
}

async function clearUnsealedSealedKeys(
  db: DatabaseAdapter,
  endedBeforeMs: number,
): Promise<string[]> {
  const rows = await listPrunableUnsealedSealingIntakes(db, {
    endedBeforeMs,
    limit: PRUNE_BATCH_LIMIT,
  });
  if (rows.length === 0) return [];
  const objects = defaultIntakeObjects();
  const cleared: string[] = [];
  for (const row of rows) {
    try {
      await objects.delete(sealedChatAttachmentPathname(row.stagingKey));
      cleared.push(row.id);
    } catch (error) {
      logger.warn(
        { error, intakeId: row.id },
        '[chat-files] a sealed key was not deleted; the row is kept for the next sweep',
      );
    }
  }
  return cleared;
}

async function sweep(db: DatabaseAdapter, nowMs: number): Promise<SweepReport> {
  const { intake, preparation } = CHAT_LARGE_FILE_POLICY;

  const due = await listRedispatchableIntakes(db, { nowMs, limit: REDISPATCH_BATCH_LIMIT });
  const idlePreparations = await listSealedIntakesWithIdlePreparation(db, {
    idleBeforeMs: nowMs - preparation.redispatchAfterMs,
    stalledBeforeMs: nowMs - preparation.stallMs,
    limit: REDISPATCH_BATCH_LIMIT,
  });
  const dispatched = await dispatchChatFileIntakeWorkflows(
    [...due, ...idlePreparations].map((row) => ({
      intakeId: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
    })),
  );

  let idleCancelled = 0;
  const idle = await listIdleAwaitingPartsIntakes(db, {
    idleBeforeMs: nowMs - intake.awaitingPartsIdleMs,
    limit: IDLE_BATCH_LIMIT,
  });
  for (const row of idle) {
    const ended = await endChatFileIntake(defaultIntakeTransitionDeps(db, row.userId), {
      intakeId: row.id,
      runId: null,
      from: ['awaiting_parts'],
      ending: { state: 'cancelled', cancelReason: 'idle' },
    });
    if (ended) idleCancelled += 1;
  }

  let stalled = 0;
  const stuck = await listStalledIntakes(db, {
    changedBeforeMs: nowMs - intake.abandonAfterMs,
    limit: STALL_BATCH_LIMIT,
  });
  for (const row of stuck) {
    const ended = await endChatFileIntake(defaultIntakeTransitionDeps(db, row.userId), {
      intakeId: row.id,
      runId: null,
      from: NON_TERMINAL_INTAKE_STATES,
      ending: { state: 'failed', failureCode: 'stalled' },
    });
    if (ended) stalled += 1;
  }

  let purged = 0;
  const unpurged = await listUnpurgedTerminalIntakes(db, {
    changedBeforeMs: nowMs - intake.leaseMs.sealing,
    limit: PURGE_BATCH_LIMIT,
  });
  for (const row of unpurged) {
    if (await purgeIntakeObjects(defaultIntakeTransitionDeps(db, row.userId), row)) purged += 1;
  }

  const orphanedPreparationsDeleted = await deleteOrphanedPreparations(db);
  const preparationsFailed = (
    await failStalledPreparations(db, {
      stalledForMs: preparation.stallMs,
      limit: PREPARATION_BATCH_LIMIT,
    })
  ).length;

  const endedBeforeMs = nowMs - intake.terminalRetentionMs;
  const sealedKeyClearedIds = await clearUnsealedSealedKeys(db, endedBeforeMs);
  const pruned = await pruneTerminalIntakes(db, {
    endedBeforeMs,
    limit: PRUNE_BATCH_LIMIT,
    sealedKeyClearedIds,
  });

  return {
    redispatched: dispatched.started,
    redispatchFailed: dispatched.failed,
    idlePreparations: idlePreparations.length,
    idleCancelled,
    stalled,
    purged,
    orphanedPreparationsDeleted,
    preparationsFailed,
    pruned,
  };
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const lowPower = lowPowerCronSkip();
  if (lowPower) return lowPower;

  try {
    const db = getNeonDb();
    if (!(await chatFileSchemaReady(db, { cached: true }))) {
      return NextResponse.json({ skipped: 'schema_absent' });
    }
    const report = await sweep(db, Date.now());
    logger.info(report, '[chat-files] intake sweep finished');
    return NextResponse.json(report);
  } catch (error) {
    logger.error({ error }, '[chat-files] intake sweep failed');
    return NextResponse.json({ error: 'Chat file intake sweep failed' }, { status: 500 });
  }
}
