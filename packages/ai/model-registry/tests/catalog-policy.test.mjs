import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadFamilyCatalog, resolveFamilyRefsDeep } from '../scripts/families.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const familyCatalog = loadFamilyCatalog(path.join(PACKAGE_ROOT, 'catalog'));
const authoredCuration = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'models.curation.json'), 'utf8'),
);
const curation = {
  ...authoredCuration,
  providers: resolveFamilyRefsDeep(authoredCuration.providers, familyCatalog),
  tierAllowedModels: resolveFamilyRefsDeep(authoredCuration.tierAllowedModels, familyCatalog),
};
const harnesses = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'harnesses.json'), 'utf8'),
);
const retiredModels = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'retired-models.json'), 'utf8'),
);
const registry = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
);

const generatedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const routedOpenAIModelKeys = new Set([
  curation.providers.openai.defaultModel,
  ...Object.values(curation.providers.openai.taskRouting),
]);

const permanentlyExcludedProviders = [
  'ai21',
  'azure',
  'cerebras',
  'cohere',
  'deepinfra',
  'fireworks',
  'sambanova',
  'together',
];

const permanentlyExcludedModels = retiredModels.retiredModelIds;

const anthropicDefaultModelKey = curation.providers.anthropic.defaultModel;
const runwayVideoModelEntry = Object.entries(curation.models).find(
  ([, model]) => model.provider === 'runway' && model.modelType === 'video',
);
assert.ok(runwayVideoModelEntry, 'The authored Runway video model must exist');
const [runwayVideoModelKey, runwayVideoModel] = runwayVideoModelEntry;

test('requires every live Gemini image model to declare its generated-byte MIME contract', () => {
  const candidates = Object.entries(curation.models).filter(([, model]) => {
    const isLive = model.availability === undefined || model.availability === 'live';
    const isDeprecated = model.deprecated === true || model.status === 'deprecated';
    return model.modelType === 'image' && model.imageApi === 'gemini' && isLive && !isDeprecated;
  });

  assert.ok(candidates.length > 0, 'The live Gemini image catalog fixture must exist');
  for (const [modelKey, model] of candidates) {
    assert.ok(
      generatedImageMimeTypes.has(model.imageOutputMimeType),
      `${modelKey} must declare a supported imageOutputMimeType`,
    );
  }
});

test('keeps the removed Stability image family out of authored catalog truth', () => {
  const stabilityImageModels = Object.values(curation.models).filter(
    (model) => model.modelType === 'image' && model.imageApi === 'stability',
  );
  assert.deepEqual(stabilityImageModels, []);
});

test('keeps routed OpenAI pricing tiers ordered and fully numeric when published', () => {
  const candidates = Object.entries(curation.models).filter(
    ([modelKey, model]) =>
      routedOpenAIModelKeys.has(modelKey) &&
      model.provider === 'openai' &&
      model.modelType === 'reasoning',
  );

  assert.equal(
    candidates.length,
    routedOpenAIModelKeys.size,
    'every routed OpenAI model must resolve to a canonical reasoning record',
  );

  for (const [modelKey, model] of candidates) {
    const base = model.costOverride;
    assert.ok(base, `${modelKey} must declare canonical short-context prices`);
    let previousThreshold = -1;
    for (const [index, tier] of (model.inputTokenPricingTiers ?? []).entries()) {
      assert.ok(
        Number.isFinite(tier.thresholdTokens) && tier.thresholdTokens > previousThreshold,
        `${modelKey} input-token tier ${index} must increase its finite threshold`,
      );
      for (const [field, value] of Object.entries(tier)) {
        assert.ok(
          Number.isFinite(value) && value >= 0,
          `${modelKey} input-token tier ${index}.${field} must be finite and non-negative`,
        );
      }
      previousThreshold = tier.thresholdTokens;
    }
  }
});

test('permanently excludes unsupported providers and retired models from authored catalog truth', () => {
  for (const provider of permanentlyExcludedProviders) {
    assert.equal(curation.providers[provider], undefined, `${provider} must not be reintroduced`);
    assert.doesNotMatch(
      JSON.stringify(curation.providers),
      new RegExp(provider, 'iu'),
      `${provider} must not remain in active provider aliases or prefixes`,
    );
  }

  for (const model of permanentlyExcludedModels) {
    assert.equal(curation.models[model], undefined, `${model} must not be reintroduced`);
  }
});

