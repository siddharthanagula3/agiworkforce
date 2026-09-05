import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyPromotion,
  applyRollback,
  buildPromotion,
  collectFamilyRefs,
  compareGenerations,
  evaluateFamily,
  familyMembers,
  inferLifecycle,
  loadFamilyCatalog,
  resolveFamilyRef,
  resolveFamilyRefsDeep,
  validateFamilyCatalog,
} from '../scripts/families.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_DIR = path.join(PACKAGE_ROOT, 'catalog');
const familyCatalog = loadFamilyCatalog(CATALOG_DIR);
const { policy } = familyCatalog;
const readCatalog = (name) => JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, name), 'utf8'));
const curation = readCatalog('models.curation.json');
const routingPolicies = readCatalog('routing-policies.json');
const registry = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
);

const FAMILY = 'fixture/flash';
const ACTIVE = 'fixture-flash-1';
const NEWER = 'fixture-flash-2';

function fixtureModel(overrides = {}) {
  return {
    provider: 'fixture',
    modelType: 'multimodal',
    apiModelId: overrides.apiModelId,
    ...overrides,
  };
}

function fixtureSnapshot(models, overrides = {}) {
  const keys = Object.keys(models);
  const fill = (value) => Object.fromEntries(keys.map((key) => [key, value]));
  return {
    models,
    providers: { fixture: { label: 'Fixture' } },
    capabilities:
      overrides.capabilities ?? fill({ textInput: true, textOutput: true, streaming: true }),
    pricing: overrides.pricing ?? fill({ inputPerMillion: 1, outputPerMillion: 4 }),
    limits: overrides.limits ?? fill({ contextTokens: 100000, maxOutputTokens: 8000 }),
    benchmarks: overrides.benchmarks ?? fill({}),
  };
}

function fixtureFamily(overrides = {}) {
  return {
    provider: 'fixture',
    canonicalFamily: 'flash',
    tier: 'balanced',
    modelType: 'multimodal',
    lifecyclePolicy: policy.stableLifecycle,
    apiModelIdPattern: '^fixture-flash-(?<generation>\\d+(?:\\.\\d+)*)$',
    requiredCapabilities: ['textInput', 'textOutput', 'streaming'],
    minContextTokens: 100000,
    minMaxOutputTokens: 8000,
    active: {
      modelKey: ACTIVE,
      generation: '1',
      lifecycle: policy.stableLifecycle,
      promotedAt: '2026-01-01',
      promotionReason: 'fixture',
    },
    previous: null,
    fallbackChain: [],
    history: [],
    ...overrides,
  };
}

const baselineModels = {
  [ACTIVE]: fixtureModel({ apiModelId: ACTIVE }),
  [NEWER]: fixtureModel({ apiModelId: NEWER }),
};

function decisionFor(models, snapshotOverrides = {}, familyOverrides = {}) {
  const snapshot = fixtureSnapshot(models, snapshotOverrides);
  return evaluateFamily(FAMILY, fixtureFamily(familyOverrides), snapshot, policy);
}

test('every family slot resolves to a live, non-retired catalog model', () => {
  const retired = new Set(readCatalog('retired-models.json').retiredModelIds);
  for (const [familyId, family] of Object.entries(familyCatalog.families)) {
    const model = curation.models[family.active.modelKey];
    assert.ok(model, `${familyId} active model must exist in the curation catalog`);
    assert.ok(
      !retired.has(family.active.modelKey),
      `${familyId} must not resolve to a retired model`,
    );
    assert.equal(model.provider, family.provider, `${familyId} provider must match its namespace`);
  }
});

test('every authored family reference resolves to a declared slot', () => {
  const referenced = new Set([
    ...collectFamilyRefs(curation.providers, policy),
    ...collectFamilyRefs(curation.tierAllowedModels, policy),
    ...collectFamilyRefs(routingPolicies.auto, policy),
  ]);
  assert.ok(referenced.size > 0, 'the authored catalogs must route through family slots');
  for (const familyId of referenced) {
    assert.ok(
      familyCatalog.families[familyId],
      `family slot ${familyId} is referenced but undeclared`,
    );
  }
});

test('resolution leaves no family reference in the generated registry', () => {
  assert.equal(collectFamilyRefs(registry, policy).size, 0);
  assert.equal(
    Object.keys(registry.families).sort().join(),
    Object.keys(familyCatalog.families).sort().join(),
  );
});

test('the generated registry publishes each slot active model and fallback chain', () => {
  for (const [familyId, family] of Object.entries(familyCatalog.families)) {
    const view = registry.families[familyId];
    assert.equal(view.activeModelKey, family.active.modelKey);
    assert.equal(view.activeGeneration, family.active.generation);
    assert.equal(view.previousModelKey, family.previous?.modelKey ?? null);
    assert.deepEqual(view.fallbackChain, family.fallbackChain);
  }
});

