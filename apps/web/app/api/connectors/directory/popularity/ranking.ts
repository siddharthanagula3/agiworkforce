import 'server-only';

import { CONNECTOR_DIRECTORY_POPULARITY_LIMIT } from '@agiworkforce/cloud-contracts';

import { isKnownConnectorId } from '@/lib/connectors/catalog';
import { resolveDirectoryTarget } from '@/lib/connectors/mcp-directory-targets';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

export const DIRECTORY_COUNT_MINIMUM = 5;

const RANKING_TTL_MS = 10 * 60 * 1000;
const UNAVAILABLE_TTL_MS = 60 * 1000;

export interface ConnectionCountRow {
  connector_id: string;
  connections: string | number;
}

export interface ConnectorPopularity {
  ranked: string[];
  available: boolean;
}

let cached: (ConnectorPopularity & { expiresAt: number }) | null = null;

async function directoryIdFor(connectorId: string): Promise<string | null> {
  if (isKnownConnectorId(connectorId)) return connectorId;
  const target = await resolveDirectoryTarget(connectorId).catch(() => null);
  return target?.connectorId ?? null;
}

export async function rankConnectorsByConnections(
  rows: readonly ConnectionCountRow[],
): Promise<string[]> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const connections = Number(row.connections);
    if (!Number.isSafeInteger(connections) || connections <= 0) continue;
    const id = await directoryIdFor(row.connector_id);
    if (!id) continue;
    totals.set(id, (totals.get(id) ?? 0) + connections);
  }
  return [...totals.entries()]
    .filter(([, connections]) => connections >= DIRECTORY_COUNT_MINIMUM)
    .sort(([leftId, left], [rightId, right]) => right - left || leftId.localeCompare(rightId))
    .slice(0, CONNECTOR_DIRECTORY_POPULARITY_LIMIT)
    .map(([id]) => id);
}

export async function loadConnectorPopularity(
  nowMs: number = Date.now(),
): Promise<ConnectorPopularity> {
  if (cached && cached.expiresAt > nowMs) {
    return { ranked: cached.ranked, available: cached.available };
  }
  try {
    const rows = await getNeonDb().query<ConnectionCountRow>(
      'select connector_id, connections from public.directory_connector_connection_counts()',
    );
    const ranked = await rankConnectorsByConnections(rows);
    cached = { ranked, available: true, expiresAt: nowMs + RANKING_TTL_MS };
  } catch (error) {
    logger.warn({ error }, 'Connector popularity unavailable');
    cached = { ranked: [], available: false, expiresAt: nowMs + UNAVAILABLE_TTL_MS };
  }
  return { ranked: cached.ranked, available: cached.available };
}

export function resetConnectorPopularityCache(): void {
  cached = null;
}
