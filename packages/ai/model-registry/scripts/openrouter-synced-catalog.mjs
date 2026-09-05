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

function collectCuratedWireModelIds(curation) {
  const identifiers = new Set();
  for (const model of Object.values(curation.models)) {
    if (typeof model.apiModelId === 'string') identifiers.add(model.apiModelId);
  }
  return identifiers;
}

export function mergeOpenRouterSyncedCatalog(curation, catalogDir) {
  const synced = readOpenRouterSyncedCatalog(catalogDir);
  const curatedWireModelIds = collectCuratedWireModelIds(curation);
  for (const [id, entry] of Object.entries(synced.models ?? {})) {
    if (id in curation.models) continue;
    if (curatedWireModelIds.has(entry.apiModelId)) continue;
    curation.models[id] = entry;
  }
  return curation;
}
