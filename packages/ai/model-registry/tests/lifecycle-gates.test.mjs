import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lifecycleRefusals, stagedModel } from '../scripts/family-slots.mjs';
import { LIFECYCLE_STAGE } from '../scripts/lifecycle-stages.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY_SLOTS = path.join(PACKAGE_ROOT, 'scripts', 'family-slots.mjs');
const CURATION = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'models.curation.json'), 'utf8'),
);
const PROBES = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'probes.json'), 'utf8'),
);

const CANDIDATE = 'candidate-model';
const STAGED_ON = '2026-09-05';

function catalogWith(stage) {
  return { models: { [CANDIDATE]: { lifecycle: { stage, stagedOn: STAGED_ON, source: 's' } } } };
}

function probesWith(outcome) {
  return { probes: { [CANDIDATE]: { outcome } } };
}

function runSlots(args) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [FAMILY_SLOTS, ...args], {
        cwd: PACKAGE_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    };
  } catch (error) {
    return { status: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('promotion is refused below evaluation, however healthy the probe', () => {
  const refusals = lifecycleRefusals(
    CANDIDATE,
    catalogWith(LIFECYCLE_STAGE.registered),
    probesWith('answered'),
    LIFECYCLE_STAGE.promoted,
  );
  assert.ok(refusals.some((refusal) => refusal.includes('has not passed evaluated')));
});

test('promotion is refused without an answered probe, however well evaluated', () => {
  for (const probeFile of [probesWith('failed'), probesWith('no_credential'), { probes: {} }]) {
    const refusals = lifecycleRefusals(
      CANDIDATE,
      catalogWith(LIFECYCLE_STAGE.evaluated),
      probeFile,
      LIFECYCLE_STAGE.promoted,
    );
    assert.ok(refusals.some((refusal) => refusal.includes('no answered probe')));
  }
});

test('an evaluated model with an answered probe is promotable', () => {
  assert.deepEqual(
    lifecycleRefusals(
      CANDIDATE,
      catalogWith(LIFECYCLE_STAGE.evaluated),
      probesWith('answered'),
      LIFECYCLE_STAGE.promoted,
    ),
    [],
  );
});

test('a shadow model must pass through canary, not jump to promoted', () => {
  const refusals = lifecycleRefusals(
    CANDIDATE,
    catalogWith(LIFECYCLE_STAGE.shadow),
    probesWith('answered'),
    LIFECYCLE_STAGE.promoted,
  );
  assert.ok(
    refusals.some((refusal) => refusal.includes('cannot move from lifecycle stage shadow')),
  );
  assert.deepEqual(
    lifecycleRefusals(
      CANDIDATE,
      catalogWith(LIFECYCLE_STAGE.canary),
      probesWith('answered'),
      LIFECYCLE_STAGE.promoted,
    ),
    [],
  );
});

test('a model outside the catalog is refused rather than invented', () => {
  assert.deepEqual(
    lifecycleRefusals(CANDIDATE, { models: {} }, probesWith('answered'), LIFECYCLE_STAGE.promoted),
    [`${CANDIDATE} is not in the curation catalog`],
  );
});

test('staging replaces the whole lifecycle block and keeps the rest of the record', () => {
  const staged = stagedModel(
    { id: CANDIDATE, lifecycle: { stage: LIFECYCLE_STAGE.evaluated, stagedOn: '2026-01-01' } },
    LIFECYCLE_STAGE.promoted,
    STAGED_ON,
    'a slot',
  );
  assert.deepEqual(staged, {
    id: CANDIDATE,
    lifecycle: { stage: LIFECYCLE_STAGE.promoted, stagedOn: STAGED_ON, source: 'a slot' },
  });
});

test('retire needs a model, and refuses a removal that skips deprecation', () => {
  const missing = runSlots(['retire']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /retire requires --model/);

  const promoted = Object.entries(CURATION.models).find(
    ([, model]) => model.lifecycle.stage === LIFECYCLE_STAGE.promoted,
  );
  assert.ok(promoted, 'the catalog must hold a promoted model for this case');
  const skipped = runSlots(['retire', '--model', promoted[0], '--remove']);
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.output, /cannot move from lifecycle stage promoted to removed/);
});

test('retire deprecates a promoted model, and says so before writing anything', () => {
  const promoted = Object.entries(CURATION.models).find(
    ([, model]) => model.lifecycle.stage === LIFECYCLE_STAGE.promoted,
  );
  const dryRun = runSlots(['retire', '--model', promoted[0]]);
  assert.equal(dryRun.status, 0);
  assert.match(dryRun.output, /would retire .*: promoted → deprecated/);
  assert.match(dryRun.output, /dry run, pass --apply/);
});

test('the committed probe record is the one the promotion gate reads', () => {
  for (const [modelKey, probe] of Object.entries(PROBES.probes)) {
    assert.ok(CURATION.models[modelKey], `${modelKey} was probed but is not in the catalog`);
    assert.equal(typeof probe.outcome, 'string');
  }
});
