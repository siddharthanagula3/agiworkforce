import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..', '..');
const registry = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
);
const curation = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'models.curation.json'), 'utf8'),
);
const retiredModels = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'retired-models.json'), 'utf8'),
);
const compatibility = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'packages', 'contracts', 'types', 'src', 'models.json'),
    'utf8',
  ),
);
const skillSpectorOpenAIRegistry = fs.readFileSync(
  path.join(
    REPO_ROOT,
    'tools',
    'skill-vetting',
    'src',
    'skillspector',
    'providers',
    'openai',
    'model_registry.yaml',
  ),
  'utf8',
);

const openAIProvider = compatibility.providers.openai;
const currentOpenAI = {
  frontier: {
    modelKey: openAIProvider.defaultModel,
  },
  balanced: {
    modelKey: openAIProvider.taskRouting.chat,
  },
  economy: {
    modelKey: openAIProvider.taskRouting.fast_completion,
  },
};
const currentOpenAIKeys = new Set(Object.values(currentOpenAI).map(({ modelKey }) => modelKey));

const anthropicProvider = compatibility.providers.anthropic;
const anthropicStandardModelKey = anthropicProvider.defaultModel;
const anthropicComplexModelKey = anthropicProvider.taskRouting.complex_reasoning;
const anthropicPremiumModelKey = registry.policies.auto.slots.flagship_coding.modelKey;
const currentAnthropic = {
  [anthropicComplexModelKey]: {
    input: 10,
    cacheRead: curation.models[anthropicComplexModelKey].costOverride.cached_input,
    cacheWrite5m: 12.5,
    cacheWrite1h: 20,
    output: 50,
    context: 1_000_000,
    maxOutput: 128_000,
  },
  [anthropicPremiumModelKey]: {
    input: 5,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    output: 25,
    context: 1_000_000,
    maxOutput: 128_000,
  },
  [anthropicStandardModelKey]: {
    input: 2,
    cacheRead: 0.2,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
    output: 10,
    context: 1_000_000,
    maxOutput: 128_000,
  },
};

test('generates the optional skill analyzer OpenAI registry from canonical routing', () => {
  const provider = compatibility.providers.openai;
  const routedModelIds = [
    ...new Set([provider.defaultModel, ...Object.values(provider.taskRouting)]),
  ];
  assert.match(
    skillSpectorOpenAIRegistry,
    new RegExp(`^default_model: '${provider.defaultModel}'$`, 'm'),
  );
  for (const modelId of routedModelIds) {
    assert.match(skillSpectorOpenAIRegistry, new RegExp(`^  '${modelId}':$`, 'm'));
  }
});

test('compiles the routed OpenAI reasoning family from one canonical curation record', () => {
  assert.equal(
    currentOpenAIKeys.size,
    Object.keys(currentOpenAI).length,
    'frontier, balanced, and economy must resolve to three distinct canonical models',
  );
  for (const { modelKey } of Object.values(currentOpenAI)) {
    const curated = curation.models[modelKey];
    assert.ok(curated, `${modelKey} must resolve in canonical curation`);
    assert.equal(
      registry.models[modelKey].identity.providerModelId,
      curated.apiModelId ?? curated.id ?? modelKey,
    );
    assert.equal(registry.models[modelKey].lifecycle.availability, 'live');
    assert.equal(registry.models[modelKey].lifecycle.unavailableReason, undefined);
    assert.equal(registry.routes[`openai/${modelKey}`].selectable, true);
    assert.equal(registry.limits[modelKey].contextTokens, curated.contextOverride);
    assert.equal(registry.limits[modelKey].maxInputTokens, curated.maxInputTokens);
    assert.equal(registry.limits[modelKey].maxOutputTokens, curated.maxOutputTokens);
    assert.equal(registry.limits[modelKey].knowledgeCutoff, curated.knowledgeCutoff);
    assert.equal(registry.capabilities[modelKey].textInput, true);
    assert.equal(registry.capabilities[modelKey].imageInput, true);
    assert.equal(registry.capabilities[modelKey].textOutput, true);
    assert.deepEqual(compatibility.models[modelKey].imageInput, curated.imageInput);
    assert.equal(registry.pricing[modelKey].inputPerMillion, curated.costOverride.inputCost);
    assert.equal(registry.pricing[modelKey].cacheReadPerMillion, curated.costOverride.cached_input);
    assert.equal(
      registry.pricing[modelKey].cacheWritePerMillion,
      curated.costOverride.cached_write,
    );
    assert.equal(registry.pricing[modelKey].outputPerMillion, curated.costOverride.outputCost);
    assert.equal(compatibility.models[modelKey].longContext, undefined);
    assert.deepEqual(
      compatibility.models[modelKey].inputTokenPricingTiers,
      curated.inputTokenPricingTiers,
    );
    assert.equal(registry.pricing[modelKey].longContext, undefined);
    assert.deepEqual(
      registry.pricing[modelKey].inputTokenPricingTiers,
      curated.inputTokenPricingTiers.map((tier) => ({
        thresholdTokens: tier.thresholdTokens,
        inputPerMillion: tier.inputCost,
        cacheReadPerMillion: tier.cached_input,
        cacheWritePerMillion: tier.cached_write,
        outputPerMillion: tier.outputCost,
      })),
    );
  }

  assert.equal(
    registry.harnesses['openai/responses'].features.webSearch.implementation,
    'implemented',
    'native search must stay unavailable until the AGI harness is implemented',
  );
  for (const modelKey of currentOpenAIKeys) {
    assert.equal(compatibility.models[modelKey].capabilities.search, true);
  }
});