test('routing slots and provider defaults resolve through family slots, not literals', () => {
  const slotRefs = collectFamilyRefs(routingPolicies.auto.slots, policy);
  assert.ok(slotRefs.size > 0, 'routing slots must reference family slots');
  for (const [slotId, slot] of Object.entries(routingPolicies.auto.slots)) {
    if (slot.modelKey === undefined) continue;
    const resolved = resolveFamilyRef(slot.modelKey, familyCatalog);
    assert.equal(
      registry.policies.auto.slots[slotId].modelKey,
      resolved,
      `routing slot ${slotId} must compile to its family slot's active model`,
    );
  }
});

test('orders generations numerically rather than lexically', () => {
  assert.equal(compareGenerations('3.10', '3.9'), 1);
  assert.equal(compareGenerations('3.7', '3.7'), 0);
  assert.equal(compareGenerations('4', '3.99'), 1);
  assert.equal(compareGenerations('3', '3.0'), 0);
});

test('reads preview lifecycle from the model id rather than assuming stable', () => {
  assert.equal(inferLifecycle({}, 'fixture-flash-2-preview', policy), policy.previewLifecycle);
  assert.equal(inferLifecycle({}, 'fixture-flash-2', policy), policy.stableLifecycle);
  assert.equal(inferLifecycle({ deprecated: true }, 'fixture-flash-2', policy), 'deprecated');
});

test('promotes a newer stable model in the same family', () => {
  const decision = decisionFor(baselineModels);
  assert.equal(decision.promotable?.modelKey, NEWER);
  assert.ok(decision.promotable.gates.every((gate) => gate.passed));
});

test('never promotes across families or tiers on version number alone', () => {
  const models = {
    ...baselineModels,
    'fixture-pro-9': fixtureModel({ apiModelId: 'fixture-pro-9' }),
  };
  const members = familyMembers(fixtureFamily(), models, policy).map((member) => member.modelKey);
  assert.ok(
    !members.includes('fixture-pro-9'),
    'a different family must not match the slot pattern',
  );
  assert.deepEqual(members.sort(), [ACTIVE, NEWER]);
});

test('never promotes a model from another provider into the slot', () => {
  const models = {
    ...baselineModels,
    'fixture-flash-3': fixtureModel({ apiModelId: 'fixture-flash-3', provider: 'other' }),
  };
  const decision = decisionFor(models);
  assert.equal(decision.promotable?.modelKey, NEWER);
});

test('never auto-promotes a preview model into a stable slot', () => {
  const preview = 'fixture-flash-3-preview';
  const models = { ...baselineModels, [preview]: fixtureModel({ apiModelId: preview }) };
  const decision = decisionFor(models);
  const evaluation = decision.evaluations.find((entry) => entry.modelKey === preview);
  assert.equal(evaluation.eligible, false);
  assert.equal(evaluation.gates.find((gate) => gate.id === 'lifecycleEligibility').passed, false);
  assert.equal(decision.promotable?.modelKey, NEWER);
});

test('admits a preview model when the slot policy allows previews', () => {
  const preview = 'fixture-flash-3-preview';
  const models = { ...baselineModels, [preview]: fixtureModel({ apiModelId: preview }) };
  const decision = decisionFor(models, {}, { lifecyclePolicy: policy.previewLifecycle });
  assert.equal(decision.promotable?.modelKey, preview);
});

test('never promotes a deprecated model', () => {
  const models = {
    ...baselineModels,
    [NEWER]: fixtureModel({ apiModelId: NEWER, deprecated: true }),
  };
  const decision = decisionFor(models);
  assert.equal(decision.promotable, null);
});

test('never promotes a model that is not live for the configured provider', () => {
  const models = {
    ...baselineModels,
    [NEWER]: fixtureModel({ apiModelId: NEWER, availability: 'unavailable' }),
  };
  const decision = decisionFor(models);
  assert.equal(decision.promotable, null);
  assert.equal(
    decision.evaluations[0].gates.find((gate) => gate.id === 'providerAvailability').passed,
    false,
  );
});

test('never promotes a model that drops a required capability', () => {
  const decision = decisionFor(baselineModels, {
    capabilities: {
      [ACTIVE]: { textInput: true, textOutput: true, streaming: true },
      [NEWER]: { textInput: true, textOutput: true, streaming: false },
    },
  });
  assert.equal(decision.promotable, null);
  assert.match(
    decision.evaluations[0].gates.find((gate) => gate.id === 'capabilityCoverage').detail,
    /streaming/,
  );
});

