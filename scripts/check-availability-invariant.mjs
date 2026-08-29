#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  loadFamilyCatalog,
  resolveFamilyRefsDeep,
} from '../packages/ai/model-registry/scripts/families.mjs';

const root = process.cwd();
const CATALOG = path.join(root, 'packages/contracts/types/src/models.json');
const FAMILY_CATALOG_DIR = path.join(root, 'packages/ai/model-registry/catalog');
const ROUTING_POLICIES = path.join(
  root,
  'packages/ai/model-registry/catalog/routing-policies.json',
);

const familyCatalog = loadFamilyCatalog(FAMILY_CATALOG_DIR);
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const models = catalog.models ?? {};

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

/** @type {{ id: string, where: string }[]} */
const refs = [];

for (const [bucket, ids] of Object.entries(catalog.tierAllowedModels ?? {})) {
  for (const id of ids ?? []) refs.push({ id, where: `tierAllowedModels.${bucket}` });
}

for (const [provider, cfg] of Object.entries(catalog.providers ?? {})) {
  for (const [task, id] of Object.entries(cfg.taskRouting ?? {})) {
    if (id) refs.push({ id, where: `providers.${provider}.taskRouting.${task}` });
  }
  if (cfg.defaultModel) {
    refs.push({ id: cfg.defaultModel, where: `providers.${provider}.defaultModel` });
  }
}

for (const [provider, entries] of Object.entries(catalog.modelPresets ?? {})) {
  for (const entry of entries ?? []) {
    if (entry?.value) refs.push({ id: entry.value, where: `modelPresets.${provider}` });
  }
}

const routingPolicies = resolveFamilyRefsDeep(
  JSON.parse(fs.readFileSync(ROUTING_POLICIES, 'utf8')),
  familyCatalog,
);
for (const [slot, definition] of Object.entries(routingPolicies.auto?.slots ?? {})) {
  if (definition?.modelKey) {
    refs.push({ id: definition.modelKey, where: `routingPolicies.auto.slots.${slot}` });
  } else if (definition?.providerTask) {
    const { provider, task } = definition.providerTask;
    const id = catalog.providers?.[provider]?.taskRouting?.[task];
    if (!id) {
      console.error(
        `FAIL: routingPolicies.auto.slots.${slot} references missing provider task ${provider}.${task}`,
      );
      process.exit(1);
    }
    refs.push({ id, where: `routingPolicies.auto.slots.${slot}.providerTask` });
  }
}

const violations = [];
for (const { id, where } of refs) {
  const availability = availabilityById.get(id);
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
      `after a real 200 probe (packages/contracts/types/src/models.json).`,
  );
  process.exit(1);
}

console.log(
  `PASS: availability invariant holds. ${nonLiveIds.size} non-live model(s) ` +
    `(${[...nonLiveIds].join(', ') || 'none'}) are absent from all ${refs.length} routable references.`,
);
