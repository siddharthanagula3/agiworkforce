import fs from 'node:fs';
import path from 'node:path';

export const OPENROUTER_SYNCED_CATALOG_FILENAME = 'models.openrouter-synced.json';

export function openRouterSyncedCatalogPath(catalogDir) {
  return path.join(catalogDir, OPENROUTER_SYNCED_CATALOG_FILENAME);
}

export function readOpenRouterSyncedCatalog(catalogDir) {
  const file = openRouterSyncedCatalogPath(catalogDir);
  if (!fs.existsSync(file)) return { source: null, endpoint: null, fetchedAt: null, models: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function mergeOpenRouterSyncedCatalog(curation, catalogDir) {
  const synced = readOpenRouterSyncedCatalog(catalogDir);
  for (const [id, entry] of Object.entries(synced.models ?? {})) {
    if (id in curation.models) continue;
    curation.models[id] = entry;
  }
  return curation;
}
