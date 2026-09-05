import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateSlotLifecycle } from '../scripts/compile.mjs';
import { LIFECYCLE_STAGE } from '../scripts/lifecycle-stages.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
);

const PRIMARY = 'slot-primary';
const CANDIDATE = 'slot-candidate';
const SLOT_ID = 'a_slot';
const TRAFFIC_FRACTION = 0.05;
const DAILY_CAP = 250;

function models(primaryStage, candidateStage) {
  return {
    [PRIMARY]: { lifecycle: { stage: primaryStage } },
    [CANDIDATE]: { lifecycle: { stage: candidateStage } },
  };
}

test('a slot may serve only a promoted or canary model', () => {
  for (const stage of [LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.canary]) {
    validateSlotLifecycle(SLOT_ID, { modelKey: PRIMARY }, models(stage, stage));
  }
  for (const stage of [
    LIFECYCLE_STAGE.registered,
    LIFECYCLE_STAGE.evaluated,
    LIFECYCLE_STAGE.shadow,
    LIFECYCLE_STAGE.observed,
    LIFECYCLE_STAGE.deprecated,
  ]) {
    assert.throws(
      () => validateSlotLifecycle(SLOT_ID, { modelKey: PRIMARY }, models(stage, stage)),
      /a slot may serve only/,
      `stage ${stage} must not be servable`,
    );
  }
});

test('a canary needs a promoted sibling to pull back to', () => {
  const slot = {
    modelKey: PRIMARY,
    canary: { modelKey: CANDIDATE, trafficFraction: TRAFFIC_FRACTION },
  };
  validateSlotLifecycle(SLOT_ID, slot, models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.canary));
  assert.throws(
    () =>
      validateSlotLifecycle(SLOT_ID, slot, models(LIFECYCLE_STAGE.canary, LIFECYCLE_STAGE.canary)),
    /no promoted sibling to pull back to/,
  );
});

test('a canary candidate must itself be at the canary stage, with a real fraction', () => {
  assert.throws(
    () =>
      validateSlotLifecycle(
        SLOT_ID,
        { modelKey: PRIMARY, canary: { modelKey: CANDIDATE, trafficFraction: TRAFFIC_FRACTION } },
        models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.evaluated),
      ),
    /is not at lifecycle stage canary/,
  );
  for (const trafficFraction of [0, 1, -0.1, 1.5, 'half', undefined]) {
    assert.throws(
      () =>
        validateSlotLifecycle(
          SLOT_ID,
          { modelKey: PRIMARY, canary: { modelKey: CANDIDATE, trafficFraction } },
          models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.canary),
        ),
      /trafficFraction must sit strictly between/,
      `fraction ${String(trafficFraction)} must be refused`,
    );
  }
});

test('a shadow may not mirror anything until it declares its daily ceiling', () => {
  validateSlotLifecycle(
    SLOT_ID,
    { modelKey: PRIMARY, shadow: { modelKey: CANDIDATE, dailyRequestCap: DAILY_CAP } },
    models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.shadow),
  );
  for (const dailyRequestCap of [undefined, 0, -1, 1.5, 'many']) {
    assert.throws(
      () =>
        validateSlotLifecycle(
          SLOT_ID,
          { modelKey: PRIMARY, shadow: { modelKey: CANDIDATE, dailyRequestCap } },
          models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.shadow),
        ),
      /must declare a positive dailyRequestCap/,
      `cap ${String(dailyRequestCap)} must be refused`,
    );
  }
});

test('an unknown or misstaged shadow candidate is refused', () => {
  assert.throws(
    () =>
      validateSlotLifecycle(
        SLOT_ID,
        { modelKey: PRIMARY, shadow: { modelKey: 'nobody', dailyRequestCap: DAILY_CAP } },
        models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.shadow),
      ),
    /shadow references unknown model/,
  );
  assert.throws(
    () =>
      validateSlotLifecycle(
        SLOT_ID,
        { modelKey: PRIMARY, shadow: { modelKey: CANDIDATE, dailyRequestCap: DAILY_CAP } },
        models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.promoted),
      ),
    /is not at lifecycle stage shadow/,
  );
});

test('an unsupported key on a candidate is named, never silently dropped', () => {
  assert.throws(
    () =>
      validateSlotLifecycle(
        SLOT_ID,
        {
          modelKey: PRIMARY,
          canary: { modelKey: CANDIDATE, trafficFraction: TRAFFIC_FRACTION, weight: 1 },
        },
        models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.canary),
      ),
    /canary has unsupported keys: weight/,
  );
  assert.throws(
    () =>
      validateSlotLifecycle(
        SLOT_ID,
        {
          modelKey: PRIMARY,
          shadow: { modelKey: CANDIDATE, dailyRequestCap: DAILY_CAP, sampleRate: 1 },
        },
        models(LIFECYCLE_STAGE.promoted, LIFECYCLE_STAGE.shadow),
      ),
    /shadow has unsupported keys: sampleRate/,
  );
});

test('the live catalog declares no shadow or canary, and every slot is promoted', () => {
  for (const [slotId, slot] of Object.entries(REGISTRY.policies.auto.slots)) {
    assert.equal(
      REGISTRY.models[slot.modelKey].lifecycle.stage,
      LIFECYCLE_STAGE.promoted,
      `slot ${slotId} must serve a promoted model`,
    );
    assert.equal(slot.canary, undefined, `slot ${slotId} declares a canary`);
    assert.equal(slot.shadow, undefined, `slot ${slotId} declares a shadow`);
  }
});