test('pins the Qwen deployment-scope pricing bands and standard Anthropic prices', () => {
  const internationalEndpoint = /dashscope-intl\.aliyuncs\.com/u;
  const qwenProviderEntry = Object.entries(curation.providers).find(([, provider]) => {
    const fastModel = curation.models[provider.taskRouting?.fast_completion];
    const defaultModel = curation.models[provider.defaultModel];
    return (
      fastModel !== undefined &&
      defaultModel !== undefined &&
      fastModel !== defaultModel &&
      fastModel.provider === defaultModel.provider &&
      defaultModel.inputTokenPricingTiers?.length === 1 &&
      internationalEndpoint.test(defaultModel.pricingNote ?? '')
    );
  });
  assert.ok(qwenProviderEntry, 'Expected one provider with the verified Qwen tier shapes');
  const [providerKey, qwenProvider] = qwenProviderEntry;
  const qwenModelKeys = [
    ...new Set([qwenProvider.defaultModel, qwenProvider.taskRouting.fast_completion]),
  ];

  for (const modelKey of qwenModelKeys) {
    const model = curation.models[modelKey];
    assert.equal(model.id, modelKey);
    assert.equal(model.provider, providerKey);
    assert.deepEqual(model.inputModalities, ['text', 'image', 'video']);
    assert.equal(model.contextOverride, 1_000_000);
    assert.ok(
      model.maxOutputTokens >= 64_000,
      `${modelKey} must not drop below the Qwen family output floor`,
    );
    assert.equal(model.capabilitiesOverride.vision, true);
    assert.equal(model.capabilitiesOverride.tools, true);
    assert.equal(model.capabilitiesOverride.caching, true);
    assert.equal(model.capabilitiesOverride.search, false);
    assert.equal(model.capabilitiesOverride.codeExecution, false);
  }

  const flash = curation.models[qwenProvider.taskRouting.fast_completion];
  assert.deepEqual(flash.costOverride, {
    inputCost: 0.15,
    outputCost: 0.47,
  });
  assert.equal(
    flash.inputTokenPricingTiers,
    undefined,
    'the International Qwen Flash row is a single band from zero to the full window',
  );
  assert.match(flash.pricingNote, internationalEndpoint);

  const plus = curation.models[qwenProvider.defaultModel];
  assert.deepEqual(plus.costOverride, {
    inputCost: 0.4,
    outputCost: 1.6,
    cached_input: 0.08,
    cached_write: 0.5,
  });
  assert.deepEqual(plus.inputTokenPricingTiers, [
    {
      thresholdTokens: 256_000,
      inputCost: 1.2,
      cached_input: 0.24,
      cached_write: 1.5,
      outputCost: 4.8,
    },
  ]);
  assert.match(plus.pricingNote, /dashscope-intl\.aliyuncs\.com/u);
  assert.deepEqual(qwenProvider.defaultPricing, {
    inputPerMillion: 0.4,
    outputPerMillion: 1.6,
  });

  assert.deepEqual(curation.models[anthropicDefaultModelKey].costOverride, {
    inputCost: 2,
    outputCost: 10,
    cached_input: 0.2,
    cached_write: 2.5,
    cached_write_1h: 4,
  });
  assert.equal(curation.models[anthropicDefaultModelKey].promo_expires_at, undefined);
  assert.equal(curation.models[anthropicDefaultModelKey].post_promo_prices, undefined);
});

