import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

export const FAMILY_CATALOG_FILE = 'model-families.json';

const GENERATION_GROUP = 'generation';
const SEPARATOR = '/';

export function loadFamilyCatalog(catalogDir) {
  const file = path.join(catalogDir, FAMILY_CATALOG_FILE);
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(catalog.policy, `${FAMILY_CATALOG_FILE} must declare a policy`);
  assert.ok(catalog.families, `${FAMILY_CATALOG_FILE} must declare families`);
  return catalog;
}

export function isFamilyRef(value, policy) {
  return typeof value === 'string' && value.startsWith(policy.referencePrefix);
}

export function familyRefId(value, policy) {
  return value.slice(policy.referencePrefix.length);
}

export function resolveFamilyRef(value, familyCatalog) {
  const { policy, families } = familyCatalog;
  if (!isFamilyRef(value, policy)) return value;
  const familyId = familyRefId(value, policy);
  const family = families[familyId];
  assert.ok(family, `Unknown family slot ${familyId} referenced as ${value}`);
  const modelKey = family.active?.modelKey;
  assert.ok(modelKey, `Family slot ${familyId} has no active model`);
  return modelKey;
}

export function resolveFamilyRefsDeep(value, familyCatalog) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveFamilyRefsDeep(entry, familyCatalog));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveFamilyRefsDeep(entry, familyCatalog),
      ]),
    );
  }
  return resolveFamilyRef(value, familyCatalog);
}

export function collectFamilyRefs(value, policy, found = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectFamilyRefs(entry, policy, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectFamilyRefs(entry, policy, found);
    return found;
  }
  if (isFamilyRef(value, policy)) found.add(familyRefId(value, policy));
  return found;
}

const GENERATION_SEPARATOR = /[.-]/;

export function parseGeneration(text) {
  const parts = String(text)
    .split(GENERATION_SEPARATOR)
    .map((segment) => Number.parseInt(segment, 10));
  assert.ok(
    parts.length > 0 && parts.every((segment) => Number.isInteger(segment)),
    `Generation ${text} is not a dotted or dashed integer version`,
  );
  return parts;
}

