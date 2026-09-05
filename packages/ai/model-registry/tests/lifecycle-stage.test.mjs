import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeLifecycle } from '../scripts/compile.mjs';
import {
  LIFECYCLE_STAGE,
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_SHORTCUTS,
  allowedNextStages,
  formatStageCensus,
  isAllowedStageTransition,
  isLifecycleStage,
  stageAtOrAfter,
  stageCensus,
} from '../scripts/lifecycle-stages.mjs';
import { mergeOpenRouterSyncedCatalog } from '../scripts/openrouter-synced-catalog.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
);
const CURATION = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'models.curation.json'), 'utf8'),
);
mergeOpenRouterSyncedCatalog(CURATION, path.join(PACKAGE_ROOT, 'catalog'));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function lifecycleFixture(overrides) {
  return {
    availability: 'live',
    released: 'July 9, 2026',
    lifecycle: { stage: LIFECYCLE_STAGE.registered, stagedOn: '2026-09-05', source: 'a source' },
    ...overrides,
  };
}

test('the mandate stages are the whole vocabulary, in order', () => {
  assert.deepEqual(LIFECYCLE_STAGES, [
    'discovered',
    'registered',
    'probed',
    'benchmarked',
    'evaluated',
    'shadow',
    'canary',
    'promoted',
    'observed',
    'deprecated',
    'removed',
  ]);
  assert.equal(LIFECYCLE_STAGES.length, new Set(LIFECYCLE_STAGES).size);
  assert.ok(!isLifecycleStage('retired'));
});

test('a stage may advance one step, and no further without a declared shortcut', () => {
  for (const [index, stage] of LIFECYCLE_STAGES.entries()) {
    const next = LIFECYCLE_STAGES[index + 1];
    if (next === undefined) continue;
    if (stage === LIFECYCLE_STAGE.deprecated) continue;
    assert.ok(isAllowedStageTransition(stage, next), `${stage} should reach ${next}`);
  }
  assert.ok(!isAllowedStageTransition(LIFECYCLE_STAGE.discovered, LIFECYCLE_STAGE.probed));
  assert.ok(!isAllowedStageTransition(LIFECYCLE_STAGE.registered, LIFECYCLE_STAGE.canary));
  assert.ok(!isAllowedStageTransition(LIFECYCLE_STAGE.shadow, LIFECYCLE_STAGE.registered));
});

test('every declared shortcut is a real skip, and each is reachable', () => {
  for (const shortcut of LIFECYCLE_STAGE_SHORTCUTS) {
    assert.ok(isAllowedStageTransition(shortcut.from, shortcut.to));
    assert.ok(stageAtOrAfter(shortcut.to, shortcut.from));
    assert.ok(
      typeof shortcut.reason === 'string' && shortcut.reason.length > 0,
      `${shortcut.from} to ${shortcut.to} must record why the skipped stage did not happen`,
    );
  }
  assert.ok(allowedNextStages(LIFECYCLE_STAGE.registered).includes(LIFECYCLE_STAGE.evaluated));
  assert.ok(allowedNextStages(LIFECYCLE_STAGE.evaluated).includes(LIFECYCLE_STAGE.promoted));
});

test('deprecation is reachable from every stage, removal only from deprecation', () => {
  for (const stage of LIFECYCLE_STAGES) {
    if (stage === LIFECYCLE_STAGE.deprecated) continue;
    assert.ok(
      isAllowedStageTransition(stage, LIFECYCLE_STAGE.deprecated),
      `${stage} must be able to deprecate`,
    );
    if (stage === LIFECYCLE_STAGE.removed) continue;
    assert.ok(
      !isAllowedStageTransition(stage, LIFECYCLE_STAGE.removed),
      `${stage} must not skip deprecation on the way out`,
    );
  }
  assert.ok(isAllowedStageTransition(LIFECYCLE_STAGE.deprecated, LIFECYCLE_STAGE.removed));
  assert.ok(!isAllowedStageTransition(LIFECYCLE_STAGE.removed, LIFECYCLE_STAGE.promoted));
});

test('every catalog model carries a stage, the day it reached it, and its source', () => {
  for (const [modelKey, model] of Object.entries(REGISTRY.models)) {
    const { stage, stagedOn, stageSource } = model.lifecycle;
    assert.ok(isLifecycleStage(stage), `${modelKey} stage ${stage} is not canonical`);
    assert.match(stagedOn ?? '', ISO_DAY, `${modelKey} stagedOn must be a calendar day`);
    assert.ok(
      typeof stageSource === 'string' && stageSource.length > 0,
      `${modelKey} must name what justifies stage ${stage}`,
    );
  }
  assert.equal(Object.keys(REGISTRY.models).length, Object.keys(CURATION.models).length);
});