test('never promotes a model that shrinks the context window', () => {
  const decision = decisionFor(baselineModels, {
    limits: {
      [ACTIVE]: { contextTokens: 100000, maxOutputTokens: 8000 },
      [NEWER]: { contextTokens: 50000, maxOutputTokens: 8000 },
    },
  });
  assert.equal(decision.promotable, null);
});

test('never promotes a model that breaches the cost regression threshold', () => {
  const ceiling = policy.thresholds.maxInputCostIncreaseRatio;
  const decision = decisionFor(baselineModels, {
    pricing: {
      [ACTIVE]: { inputPerMillion: 1, outputPerMillion: 4 },
      [NEWER]: { inputPerMillion: 1 + ceiling * 2, outputPerMillion: 4 },
    },
  });
  assert.equal(decision.promotable, null);
  assert.match(
    decision.evaluations[0].gates.find((gate) => gate.id === 'regressionThresholds').detail,
    /inputPerMillion/,
  );
});

test('accepts a cost increase that stays inside the configured threshold', () => {
  const ceiling = policy.thresholds.maxInputCostIncreaseRatio;
  const decision = decisionFor(baselineModels, {
    pricing: {
      [ACTIVE]: { inputPerMillion: 1, outputPerMillion: 4 },
      [NEWER]: { inputPerMillion: 1 + ceiling / 2, outputPerMillion: 4 },
    },
  });
  assert.equal(decision.promotable?.modelKey, NEWER);
});

test('never promotes a model that regresses a shared benchmark', () => {
  const decision = decisionFor(baselineModels, {
    benchmarks: { [ACTIVE]: { coding: 80 }, [NEWER]: { coding: 40 } },
  });
  assert.equal(decision.promotable, null);
});

test('ignores older generations already in the catalog', () => {
  const older = 'fixture-flash-0';
  const models = { ...baselineModels, [older]: fixtureModel({ apiModelId: older }) };
  const decision = decisionFor(models);
  assert.ok(!decision.evaluations.some((entry) => entry.modelKey === older));
});

test('promotion records the previous model, fallback chain, and evaluation evidence', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const decision = evaluateFamily(FAMILY, fixtureFamily(), snapshot, policy);
  const promotion = buildPromotion(
    decision.promotable,
    snapshot,
    policy,
    'newer flash',
    '2026-09-01',
  );
  const promoted = applyPromotion(fixtureFamily(), promotion, policy);

  assert.equal(promoted.active.modelKey, NEWER);
  assert.equal(promoted.previous.modelKey, ACTIVE);
  assert.deepEqual(promoted.fallbackChain, [ACTIVE]);
  assert.equal(promoted.active.promotedAt, '2026-09-01');
  assert.equal(promoted.active.promotionReason, 'newer flash');
  assert.ok(promoted.active.pricingSnapshot.inputPerMillion > 0);
  assert.equal(promoted.active.capabilitySnapshot.streaming, true);
  assert.equal(promoted.active.limitSnapshot.contextTokens, 100000);
  assert.equal(promoted.active.evaluation.seeded, false);
  assert.ok(promoted.active.evaluation.gates.capabilityCoverage);
  assert.deepEqual(promoted.history.at(-1), {
    promotedAt: '2026-09-01',
    from: ACTIVE,
    to: NEWER,
    reason: 'newer flash',
  });
});

test('bounds the fallback chain at the configured limit', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const decision = evaluateFamily(FAMILY, fixtureFamily(), snapshot, policy);
  const promotion = buildPromotion(
    decision.promotable,
    snapshot,
    policy,
    'newer flash',
    '2026-09-01',
  );
  const seeded = fixtureFamily({
    fallbackChain: Array.from(
      { length: policy.fallbackChainLimit + 2 },
      (_, index) => `legacy-${index}`,
    ),
  });
  const promoted = applyPromotion(seeded, promotion, policy);
  assert.equal(promoted.fallbackChain.length, policy.fallbackChainLimit);
  assert.equal(promoted.fallbackChain[0], ACTIVE);
});

test('rolls back to the previous model and keeps the demoted one reachable', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const decision = evaluateFamily(FAMILY, fixtureFamily(), snapshot, policy);
  const promotion = buildPromotion(
    decision.promotable,
    snapshot,
    policy,
    'newer flash',
    '2026-09-01',
  );
  const promoted = applyPromotion(fixtureFamily(), promotion, policy);
  const rolled = applyRollback(promoted, 'provider outage', '2026-09-02', policy);

  assert.equal(rolled.active.modelKey, ACTIVE);
  assert.equal(rolled.previous.modelKey, NEWER);
  assert.ok(rolled.fallbackChain.includes(NEWER));
  assert.equal(rolled.history.at(-1).rollback, true);
});