test('publishes the current Anthropic roster with canonical API IDs, limits, and prompt-cache rates', () => {
  for (const [modelKey, expected] of Object.entries(currentAnthropic)) {
    assert.equal(
      registry.models[modelKey].identity.providerModelId,
      compatibility.models[modelKey].apiModelId,
    );
    assert.equal(registry.models[modelKey].lifecycle.availability, 'live');
    assert.equal(registry.routes[`anthropic/${modelKey}`].selectable, true);
    assert.equal(registry.limits[modelKey].contextTokens, expected.context);
    assert.equal(registry.limits[modelKey].maxOutputTokens, expected.maxOutput);
    assert.equal(registry.capabilities[modelKey].textInput, true);
    assert.equal(registry.capabilities[modelKey].imageInput, true);
    assert.equal(registry.capabilities[modelKey].textOutput, true);
    assert.equal(registry.pricing[modelKey].inputPerMillion, expected.input);
    assert.equal(registry.pricing[modelKey].cacheReadPerMillion, expected.cacheRead);
    assert.ok(
      expected.cacheRead > 0 && expected.cacheRead <= expected.input * 0.1,
      `${modelKey} cache reads must stay at or below a tenth of its input rate`,
    );
    assert.equal(registry.pricing[modelKey].cacheWritePerMillion, expected.cacheWrite5m);
    assert.equal(registry.pricing[modelKey].cacheWrite1hPerMillion, expected.cacheWrite1h);
    assert.equal(registry.pricing[modelKey].outputPerMillion, expected.output);
  }

  const complexReasoning = compatibility.models[anthropicComplexModelKey].reasoning;
  assert.deepEqual(complexReasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(complexReasoning.defaultEffort, 'high');
  assert.equal(complexReasoning.canDisableThinking, false);
  assert.equal(complexReasoning.request.effortPath, 'output_config.effort');

  const standardReasoning = compatibility.models[anthropicStandardModelKey].reasoning;
  assert.deepEqual(standardReasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(standardReasoning.defaultEffort, 'high');
  assert.equal(standardReasoning.canDisableThinking, true);
  assert.equal(standardReasoning.request.togglePath, 'thinking.type');

  const premium = compatibility.models[anthropicPremiumModelKey];
  assert.equal(premium.knowledgeCutoff, '2026-05');
  assert.equal(premium.released, 'July 24, 2026');
  assert.equal(premium.tierPolicy.minTier, 'max');
  assert.equal(premium.promptCacheMinimumTokens, 512);
  assert.deepEqual(premium.providerCompatibility, { nativeWebFetch: false });
  assert.deepEqual(premium.reasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(premium.reasoning.thinkingDefault, 'adaptive');
  assert.equal(premium.reasoning.supportsManualThinking, false);
  assert.equal(premium.reasoning.maxEffortWhenThinkingDisabled, 'high');
  assert.equal(premium.reasoning.rejectsSamplingParameters, true);

  assert.equal(compatibility.models[anthropicStandardModelKey].promo_expires_at, undefined);
  assert.equal(compatibility.models[anthropicStandardModelKey].post_promo_prices, undefined);
});

test('publishes date-invariant prices, no shipped model carries a pricing schedule', () => {
  const scheduled = Object.entries(registry.pricing)
    .filter(([, pricing]) => pricing.schedule !== undefined)
    .map(([modelKey]) => modelKey);
  assert.deepEqual(
    scheduled,
    [],
    'a shipped pricing schedule is a product price change and needs an explicit founder decision',
  );

  const standard = registry.pricing[anthropicStandardModelKey];
  assert.equal(standard.inputPerMillion, 2);
  assert.equal(standard.outputPerMillion, 10);
  assert.equal(standard.cacheReadPerMillion, 0.2);
  assert.equal(standard.cacheWritePerMillion, 2.5);
  assert.equal(standard.cacheWrite1hPerMillion, 4);
});

test('records only verified openness metadata and leaves the rest unknown', () => {
  const openness = (modelKey) => {
    const { openWeight, license, commercialRestrictions } = registry.models[modelKey].identity;
    return { openWeight, license, commercialRestrictions };
  };

  const authoredOpenness = (modelKey) => {
    const { openWeight, license, commercialRestrictions } = curation.models[modelKey];
    return { openWeight, license, commercialRestrictions };
  };

  for (const modelKey of registry.providerModelKeys.deepseek) {
    assert.deepEqual(openness(modelKey), {
      openWeight: true,
      license: 'MIT',
      commercialRestrictions: undefined,
    });
  }

  const openWeightProviders = ['deepseek', 'zhipu', 'moonshot', 'minimax'];
  for (const providerId of openWeightProviders) {
    for (const modelKey of registry.providerModelKeys[providerId]) {
      const authored = authoredOpenness(modelKey);
      assert.equal(authored.openWeight, true, `${modelKey} must be authored as open weight`);
      assert.equal(authored.commercialRestrictions, undefined);
      assert.deepEqual(
        openness(modelKey),
        authored,
        `${modelKey} must publish exactly the openness the catalog authored, never an inferred one`,
      );
      if (authored.license !== undefined) {
        assert.equal(typeof authored.license, 'string');
        assert.ok(authored.license.length > 0, `${modelKey} license must not be empty`);
      }
    }
  }

  const proprietaryKeys = ['openai', 'anthropic', 'google', 'xai'].map(
    (providerId) => compatibility.providers[providerId].defaultModel,
  );
  for (const modelKey of proprietaryKeys) {
    assert.deepEqual(openness(modelKey), {
      openWeight: false,
      license: 'proprietary',
      commercialRestrictions: undefined,
    });
  }

  for (const modelKey of registry.providerModelKeys.qwen) {
    assert.deepEqual(openness(modelKey), {
      openWeight: undefined,
      license: undefined,
      commercialRestrictions: undefined,
    });
  }
});

test('publishes the canonical multimodal Qwen IDs and limits', () => {
  for (const modelKey of registry.providerModelKeys.qwen) {
    assert.equal(
      registry.models[modelKey].identity.providerModelId,
      compatibility.models[modelKey].apiModelId,
    );
    assert.equal(registry.limits[modelKey].contextTokens, 1_000_000);
    assert.equal(
      registry.limits[modelKey].maxOutputTokens,
      curation.models[modelKey].maxOutputTokens,
      `${modelKey} must publish the max output the catalog authored`,
    );
    assert.ok(
      registry.limits[modelKey].maxOutputTokens >= 64_000,
      `${modelKey} must not drop below the Qwen family output floor`,
    );
    assert.equal(registry.capabilities[modelKey].textInput, true);
    assert.equal(registry.capabilities[modelKey].imageInput, true);
    assert.equal(registry.capabilities[modelKey].videoInput, true);
    assert.equal(registry.capabilities[modelKey].functionCalling, true);
  }
});

test('selects the founder-approved roster and subscription bands', () => {
  assert.equal(
    compatibility.providers.openai.defaultModel,
    compatibility.providers.openai.taskRouting.complex_reasoning,
  );
  assert.equal(compatibility.providers.anthropic.defaultModel, anthropicStandardModelKey);
  const selectableRoster = new Set(Object.values(compatibility.tierAllowedModels).flat());
  for (const modelKey of currentOpenAIKeys) {
    assert.equal(selectableRoster.has(modelKey), true, `${modelKey} must remain selectable`);
  }
  for (const modelKey of Object.keys(currentAnthropic)) {
    assert.equal(selectableRoster.has(modelKey), true, `${modelKey} must remain selectable`);
  }
  const basicRoster = new Set(compatibility.tierAllowedModels.economy);
  assert.equal(basicRoster.has(currentOpenAI.economy.modelKey), true);
  assert.equal(basicRoster.has(compatibility.providers.google.defaultModel), true);
  assert.equal(basicRoster.has(currentOpenAI.balanced.modelKey), false);
  const anthropicModelKeys = new Set(registry.providerModelKeys.anthropic);
  assert.equal(
    [...basicRoster].some((modelKey) => anthropicModelKeys.has(modelKey)),
    false,
    'economy has no Anthropic slot',
  );
  for (const modelKey of registry.providerModelKeys.perplexity) {
    assert.equal(basicRoster.has(modelKey), false);
    assert.equal(compatibility.tierAllowedModels.pro_additions.includes(modelKey), false);
    assert.equal(selectableRoster.has(modelKey), false);
  }

  for (const modelKey of registry.providerModelKeys.minimax) {
    const minTier = compatibility.models[modelKey].tierPolicy?.minTier;
    assert.equal(minTier, 'pro', `${modelKey} tierPolicy.minTier must match its roster band`);
    assert.equal(compatibility.tierAllowedModels.pro_additions.includes(modelKey), true);
    assert.equal(basicRoster.has(modelKey), false);
    assert.equal(selectableRoster.has(modelKey), true);
  }

  const openAIRoutes = Object.values(compatibility.providers.openai.taskRouting);
  assert.equal(
    openAIRoutes.every((modelKey) => currentOpenAIKeys.has(modelKey)),
    true,
  );
  const openAITextModels = Object.values(compatibility.models)
    .filter((model) => model.modelType === 'chat' || model.modelType === 'reasoning')
    .filter((model) => model.provider === 'openai')
    .map((model) => model.id);
  const openAIOwned = new Set([compatibility.providers.openai.defaultModel, ...openAIRoutes]);
  for (const modelKey of openAIOwned) {
    assert.equal(
      openAITextModels.includes(modelKey),
      true,
      `${modelKey} is routed but absent from the OpenAI text roster`,
    );
  }
  for (const modelKey of openAITextModels) {
    assert.equal(
      openAIOwned.has(modelKey) || selectableRoster.has(modelKey),
      true,
      `${modelKey} is an orphan: no provider route reaches it and no tier band offers it`,
    );
  }
  const openAICanonicalizationTargets = Object.values(
    compatibility.providers.openai.canonicalization,
  );
  assert.equal(
    openAICanonicalizationTargets.every((modelKey) => currentOpenAIKeys.has(modelKey)),
    true,
    'OpenAI aliases may target only the current three-model reasoning roster',
  );
  const anthropicRoutes = Object.values(compatibility.providers.anthropic.taskRouting);
  assert.equal(
    anthropicRoutes.every((modelKey) => Object.hasOwn(currentAnthropic, modelKey)),
    true,
  );

  const slotModels = Object.values(registry.policies.auto.slots).map(({ modelKey }) => modelKey);
  for (const retiredModelKey of retiredModels.retiredModelIds) {
    assert.equal(slotModels.includes(retiredModelKey), false);
  }

  const freeCodingModel = registry.policies.auto.slots.coding_fast.modelKey;
  assert.equal(basicRoster.has(freeCodingModel), true);
  assert.equal(compatibility.models[freeCodingModel].tierPolicy.minTier, 'free');
  assert.equal(compatibility.models[freeCodingModel].capabilities.tools, true);
  assert.equal(compatibility.models[freeCodingModel].capabilities.codeExecution, true);

  const addressableFormerPicker = registry.providerModelKeys.perplexity.find(
    (modelKey) => registry.models[modelKey] && !selectableRoster.has(modelKey),
  );
  assert.ok(
    addressableFormerPicker,
    'a still-served model may remain addressable even after leaving current-generation pickers',
  );
  for (const retiredModelKey of retiredModels.retiredModelIds) {
    assert.equal(registry.models[retiredModelKey], undefined);
  }
});