test('the backfill census is the one the compiler prints', () => {
  const stages = Object.fromEntries(
    Object.entries(REGISTRY.models).map(([modelKey, model]) => [modelKey, model.lifecycle.stage]),
  );
  const census = stageCensus(stages);
  assert.equal(census.get(LIFECYCLE_STAGE.discovered), 349);
  assert.equal(census.get(LIFECYCLE_STAGE.promoted), 17);
  assert.equal(census.get(LIFECYCLE_STAGE.evaluated), 5);
  assert.equal(census.get(LIFECYCLE_STAGE.registered), 33);
  assert.equal(
    [...census.values()].reduce((total, count) => total + count, 0),
    Object.keys(REGISTRY.models).length,
  );
  assert.equal(
    formatStageCensus(stages),
    'discovered 349, registered 33, evaluated 5, promoted 17',
  );
});

test('a model in a live routing slot is promoted', () => {
  for (const [slotId, slot] of Object.entries(REGISTRY.policies.auto.slots)) {
    const stage = REGISTRY.models[slot.modelKey].lifecycle.stage;
    assert.ok(
      stage === LIFECYCLE_STAGE.promoted || stage === LIFECYCLE_STAGE.canary,
      `slot ${slotId} serves ${slot.modelKey} at stage ${stage}`,
    );
  }
});

test('a model outside every slot with sourced scores is at least evaluated', () => {
  const slotted = new Set(Object.values(REGISTRY.policies.auto.slots).map((slot) => slot.modelKey));
  for (const [modelKey, scores] of Object.entries(REGISTRY.benchmarks)) {
    if (slotted.has(modelKey) || Object.keys(scores).length === 0) continue;
    assert.ok(
      stageAtOrAfter(REGISTRY.models[modelKey].lifecycle.stage, LIFECYCLE_STAGE.evaluated),
      `${modelKey} has sourced scores and must be at least evaluated`,
    );
  }
});

test('compile rejects a stage that is not canonical, undated, or unsourced', () => {
  assert.throws(
    () => normalizeLifecycle('m', lifecycleFixture({ lifecycle: undefined })),
    /must declare a lifecycle block/,
  );
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({ lifecycle: { stage: 'retired', stagedOn: '2026-09-05', source: 's' } }),
      ),
    /not one of the canonical stages/,
  );
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({ lifecycle: { stage: LIFECYCLE_STAGE.registered, source: 's' } }),
      ),
    /lifecycle.stagedOn must be an ISO calendar day/,
  );
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({
          lifecycle: { stage: LIFECYCLE_STAGE.registered, stagedOn: '2026-09-05' },
        }),
      ),
    /must name the source that justifies it/,
  );
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({
          lifecycle: {
            stage: LIFECYCLE_STAGE.registered,
            stagedOn: '2026-09-05',
            source: 's',
            note: 'x',
          },
        }),
      ),
    /unsupported keys/,
  );
});

test('compile holds a non-live model at or below shadow', () => {
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({
          availability: 'preview',
          lifecycle: {
            stage: LIFECYCLE_STAGE.promoted,
            stagedOn: '2026-09-05',
            source: 's',
          },
        }),
      ),
    /may not sit past lifecycle stage shadow/,
  );
  assert.equal(
    normalizeLifecycle(
      'm',
      lifecycleFixture({
        availability: 'preview',
        lifecycle: { stage: LIFECYCLE_STAGE.shadow, stagedOn: '2026-09-05', source: 's' },
      }),
    ).stage,
    LIFECYCLE_STAGE.shadow,
  );
});

test('compile keeps the stage and the deprecated flag in agreement', () => {
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({
          deprecated: true,
          lifecycle: { stage: LIFECYCLE_STAGE.promoted, stagedOn: '2026-09-05', source: 's' },
        }),
      ),
    /disagrees with deprecated=true/,
  );
  assert.throws(
    () =>
      normalizeLifecycle(
        'm',
        lifecycleFixture({
          lifecycle: { stage: LIFECYCLE_STAGE.deprecated, stagedOn: '2026-09-05', source: 's' },
        }),
      ),
    /disagrees with deprecated=false/,
  );
});
