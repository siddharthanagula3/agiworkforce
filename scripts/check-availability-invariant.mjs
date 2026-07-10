#!/usr/bin/env node
// check-availability-invariant.mjs
//
// GUARDRAIL for the `availability` axis (reasoning-effort-capability wave,
// 2026-07-10, Addendum A). A model whose `availability` is NOT "live"
// (i.e. "coming_soon" or "unavailable") must NEVER appear in any routable /
// selectable / tier set — otherwise the request path could send an announced-
// but-unprovisioned model to a provider and 404 live (fake availability).
//
// Invariant enforced:
//   ∀ model where availability !== "live"  ⇒  id ∉ (
//       tierAllowedModels ∪ SLOT_REGISTRY ∪ taskRouting ∪ defaultModel ∪ modelPresets
//   )
//
// Sources of truth:
//   - packages/types/src/models.json  → availability, tierAllowedModels,
//     providers[*].taskRouting, providers[*].defaultModel, modelPresets.
//   - packages/types/src/model-catalog.ts → SLOT_REGISTRY (TS; the modelId
//     literals are extracted from the SLOT_REGISTRY block by text).
//
// This makes "announced but non-routable" a CHECKED property, not a convention.
// When a coming_soon model is provisioned, flip its availability to "live" (or
// drop the field) after a real 200 probe — then it may join the routable sets.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const CATALOG = path.join(root, 'packages/types/src/models.json');
const MODEL_CATALOG_TS = path.join(root, 'packages/types/src/model-catalog.ts');

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const models = catalog.models ?? {};

// id + apiModelId → availability ("live" when absent).
const availabilityById = new Map();
for (const [id, m] of Object.entries(models)) {
  const availability = m.availability ?? 'live';
  availabilityById.set(id, availability);
  if (typeof m.apiModelId === 'string') availabilityById.set(m.apiModelId, availability);
}

const nonLiveIds = new Set(
  Object.entries(models)
    .filter(([, m]) => (m.availability ?? 'live') !== 'live')
    .map(([id]) => id),
);

// ---- Collect every routable/selectable reference, with a source label. ----
/** @type {{ id: string, where: string }[]} */
const refs = [];

// tierAllowedModels.{economy,pro_additions,flagship_additions}
for (const [bucket, ids] of Object.entries(catalog.tierAllowedModels ?? {})) {
  for (const id of ids ?? []) refs.push({ id, where: `tierAllowedModels.${bucket}` });
}

// providers[*].taskRouting.* and providers[*].defaultModel
for (const [provider, cfg] of Object.entries(catalog.providers ?? {})) {
  for (const [task, id] of Object.entries(cfg.taskRouting ?? {})) {
    if (id) refs.push({ id, where: `providers.${provider}.taskRouting.${task}` });
  }
  if (cfg.defaultModel) {
    refs.push({ id: cfg.defaultModel, where: `providers.${provider}.defaultModel` });
  }
}

// modelPresets[*][].value
for (const [provider, entries] of Object.entries(catalog.modelPresets ?? {})) {
  for (const entry of entries ?? []) {
    if (entry?.value) refs.push({ id: entry.value, where: `modelPresets.${provider}` });
  }
}

// SLOT_REGISTRY modelIds — extracted from the TS source (no build needed).
const ts = fs.readFileSync(MODEL_CATALOG_TS, 'utf8');
const registryStart = ts.indexOf('export const SLOT_REGISTRY');
if (registryStart === -1) {
  console.error('FAIL: could not locate SLOT_REGISTRY in model-catalog.ts');
  process.exit(1);
}
// The block ends at the first top-of-line `};` after the declaration.
const registryEnd = ts.indexOf('\n};', registryStart);
const registryBlock = ts.slice(registryStart, registryEnd === -1 ? undefined : registryEnd);
for (const match of registryBlock.matchAll(/modelId:\s*'([^']+)'/gu)) {
  refs.push({ id: match[1], where: 'SLOT_REGISTRY' });
}

// ---- Enforce the invariant. ----
const violations = [];
for (const { id, where } of refs) {
  const availability = availabilityById.get(id);
  // Auto modes ("auto-*") and legacy/alias ids not in the catalog are out of
  // scope for THIS check (SLOT_REGISTRY drift + phantom-id checks cover those).
  if (availability === undefined) continue;
  if (availability !== 'live') {
    violations.push(`  ${where} → "${id}" is availability:"${availability}" (must be "live")`);
  }
}

if (violations.length > 0) {
  console.error(
    `FAIL: ${violations.length} routable reference(s) point at a non-live model.\n` +
      `A coming_soon/unavailable model must not appear in any routable/tier set.\n` +
      violations.join('\n') +
      `\nFix: remove the id from the routable set, or flip its availability to "live"\n` +
      `after a real 200 probe (packages/types/src/models.json).`,
  );
  process.exit(1);
}

console.log(
  `PASS: availability invariant holds. ${nonLiveIds.size} non-live model(s) ` +
    `(${[...nonLiveIds].join(', ') || 'none'}) are absent from all ${refs.length} routable references.`,
);
