import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getNeonDb } from '@/lib/server/neon-db';
import { objectKeyFromStorageUri } from '@/lib/server/object-storage';
import {
  backupReplicaSummary,
  isCrossRegionBackup,
  objectBackupReadiness,
  recordBackupReplica,
  reconcileBackupDeletions,
  replicateObject,
  resolveObjectBackupTarget,
  type ReplicationOutcome,
} from '@/lib/server/object-backup';

export const runtime = 'nodejs';

export const maxDuration = 300;

const CURSOR_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_ASSETS_PER_RUN = 200;
const MAX_RECONCILED_PER_RUN = 200;
const LOOKBACK_HOURS = 48;
const HOUR_MS = 60 * 60 * 1_000;

interface StoredObjectRow {
  object_reference: string | null;
  created_at: string;
}

interface BackupSource {
  id: string;
  cursorKey: string;
  sql: string;
  toKey: (reference: string) => string | null;
}

/**
 * Every table that holds a key into object storage. A class of object missing
 * from this list has no second copy at all, which is indistinguishable from a
 * working backup until a restore is attempted.
 */
const BACKUP_SOURCES: readonly BackupSource[] = [
  {
    id: 'media',
    cursorKey: 'agi-object-backup:cursor',
    sql: `select storage_pathname as object_reference, created_at
            from public.media_assets
           where created_at > $1::timestamptz
             and deleted_at is null
             and storage_pathname is not null
           order by created_at asc
           limit ${MAX_ASSETS_PER_RUN}`,
    toKey: (reference) => reference,
  },
  {
    id: 'project-knowledge',
    cursorKey: 'agi-object-backup:knowledge-cursor',
    sql: `select storage_uri as object_reference, created_at
            from public.project_knowledge_files
           where created_at > $1::timestamptz
             and storage_uri is not null
           order by created_at asc
           limit ${MAX_ASSETS_PER_RUN}`,
    toKey: objectKeyFromStorageUri,
  },
];

async function readCursor(key: string): Promise<string | null> {
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    return await store.get<string>(key);
  } catch (error) {
    logger.warn({ error }, '[object-backup] cursor could not be read');
    return null;
  }
}

async function writeCursor(key: string, value: string): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.set(key, value, { ttlSeconds: CURSOR_TTL_SECONDS });
  } catch (error) {
    logger.warn({ error }, '[object-backup] cursor could not be written');
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized object backup cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const readiness = objectBackupReadiness();
  if (!readiness.configured) {
    logger.error(
      { missing: readiness.missing },
      'Object backup replication is unconfigured; no copy of stored objects exists',
    );
    return NextResponse.json(
      { replicated: 0, reason: 'unconfigured', missing: readiness.missing },
      { status: 503 },
    );
  }

  const counts: Record<ReplicationOutcome, number> = {
    unconfigured: 0,
    replicated: 0,
    'already-present': 0,
    'missing-source': 0,
    'too-large': 0,
  };

  try {
    const target = resolveObjectBackupTarget();
    const fallbackSince = new Date(Date.now() - LOOKBACK_HOURS * HOUR_MS).toISOString();
    const cursors: Record<string, string> = {};
    let scanned = 0;
    let unreadable = 0;
    let bytes = 0;

    for (const source of BACKUP_SOURCES) {
      const since = (await readCursor(source.cursorKey)) ?? fallbackSince;
      let cursor = since;
      const rows = await getNeonDb().query<StoredObjectRow>(source.sql, [since]);
      scanned += rows.length;

      for (const row of rows) {
        cursor = new Date(row.created_at).toISOString();
        const key = row.object_reference ? source.toKey(row.object_reference) : null;
        if (!key) {
          unreadable += 1;
          continue;
        }
        const result = await replicateObject(key);
        counts[result.outcome] += 1;
        bytes += result.bytes;
        if (target && (result.outcome === 'replicated' || result.outcome === 'already-present')) {
          await recordBackupReplica(key, result.bytes, target.bucket);
        }
      }

      if (rows.length > 0) await writeCursor(source.cursorKey, cursor);
      cursors[source.id] = cursor;
    }

    const reconciled = await reconcileBackupDeletions(MAX_RECONCILED_PER_RUN, { target });
    const summary = await backupReplicaSummary();

    logger.info(
      {
        scanned,
        unreadable,
        counts,
        bytes,
        reconciled,
        tracked: summary.tracked,
        crossRegion: isCrossRegionBackup(),
      },
      'Object backups replicated',
    );

    return NextResponse.json({
      scanned,
      unreadable,
      replicated: counts.replicated,
      alreadyPresent: counts['already-present'],
      missingSource: counts['missing-source'],
      tooLarge: counts['too-large'],
      reconciled: reconciled.checked,
      backupDeletesPropagated: reconciled.deleted,
      tracked: summary.tracked,
      newestReplicatedAt: summary.newestReplicatedAt,
      oldestVerifiedAt: summary.oldestVerifiedAt,
      crossRegion: isCrossRegionBackup(),
      cursors,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Object backup replication failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