export function compareGenerations(left, right) {
  const a = parseGeneration(left);
  const b = parseGeneration(right);
  const width = Math.max(a.length, b.length);
  for (let index = 0; index < width; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

export function modelApiId(model, modelKey) {
  return model.apiModelId ?? model.id ?? modelKey;
}

export function previewMarkerFor(apiModelId, policy) {
  return policy.previewMarkers.find((pattern) => new RegExp(pattern).test(apiModelId)) ?? null;
}

export function stripLifecycleSuffix(apiModelId, policy) {
  const marker = previewMarkerFor(apiModelId, policy);
  return marker ? apiModelId.replace(new RegExp(marker), '') : apiModelId;
}

export function inferLifecycle(model, modelKey, policy) {
  if (model.deprecated === true || model.status === 'deprecated') return 'deprecated';
  if (typeof model.status === 'string' && model.status !== 'active') return model.status;
  const apiId = modelApiId(model, modelKey);
  return previewMarkerFor(apiId, policy) ? policy.previewLifecycle : policy.stableLifecycle;
}

export function matchFamilyMember(family, model, modelKey, policy) {
  if (model.provider !== family.provider) return null;
  const apiId = modelApiId(model, modelKey);
  const match = new RegExp(family.apiModelIdPattern).exec(stripLifecycleSuffix(apiId, policy));
  const generation = match?.groups?.[GENERATION_GROUP];
  if (!generation) return null;
  return {
    modelKey,
    apiModelId: apiId,
    generation,
    lifecycle: inferLifecycle(model, modelKey, policy),
    availability: model.availability ?? policy.requiredAvailability,
  };
}

export function familyMembers(family, models, policy) {
  return Object.entries(models)
    .map(([modelKey, model]) => matchFamilyMember(family, model, modelKey, policy))
    .filter(Boolean)
    .sort((left, right) => compareGenerations(right.generation, left.generation));
}

function ratioIncrease(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return (to - from) / from;
}

function gate(id, passed, detail) {
  return { id, passed, detail };
}

function thresholdsFor(family, policy) {
  return { ...policy.thresholds, ...(family.thresholds ?? {}) };
}

function providerAvailabilityGate(candidate, family, policy, providers) {
  const provider = providers?.[family.provider];
  if (!provider)
    return gate('providerAvailability', false, `provider ${family.provider} is not configured`);
  if (candidate.availability !== policy.requiredAvailability) {
    return gate('providerAvailability', false, `availability is ${candidate.availability}`);
  }
  return gate('providerAvailability', true, `configured on ${family.provider}`);
}

function familyIdentityGate(candidate, family, model) {
  if (model.provider !== family.provider) {
    return gate('familyIdentity', false, `provider ${model.provider} is not ${family.provider}`);
  }
  if (family.modelType !== undefined && model.modelType !== family.modelType) {
    return gate('familyIdentity', false, `modelType ${model.modelType} is not ${family.modelType}`);
  }
  return gate('familyIdentity', true, `matches ${family.canonicalFamily} at tier ${family.tier}`);
}

function lifecycleEligibilityGate(candidate, family, policy) {
  if (policy.blockedLifecycles.includes(candidate.lifecycle)) {
    return gate('lifecycleEligibility', false, `lifecycle ${candidate.lifecycle} is blocked`);
  }
  const allowed = policy.promotableLifecycles[family.lifecyclePolicy] ?? [];
  if (!allowed.includes(candidate.lifecycle)) {
    return gate(
      'lifecycleEligibility',
      false,
      `lifecycle ${candidate.lifecycle} may not occupy a ${family.lifecyclePolicy} slot`,
    );
  }
  return gate('lifecycleEligibility', true, `lifecycle ${candidate.lifecycle} is allowed`);
}

function capabilityCoverageGate(candidate, family, snapshot) {
  const capabilities = snapshot.capabilities[candidate.modelKey] ?? {};
  const missing = family.requiredCapabilities.filter(
    (capability) => capabilities[capability] !== true,
  );
  if (missing.length > 0) {
    return gate('capabilityCoverage', false, `missing ${missing.join(', ')}`);
  }
  const limits = snapshot.limits[candidate.modelKey] ?? {};
  if (
    Number.isFinite(family.minContextTokens) &&
    (limits.contextTokens ?? 0) < family.minContextTokens
  ) {
    return gate(
      'capabilityCoverage',
      false,
      `context ${limits.contextTokens ?? 0} below required ${family.minContextTokens}`,
    );
  }
  if (
    Number.isFinite(family.minMaxOutputTokens) &&
    (limits.maxOutputTokens ?? 0) < family.minMaxOutputTokens
  ) {
    return gate(
      'capabilityCoverage',
      false,
      `max output ${limits.maxOutputTokens ?? 0} below required ${family.minMaxOutputTokens}`,
    );
  }
  return gate(
    'capabilityCoverage',
    true,
    `covers ${family.requiredCapabilities.length} capabilities`,
  );
}

function regressionThresholdsGate(candidate, family, snapshot, policy) {
  const limits = thresholdsFor(family, policy);
  const activeKey = family.active.modelKey;
  const failures = [];

  const activePricing = snapshot.pricing[activeKey] ?? {};
  const candidatePricing = snapshot.pricing[candidate.modelKey] ?? {};
  const priced = [
    ['inputPerMillion', limits.maxInputCostIncreaseRatio],
    ['outputPerMillion', limits.maxOutputCostIncreaseRatio],
  ];
  for (const [field, ceiling] of priced) {
    const delta = ratioIncrease(activePricing[field], candidatePricing[field]);
    if (delta !== null && delta > ceiling) {
      failures.push(
        `${field} rose ${(delta * 100).toFixed(1)}% over ${(ceiling * 100).toFixed(0)}%`,
      );
    }
  }

  const activeLimits = snapshot.limits[activeKey] ?? {};
  const candidateLimits = snapshot.limits[candidate.modelKey] ?? {};
  const scaled = [
    ['contextTokens', limits.minContextRatio],
    ['maxOutputTokens', limits.minMaxOutputRatio],
  ];
  for (const [field, floor] of scaled) {
    const from = activeLimits[field];
    const to = candidateLimits[field];
    if (Number.isFinite(from) && Number.isFinite(to) && to < from * floor) {
      failures.push(`${field} fell from ${from} to ${to}`);
    }
  }

  const activeBenchmarks = snapshot.benchmarks[activeKey] ?? {};
  const candidateBenchmarks = snapshot.benchmarks[candidate.modelKey] ?? {};
  const shared = Object.keys(activeBenchmarks).filter((key) => key in candidateBenchmarks);
  for (const key of shared) {
    const from = sourcedBenchmarkValue(activeBenchmarks[key]);
    const to = sourcedBenchmarkValue(candidateBenchmarks[key]);
    if (from === null || to === null) {
      failures.push(`benchmark ${key} carries no source on one of the two models`);
      continue;
    }
    if (to < from * limits.minBenchmarkRatio) {
      failures.push(`benchmark ${key} fell from ${from} to ${to}`);
    }
  }

  if (failures.length > 0) return gate('regressionThresholds', false, failures.join('; '));
  const note =
    shared.length > 0
      ? `${shared.length} shared benchmarks held`
      : 'no shared benchmarks published';
  return gate('regressionThresholds', true, note);
}

export function sourcedBenchmarkValue(score) {
  if (!score || typeof score !== 'object') return null;
  if (typeof score.source !== 'string' || score.source.length === 0) return null;
  return Number.isFinite(score.value) ? score.value : null;
}

export function evaluateCandidate(candidate, familyId, family, snapshot, policy) {
  const model = snapshot.models[candidate.modelKey];
  const gates = [
    providerAvailabilityGate(candidate, family, policy, snapshot.providers),
    familyIdentityGate(candidate, family, model),
    lifecycleEligibilityGate(candidate, family, policy),
    capabilityCoverageGate(candidate, family, snapshot),
    regressionThresholdsGate(candidate, family, snapshot, policy),
  ];
  return {
    familyId,
    modelKey: candidate.modelKey,
    generation: candidate.generation,
    lifecycle: candidate.lifecycle,
    gates,
    eligible: gates.every((entry) => entry.passed),
  };
}

export function evaluateFamily(familyId, family, snapshot, policy) {
  const members = familyMembers(family, snapshot.models, policy);
  const active = family.active.modelKey;
  const newer = members.filter(
    (member) =>
      member.modelKey !== active &&
      compareGenerations(member.generation, family.active.generation) > 0,
  );
  const evaluations = newer.map((candidate) =>
    evaluateCandidate(candidate, familyId, family, snapshot, policy),
  );
  const promotable = evaluations.find((entry) => entry.eligible) ?? null;
  const activeModel = snapshot.models[active];
  return {
    familyId,
    active,
    activeGeneration: family.active.generation,
    activeLifecycle: activeModel ? inferLifecycle(activeModel, active, policy) : null,
    members,
    evaluations,
    promotable,
  };
}

export function snapshotFor(modelKey, snapshot) {
  const pricing = snapshot.pricing[modelKey] ?? {};
  const limits = snapshot.limits[modelKey] ?? {};
  return {
    pricingSnapshot: Object.fromEntries(
      Object.entries(pricing).filter(
        ([, value]) => value !== undefined && typeof value !== 'object',
      ),
    ),
    capabilitySnapshot: snapshot.capabilities[modelKey] ?? {},
    limitSnapshot: Object.fromEntries(
      Object.entries(limits).filter(
        ([, value]) => value !== undefined && typeof value !== 'object',
      ),
    ),
    benchmarkSnapshot: snapshot.benchmarks[modelKey] ?? {},
  };
}

export function buildPromotion(evaluation, snapshot, policy, reason, now) {
  return {
    modelKey: evaluation.modelKey,
    generation: evaluation.generation,
    lifecycle: evaluation.lifecycle,
    promotedAt: now,
    promotionReason: reason,
    evaluation: {
      gates: Object.fromEntries(evaluation.gates.map((entry) => [entry.id, entry.detail])),
      seeded: false,
    },
    availability: policy.requiredAvailability,
    ...snapshotFor(evaluation.modelKey, snapshot),
  };
}

export function applyPromotion(family, promotion, policy) {
  const demoted = family.active;
  const chain = [demoted.modelKey, ...family.fallbackChain].filter(
    (modelKey, index, all) => modelKey !== promotion.modelKey && all.indexOf(modelKey) === index,
  );
  return {
    ...family,
    active: promotion,
    previous: demoted,
    fallbackChain: chain.slice(0, policy.fallbackChainLimit),
    history: [
      ...family.history,
      {
        promotedAt: promotion.promotedAt,
        from: demoted.modelKey,
        to: promotion.modelKey,
        reason: promotion.promotionReason,
      },
    ],
  };
}

export function applyRollback(family, reason, now, policy) {
  assert.ok(family.previous, 'Family slot has no previous model to roll back to');
  const demoted = family.active;
  const restored = { ...family.previous, promotedAt: now, promotionReason: reason };
  const chain = [demoted.modelKey, ...family.fallbackChain].filter(
    (modelKey, index, all) => modelKey !== restored.modelKey && all.indexOf(modelKey) === index,
  );
  return {
    ...family,
    active: restored,
    previous: demoted,
    fallbackChain: chain.slice(0, policy.fallbackChainLimit),
    history: [
      ...family.history,
      { promotedAt: now, from: demoted.modelKey, to: restored.modelKey, reason, rollback: true },
    ],
  };
}

export function buildFamilyView(familyCatalog, snapshot, policy) {
  return Object.fromEntries(
    Object.entries(familyCatalog.families).map(([familyId, family]) => {
      const activeModel = snapshot.models[family.active.modelKey];
      return [
        familyId,
        {
          provider: family.provider,
          canonicalFamily: family.canonicalFamily,
          tier: family.tier,
          lifecyclePolicy: family.lifecyclePolicy,
          activeModelKey: family.active.modelKey,
          activeGeneration: family.active.generation,
          activeLifecycle: activeModel
            ? inferLifecycle(activeModel, family.active.modelKey, policy)
            : null,
          previousModelKey: family.previous?.modelKey ?? null,
          fallbackChain: family.fallbackChain,
          promotedAt: family.active.promotedAt,
          promotionReason: family.active.promotionReason,
        },
      ];
    }),
  );
}

function demotedModelKeys(family) {
  const demoted = [];
  for (let index = family.history.length - 1; index >= 0; index -= 1) {
    const modelKey = family.history[index].from;
    if (modelKey === family.active.modelKey || demoted.includes(modelKey)) continue;
    demoted.push(modelKey);
  }
  return demoted;
}

function validateFallbackChain(familyId, family, snapshot, policy) {
  const demoted = demotedModelKeys(family);
  const retired = snapshot.retiredModelKeys ?? new Set();
  if (demoted.length > 0 && family.fallbackChain.length === 0) {
    for (const modelKey of demoted) {
      assert.ok(
        retired.has(modelKey),
        `Family slot ${familyId} has been promoted but lists no fallback, and ${modelKey} is neither in the roster nor in retired-models.json. Re-run the promotion tool rather than clearing the chain by hand`,
      );
    }
  }
  const expected = demoted
    .filter((modelKey) => snapshot.models[modelKey])
    .slice(0, policy.fallbackChainLimit);
  assert.deepEqual(
    family.fallbackChain,
    expected,
    `Family slot ${familyId} fallback chain must be every still-rostered model it was promoted away from, newest first`,
  );
}

export function validateFamilyCatalog(familyCatalog, snapshot) {
  const { policy, families } = familyCatalog;
  for (const [familyId, family] of Object.entries(families)) {
    const [providerSegment] = familyId.split(SEPARATOR);
    assert.equal(
      providerSegment,
      family.provider,
      `Family slot ${familyId} must be namespaced by its provider`,
    );
    const model = snapshot.models[family.active.modelKey];
    assert.ok(model, `Family slot ${familyId} references unknown model ${family.active.modelKey}`);
    const member = matchFamilyMember(family, model, family.active.modelKey, policy);
    assert.ok(member, `Family slot ${familyId} active model does not match its family pattern`);
    assert.equal(
      member.generation,
      family.active.generation,
      `Family slot ${familyId} records generation ${family.active.generation} but resolves ${member.generation}`,
    );
    const allowed = policy.promotableLifecycles[family.lifecyclePolicy] ?? [];
    assert.ok(
      allowed.includes(member.lifecycle) || policy.blockedLifecycles.includes(member.lifecycle),
      `Family slot ${familyId} active lifecycle ${member.lifecycle} is not valid for a ${family.lifecyclePolicy} slot`,
    );
    assert.notEqual(
      family.previous?.modelKey,
      family.active.modelKey,
      `Family slot ${familyId} must not list its active model as previous`,
    );
    for (const modelKey of family.fallbackChain) {
      assert.ok(
        snapshot.models[modelKey],
        `Family slot ${familyId} fallback ${modelKey} is not a catalog model`,
      );
      assert.notEqual(
        modelKey,
        family.active.modelKey,
        `Family slot ${familyId} must not list its active model in the fallback chain`,
      );
    }
    assert.ok(
      family.fallbackChain.length <= policy.fallbackChainLimit,
      `Family slot ${familyId} fallback chain exceeds ${policy.fallbackChainLimit}`,
    );
    validateFallbackChain(familyId, family, snapshot, policy);
  }
}