test('rejects a rollback when no previous model was retained', () => {
  assert.throws(() => applyRollback(fixtureFamily(), 'no history', '2026-09-02', policy));
});

test('validates the authored family catalog against the compiled roster', () => {
  const snapshot = {
    models: curation.models,
    providers: curation.providers,
    capabilities: registry.capabilities,
    pricing: registry.pricing,
    limits: registry.limits,
    benchmarks: registry.benchmarks,
    retiredModelKeys: new Set(readCatalog('retired-models.json').retiredModelIds),
  };
  validateFamilyCatalog(familyCatalog, snapshot);
});

test('rejects a family slot whose active model is outside its family', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const broken = {
    policy,
    families: { [FAMILY]: fixtureFamily({ provider: 'fixture', canonicalFamily: 'flash' }) },
  };
  broken.families[FAMILY].active = { ...broken.families[FAMILY].active, modelKey: 'fixture-pro-9' };
  snapshot.models['fixture-pro-9'] = fixtureModel({ apiModelId: 'fixture-pro-9' });
  assert.throws(() => validateFamilyCatalog(broken, snapshot), /does not match its family pattern/);
});

test('rejects a promoted family whose chain was cleared while its predecessor still ships', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const cleared = {
    policy,
    families: {
      [FAMILY]: fixtureFamily({
        active: { modelKey: NEWER, generation: '2', lifecycle: policy.stableLifecycle },
        previous: { modelKey: ACTIVE, generation: '1', lifecycle: policy.stableLifecycle },
        fallbackChain: [],
        history: [{ promotedAt: '2026-02-01', from: ACTIVE, to: NEWER, reason: 'fixture' }],
      }),
    },
  };
  assert.throws(
    () => validateFamilyCatalog(cleared, snapshot),
    /neither in the roster nor in retired-models\.json/,
  );
});

test('accepts an empty chain once every model the slot was promoted away from is retired', () => {
  const snapshot = fixtureSnapshot({ [NEWER]: fixtureModel({ apiModelId: NEWER }) });
  snapshot.retiredModelKeys = new Set([ACTIVE]);
  const retiredPredecessor = {
    policy,
    families: {
      [FAMILY]: fixtureFamily({
        active: { modelKey: NEWER, generation: '2', lifecycle: policy.stableLifecycle },
        previous: { modelKey: ACTIVE, generation: '1', lifecycle: policy.stableLifecycle },
        fallbackChain: [],
        history: [{ promotedAt: '2026-02-01', from: ACTIVE, to: NEWER, reason: 'fixture' }],
      }),
    },
  };
  validateFamilyCatalog(retiredPredecessor, snapshot);
});

test('requires the chain to list every still-rostered model the slot was promoted away from', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const missing = {
    policy,
    families: {
      [FAMILY]: fixtureFamily({
        active: { modelKey: NEWER, generation: '2', lifecycle: policy.stableLifecycle },
        previous: { modelKey: ACTIVE, generation: '1', lifecycle: policy.stableLifecycle },
        fallbackChain: [],
        history: [{ promotedAt: '2026-02-01', from: ACTIVE, to: NEWER, reason: 'fixture' }],
      }),
    },
  };
  snapshot.retiredModelKeys = new Set([ACTIVE]);
  assert.throws(() => validateFamilyCatalog(missing, snapshot), /newest first/);
});

test('rejects a family slot that lists its active model as a fallback', () => {
  const snapshot = fixtureSnapshot(baselineModels);
  const broken = { policy, families: { [FAMILY]: fixtureFamily({ fallbackChain: [ACTIVE] }) } };
  assert.throws(() => validateFamilyCatalog(broken, snapshot), /fallback chain/);
});

test('resolves a family reference to the active model everywhere it appears', () => {
  const [familyId, family] = Object.entries(familyCatalog.families)[0];
  const ref = `${policy.referencePrefix}${familyId}`;
  assert.equal(resolveFamilyRef(ref, familyCatalog), family.active.modelKey);
  assert.deepEqual(resolveFamilyRefsDeep({ a: [ref, 'literal'], b: { c: ref } }, familyCatalog), {
    a: [family.active.modelKey, 'literal'],
    b: { c: family.active.modelKey },
  });
});

test('rejects a reference to an undeclared family slot', () => {
  assert.throws(
    () => resolveFamilyRef(`${policy.referencePrefix}nope/missing`, familyCatalog),
    /Unknown family slot/,
  );
});
