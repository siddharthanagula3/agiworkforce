import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isCrossRegionBackup,
  isObjectBackupConfigured,
  replicateObject,
  type ReplicationOutcome,
} from '@/lib/server/object-backup';

export const runtime = 'nodejs';

export const maxDuration = 300;

const CURSOR_KEY = 'agi-object-backup:cursor';
const CURSOR_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_ASSETS_PER_RUN = 200;
const LOOKBACK_HOURS = 48;
const HOUR_MS = 60 * 60 * 1_000;

interface AssetRow {
  id: string;
  storage_pathname: string | null;
  created_at: string;
}

async function readCursor(): Promise<string | null> {
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    return await store.get<string>(CURSOR_KEY);
  } catch (error) {
    logger.warn({ error }, '[object-backup] cursor could not be read');
    return null;
  }
}

async function writeCursor(value: string): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.set(CURSOR_KEY, value, { ttlSeconds: CURSOR_TTL_SECONDS });
  } catch (error) {
    logger.warn({ error }, '[object-backup] cursor could not be written');
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized object backup cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isObjectBackupConfigured()) {
    return NextResponse.json({ replicated: 0, reason: 'unconfigured' });
  }

  const since =
    (await readCursor()) ?? new Date(Date.now() - LOOKBACK_HOURS * HOUR_MS).toISOString();
  const counts: Record<ReplicationOutcome, number> = {
    unconfigured: 0,
    replicated: 0,
    'already-present': 0,
    'missing-source': 0,
    'too-large': 0,
  };

  try {
    const assets = await getNeonDb().query<AssetRow>(
      `select id, storage_pathname, created_at
         from public.media_assets
        where created_at > $1::timestamptz
          and deleted_at is null
          and storage_pathname is not null
        order by created_at asc
        limit ${MAX_ASSETS_PER_RUN}`,
      [since],
    );

    let cursor = since;
    let bytes = 0;
    for (const asset of assets) {
      if (!asset.storage_pathname) continue;
      const result = await replicateObject(asset.storage_pathname);
      counts[result.outcome] += 1;
      bytes += result.bytes;
      cursor = new Date(asset.created_at).toISOString();
    }

    if (assets.length > 0) await writeCursor(cursor);

    logger.info(
      { scanned: assets.length, counts, bytes, crossRegion: isCrossRegionBackup() },
      'Object backups replicated',
    );

    return NextResponse.json({
      scanned: assets.length,
      replicated: counts.replicated,
      alreadyPresent: counts['already-present'],
      missingSource: counts['missing-source'],
      tooLarge: counts['too-large'],
      crossRegion: isCrossRegionBackup(),
      cursor,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Object backup replication failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