test('pins the Runway text-to-video route and fails closed without provisioning proof', () => {
  const modelKey = runwayVideoModelKey;
  const authored = runwayVideoModel;

  assert.equal(authored.id, modelKey);
  assert.equal(typeof authored.apiModelId, 'string');
  assert.ok(authored.apiModelId.length > 0);
  assert.equal(typeof authored.name, 'string');
  assert.ok(authored.name.length > 0);
  assert.equal(authored.provider, 'runway');
  assert.equal(authored.modelType, 'video');
  assert.deepEqual(authored.inputModalities, ['text', 'image']);
  assert.equal(authored.releasedOverride, 'December 2025');

  assert.equal(authored.videoPerSecondCost, 0.12);
  assert.deepEqual(authored.videoPerSecondCostByResolution, { '720p': 0.12 });
  assert.match(authored.pricingNote, /1280:720/u);
  assert.match(authored.pricingNote, /720:1280/u);
  assert.match(authored.pricingNote, /2-10 seconds/u);
  assert.match(authored.pricingNote, /prores and png_sequence add 5 credits/u);
  assert.deepEqual(authored.videoGeneration.durationSecs, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(authored.videoGeneration.supportsAudio, false);
  assert.equal(authored.videoGeneration.supportsSeed, true);
  assert.equal(authored.videoGeneration.outputSizes.length, 6);

  assert.equal(authored.contextOverride, undefined);
  assert.equal(authored.availability, 'unavailable');
  assert.match(authored.unavailableReason, /live AGI-owned account probe/u);
  assert.equal(curation.providers.runway.defaultModel, '');
  assert.deepEqual(curation.providers.runway.modelPrefixes, ['runway', 'gen4.']);

  const compiledModel = registry.models[modelKey];
  const compiledRoute = registry.routes[`runway/${modelKey}`];
  assert.equal(compiledModel.identity.providerModelId, authored.apiModelId);
  assert.equal(compiledModel.lifecycle.availability, 'unavailable');
  assert.equal(compiledRoute.providerModelId, authored.apiModelId);
  assert.equal(compiledRoute.selectable, false);
  assert.equal(registry.pricing[modelKey].videoPerSecond, 0.12);
  assert.deepEqual(registry.pricing[modelKey].videoPerSecondByResolution, { '720p': 0.12 });
  assert.equal(registry.limits[modelKey].contextTokens, undefined);
  assert.equal(registry.capabilities[modelKey].textInput, true);
  assert.equal(registry.capabilities[modelKey].imageInput, true);
  assert.equal(registry.capabilities[modelKey].videoOutput, true);
});

const ANTHROPIC_STANDARD_RATES = {
  inputCost: 2,
  outputCost: 10,
  cached_input: 0.2,
  cached_write: 2.5,
  cached_write_1h: 4,
};

test('never prices the default Anthropic route below the standard rates on any date', () => {
  const model = curation.models[anthropicDefaultModelKey];
  const decision =
    'Decision #22 (docs/decisions/README.md) is retired as of 2026-09-03 by founder instruction: ' +
    'Anthropic reclassified $2/$10 per MTok as its permanent standard price and cancelled the ' +
    'scheduled 2026-09-01 increase to $3/$15, so the provider-cost-versus-product-price premise no ' +
    'longer applies. The default Anthropic route now bills users the founder-selected standard ' +
    '$2/$10 per MTok (cache read $0.20, 5m write $2.50, 1h write $4.00) on EVERY date, tracking ' +
    "Anthropic's own published rate.";

  assert.deepEqual(
    model.costOverride,
    ANTHROPIC_STANDARD_RATES,
    `${anthropicDefaultModelKey} costOverride must stay the standard rates. ${decision}`,
  );

  const schedule = model.pricingSchedule;
  if (schedule === undefined) return;

  assert.ok(
    Array.isArray(schedule),
    `${anthropicDefaultModelKey} pricingSchedule must be an array. ${decision}`,
  );
  for (const [index, window] of schedule.entries()) {
    for (const [field, standard] of Object.entries(ANTHROPIC_STANDARD_RATES)) {
      const scheduled = window[field];
      if (scheduled === undefined) continue;
      assert.ok(
        scheduled >= standard,
        `${anthropicDefaultModelKey} pricingSchedule[${index}].${field} = ${scheduled} is BELOW the standard ` +
          `${standard}. ${decision}`,
      );
    }
  }
});

test('publishes the standard default Anthropic rates in the compiled registry on any date', () => {
  const decision =
    'Decision #22 (docs/decisions/README.md) is retired as of 2026-09-03: the default Anthropic ' +
    "route bills users the founder-selected standard rates, now tracking Anthropic's own permanent " +
    '$2/$10 price, on EVERY date.';
  const pricing = registry.pricing[anthropicDefaultModelKey];
  const compiledStandard = {
    inputPerMillion: ANTHROPIC_STANDARD_RATES.inputCost,
    outputPerMillion: ANTHROPIC_STANDARD_RATES.outputCost,
    cacheReadPerMillion: ANTHROPIC_STANDARD_RATES.cached_input,
    cacheWritePerMillion: ANTHROPIC_STANDARD_RATES.cached_write,
    cacheWrite1hPerMillion: ANTHROPIC_STANDARD_RATES.cached_write_1h,
  };

  for (const [field, standard] of Object.entries(compiledStandard)) {
    assert.equal(
      pricing[field],
      standard,
      `compiled ${anthropicDefaultModelKey} ${field}. ${decision}`,
    );
  }

  for (const [index, window] of (pricing.schedule ?? []).entries()) {
    for (const [field, standard] of Object.entries(compiledStandard)) {
      const scheduled = window[field];
      if (scheduled === undefined) continue;
      assert.ok(
        scheduled >= standard,
        `compiled ${anthropicDefaultModelKey} schedule[${index}].${field} = ${scheduled} is BELOW the ` +
          `standard ${standard}. ${decision}`,
      );
    }
  }
});

test('keeps provider-native Qwen tools unavailable until the AGI harness wires them', () => {
  const features = harnesses.harnesses['qwen/chat-completions'].features;
  assert.deepEqual(features.webSearch, {
    providerSupport: 'native',
    implementation: 'unwired',
  });
  assert.deepEqual(features.codeExecution, {
    providerSupport: 'native',
    implementation: 'unwired',
  });
});
