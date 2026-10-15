import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { familyMembers } from '../scripts/families.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(packageRoot, file), 'utf8'));
const curation = readJson('catalog/models.curation.json');
const familyCatalog = readJson('catalog/model-families.json');
const registry = readJson('generated/registry.json');
const compatibility = JSON.parse(
  fs.readFileSync(path.join(packageRoot, '../../contracts/types/src/models.json'), 'utf8'),
);
const family = Object.values(familyCatalog.families).find(
  (entry) => entry.provider === 'anthropic' && entry.tier === 'fast',
);
const modelKey = familyMembers(family, curation.models, familyCatalog.policy).find(
  (member) => member.generation === '5-5',
).modelKey;

test('the Haiku family slot serves its one current generation, promoted through the gate', () => {
  assert.ok(family);
  assert.ok(modelKey);
  const members = familyMembers(family, curation.models, familyCatalog.policy);
  assert.equal(members.length, 1);
  assert.equal(members[0].modelKey, modelKey);
  assert.equal(members[0].generation, '5-5');
  assert.equal(family.active.modelKey, modelKey);
  assert.equal(family.active.evaluation.seeded, false);
  assert.ok(Object.keys(family.active.evaluation.gates).length > 0);
});

test('Haiku publishes adaptive thinking and request constraints in the consumer contract', () => {
  const model = compatibility.models[modelKey];
  assert.equal(model.apiModelId, modelKey);
  assert.equal(model.promptCacheMinimumTokens, 512);
  assert.deepEqual(model.inputModalities, ['text', 'image', 'pdf']);
  assert.equal(model.reasoning.thinkingDefault, 'adaptive');
  assert.equal(model.reasoning.supportsManualThinking, false);
  assert.equal(model.reasoning.rejectsSamplingParameters, true);
  assert.equal(model.reasoning.maxEffortWhenThinkingDisabled, 'high');
  assert.equal(model.reasoning.defaultEffort, 'medium');
  assert.deepEqual(model.reasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(model.reasoning.request, {
    api: 'messages',
    effortPath: 'output_config.effort',
    togglePath: 'thinking.type',
    budgetPath: null,
  });
  assert.equal(registry.limits[modelKey].contextTokens, 1_000_000);
  assert.equal(registry.limits[modelKey].maxOutputTokens, 128_000);
  assert.equal(registry.limits[modelKey].knowledgeCutoff, '2026-06');
});

test('Haiku records the higher whole-prompt tier and every cache price', () => {
  assert.deepEqual(registry.pricing[modelKey], {
    currency: 'USD',
    unit: 'per_million_tokens',
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    cacheReadPerMillion: 0.01,
    cacheWritePerMillion: 0.125,
    cacheWrite1hPerMillion: 0.2,
    inputTokenPricingTiers: [
      {
        thresholdTokens: 100_000,
        inputPerMillion: 0.5,
        outputPerMillion: 2.5,
        cacheReadPerMillion: 0.05,
        cacheWritePerMillion: 0.625,
        cacheWrite1hPerMillion: 1,
      },
    ],
  });
});

test('Haiku tool and image support remains distinct from route-dependent browser support', () => {
  const capabilities = registry.capabilities[modelKey];
  assert.equal(capabilities.functionCalling, true);
  assert.equal(capabilities.imageInput, true);
  assert.equal(capabilities.streaming, true);
  assert.ok(registry.capabilityClasses.routeDependent.includes('computerUse'));
  assert.ok(!registry.capabilityClasses.intrinsic.includes('computerUse'));
});
