import 'server-only';

import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';
import { modelRegistry } from '@agiworkforce/model-registry';

import { logger } from '@/lib/logger';
import { deployEnvironment, deployRegion, deploymentId, releaseSha } from '@/lib/server/hosting';
import { getNeonDb } from '@/lib/server/neon-db';

export const dynamic = 'force-dynamic';

const UNKNOWN_VALUE = 'unknown';
const MIGRATION_CACHE_MS = 60_000;
const DIGEST_LENGTH = 12;

export interface MigrationVersion {
  sequence: number;
  filename: string;
  appliedAt: string | null;
}

export interface ModelRegistryVersion {
  schemaVersion: number;
  models: number;
  digest: string;
}

let cachedRegistryVersion: ModelRegistryVersion | null = null;

/**
 * Two deployments serving different catalogues answer with different digests,
 * which is the only thing that distinguishes them: the generated registry
 * carries a schema version, never a content version.
 */
function modelRegistryVersion(): ModelRegistryVersion {
  cachedRegistryVersion ??= {
    schemaVersion: modelRegistry.schemaVersion,
    models: Object.keys(modelRegistry.models).length,
    digest: createHash('sha256')
      .update(JSON.stringify(modelRegistry))
      .digest('hex')
      .slice(0, DIGEST_LENGTH),
  };
  return cachedRegistryVersion;
}

let cachedMigration: { readAtMs: number; value: MigrationVersion | null } | null = null;

// Unauthenticated endpoint: the ledger is read at most once a minute so that
// polling it cannot become a query generator against the primary.
async function migrationVersion(): Promise<MigrationVersion | null> {
  const now = Date.now();
  if (cachedMigration && now - cachedMigration.readAtMs < MIGRATION_CACHE_MS) {
    return cachedMigration.value;
  }
  let value: MigrationVersion | null = null;
  try {
    const rows = await getNeonDb().query<{
      sequence: number | string;
      filename: string;
      applied_at: string | Date | null;
    }>(
      `select sequence, filename, applied_at
         from public.schema_migrations
        order by sequence desc
        limit 1`,
      [],
    );
    const row = rows[0];
    if (row) {
      const appliedAt = row.applied_at;
      value = {
        sequence: Number(row.sequence),
        filename: row.filename,
        appliedAt: appliedAt instanceof Date ? appliedAt.toISOString() : (appliedAt ?? null),
      };
    }
  } catch (error) {
    logger.warn({ error }, '[version] migration ledger could not be read');
  }
  cachedMigration = { readAtMs: now, value };
  return value;
}

export async function GET() {
  return NextResponse.json(
    {
      commit: releaseSha() ?? UNKNOWN_VALUE,
      environment: deployEnvironment() ?? UNKNOWN_VALUE,
      deploymentId: deploymentId() ?? null,
      region: deployRegion() ?? null,
      migration: await migrationVersion(),
      modelRegistry: modelRegistryVersion(),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
