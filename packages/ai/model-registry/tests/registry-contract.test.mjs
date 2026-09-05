import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..', '..');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');
const REGISTRY_TS = path.join(PACKAGE_ROOT, 'generated', 'registry.ts');
const ROUTING_POLICIES = path.join(PACKAGE_ROOT, 'catalog', 'routing-policies.json');
const COMPATIBILITY_CATALOG = path.join(
  REPO_ROOT,
  'packages',
  'contracts',
  'types',
  'src',
  'models.json',
);
const RUST_JSON = path.join(
  REPO_ROOT,
  'crates',
  'agiworkforce-protocol',
  'src',
  'generated',
  'model_registry.json',
);
const RUST_MODULE = path.join(
  REPO_ROOT,
  'crates',
  'agiworkforce-protocol',
  'src',
  'generated',
  'model_registry.rs',
);

test('emits separated registry records and cross-language artifacts', () => {
  assert.ok(fs.existsSync(REGISTRY_JSON), 'normalized registry.json must be generated');
  assert.ok(fs.existsSync(REGISTRY_TS), 'TypeScript registry module must be generated');
  assert.ok(fs.existsSync(RUST_JSON), 'Rust registry JSON must be generated');
  assert.ok(fs.existsSync(RUST_MODULE), 'Rust registry module must be generated');

  const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(COMPATIBILITY_CATALOG, 'utf8'));
  const authoredRoutingPolicies = JSON.parse(fs.readFileSync(ROUTING_POLICIES, 'utf8'));
  assert.equal(registry.schemaVersion, 1);

  const key = catalog.providers.openai.taskRouting.fast_completion;
  const compatibilityModel = catalog.models[key];
  assert.equal(registry.models[key].identity.provider, 'openai');
  assert.equal(
    registry.models[key].identity.providerModelId,
    compatibilityModel.apiModelId ?? compatibilityModel.id,
  );
  assert.equal(registry.models[key].lifecycle.availability, 'live');
  assert.ok(
    registry.providerModelKeys.openai.includes(key),
    'provider indexes must be generated from canonical model identities',
  );
  const indexedModelKeys = Object.values(registry.providerModelKeys).flat();
  assert.equal(
    indexedModelKeys.length,
    new Set(indexedModelKeys).size,
    'a canonical model must belong to exactly one provider index',
  );
  assert.deepEqual(
    [...indexedModelKeys].sort(),
    Object.keys(registry.models).sort(),
    'provider indexes must cover every canonical model exactly once',
  );
  for (const [provider, modelKeys] of Object.entries(registry.providerModelKeys)) {
    for (const modelKey of modelKeys) {
      assert.equal(
        registry.models[modelKey].identity.provider,
        provider,
        `${modelKey} must be indexed under its canonical provider`,
      );
    }
  }
  const providerTaskSlots = Object.entries(authoredRoutingPolicies.auto.slots).filter(
    ([, slot]) => slot.providerTask,
  );
  assert.ok(providerTaskSlots.length > 0, 'provider-owned routing slots must be exercised');
  for (const [slotId, slot] of providerTaskSlots) {
    const { provider, task } = slot.providerTask;
    assert.equal(
      registry.policies.auto.slots[slotId].modelKey,
      catalog.providers[provider].taskRouting[task],
      `${slotId} must follow the canonical ${provider}.${task} route`,
    );
  }
  assert.equal(registry.pricing[key].inputPerMillion, compatibilityModel.inputCost);
  assert.equal(registry.pricing[key].cacheReadPerMillion, compatibilityModel.cached_input);
  assert.equal(registry.pricing[key].cacheWritePerMillion, compatibilityModel.cached_write);
  assert.equal(registry.limits[key].contextTokens, compatibilityModel.contextWindow);
  assert.equal(registry.limits[key].maxOutputTokens, compatibilityModel.maxOutputTokens);
  assert.equal(registry.capabilities[key].imageInput, true);
  assert.equal(registry.capabilityClasses.intrinsic.includes('webSearch'), false);
  assert.equal(registry.capabilityClasses.routeDependent.includes('webSearch'), true);
  assert.deepEqual(
    Object.keys(registry.capabilities[key]).sort(),
    [...registry.capabilityClasses.intrinsic, ...registry.capabilityClasses.routeDependent].sort(),
    'every model must carry the whole capability vocabulary',
  );

  const imageModelKey = registry.policies.auto.slots.image_generation.modelKey;
  const videoModelKey = registry.policies.auto.slots.video_generation.modelKey;
  const transcriptionModelKey = registry.policies.auto.slots.voice_transcription.modelKey;
  const speechModelKey = registry.providerModelKeys.openai.find(
    (modelKey) => registry.capabilities[modelKey].audioOutput,
  );
  assert.ok(speechModelKey, 'the OpenAI speech route must exist');
  assert.equal(registry.capabilities[imageModelKey].imageOutput, true);
  assert.equal(registry.capabilities[imageModelKey].textOutput, false);
  assert.equal(registry.capabilities[videoModelKey].videoOutput, true);
  assert.equal(registry.capabilities[transcriptionModelKey].audioInput, true);
  assert.equal(registry.capabilities[transcriptionModelKey].textOutput, true);
  assert.equal(registry.capabilities[speechModelKey].textInput, true);
  assert.equal(registry.capabilities[speechModelKey].audioOutput, true);

  const route = registry.routes[`openai/${key}`];
  assert.equal(route.modelKey, key);
  assert.equal(route.harnessId, 'openai/responses');
  assert.equal(registry.harnesses['openai/responses'].features.webSearch.providerSupport, 'native');
  assert.equal(
    registry.harnesses['openai/responses'].features.webSearch.implementation,
    'implemented',
  );
  assert.deepEqual(registry.harnesses['openai/responses'].features.webSearchInjection, {
    providerSupport: 'native',
    implementation: 'implemented',
  });
  for (const feature of [
    'toolDiscovery',
    'fileSearch',
    'hostedShell',
    'applyPatch',
    'skills',
    'computerUse',
  ]) {
    assert.deepEqual(registry.harnesses['openai/responses'].features[feature], {
      providerSupport: 'native',
      implementation: 'unwired',
    });
  }
  assert.deepEqual(
    registry.harnesses['anthropic/messages'].features.webSearch,
    { providerSupport: 'native', implementation: 'implemented' },
    'Anthropic native search execution must be registry-owned',
  );
  assert.deepEqual(
    registry.harnesses['anthropic/messages'].features.webSearchInjection,
    { providerSupport: 'native', implementation: 'implemented' },
    'Anthropic route injection must be distinct from general search support',
  );
  assert.deepEqual(
    registry.harnesses['google/generate-content'].features.webSearchInjection,
    { providerSupport: 'native', implementation: 'implemented' },
    'Google route injection must be registry-owned',
  );
  assert.deepEqual(
    registry.harnesses['perplexity/chat-completions'].features.webSearch,
    { providerSupport: 'native', implementation: 'implemented' },
    'Perplexity native search must not require tool injection',
  );
  assert.equal(
    registry.harnesses['perplexity/chat-completions'].features.webSearchInjection,
    undefined,
  );
  assert.deepEqual(
    registry.harnesses['managed-cloud/gateway'].features.webSearch,
    { providerSupport: 'agi', implementation: 'implemented' },
    'managed-cloud resolution support must be registry-owned',
  );
  assert.deepEqual(registry.harnesses['ollama/chat'].trustModes, ['local']);
  assert.equal(registry.harnesses['ollama/chat'].adapter, '@agiworkforce/providers-ollama');

  assert.equal(registry.models.auto, undefined, 'Auto must be a policy, never a model');
  assert.equal(registry.policies.auto.defaultAlias, 'auto');
  assert.equal(registry.policies.auto.aliases.auto.profile, 'balanced');
  assert.equal(registry.policies.auto.aliases['auto-economy'].profile, 'economy');
  assert.deepEqual(registry.policies.auto.tierAllowedSlots.free, [
    'free_workhorse',
    'free_workhorse_fast',
    'workhorse_general',
    'reasoning_economy',
    'coding_fast',
  ]);
  for (const tier of Object.keys(registry.policies.auto.tierAllowedSlots)) {
    if (tier === 'free') continue;
    assert.deepEqual(
      registry.policies.auto.tierAllowedSlots[tier].filter((slotId) => slotId.startsWith('free_')),
      [],
      `${tier} must not admit a free-lane slot`,
    );
  }
  assert.ok(registry.policies.auto.providerPolicies.usOnly.excludedProviders.includes('moonshot'));
  assert.deepEqual(registry.policies.auto.providerPolicies.usOnly.allowedTiers, [
    'max',
    'enterprise',
  ]);
  assert.equal(
    registry.policies.auto.tasks.image_generation.requiredCapabilities[0],
    'imageOutput',
  );
  assert.equal(registry.policies.auto.slots.image_generation.modelKey, imageModelKey);
  const flagshipCodingModelKey = registry.policies.auto.slots.flagship_coding.modelKey;
  assert.equal(registry.models[flagshipCodingModelKey].identity.provider, 'anthropic');
  assert.equal(catalog.models[flagshipCodingModelKey].tierPolicy.minTier, 'max');
  for (const [slotId, slot] of Object.entries(registry.policies.auto.slots)) {
    assert.ok(slot.label?.trim(), `${slotId} must expose a generated presentation label`);
    assert.ok(
      slot.description?.trim(),
      `${slotId} must expose a generated model-agnostic description`,
    );
    assert.doesNotMatch(
      slot.description,
      new RegExp(slot.modelKey.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'iu'),
      `${slotId} presentation must not go stale when its model assignment changes`,
    );
  }
  assert.equal(registry.policies.auto.continuity.preferCurrentRouteForCache, true);
  assert.deepEqual(
    registry.runtimeProfiles['cli/byok-chat'].allowedHarnessIds,
    registry.runtimeProfiles['desktop/byok-chat'].allowedHarnessIds,
    'CLI and Desktop BYOK chat must consume one generated developer-harness admission set',
  );
  assert.equal(registry.runtimeProfiles['cli/byok-chat'].status, 'implemented');
  assert.equal(registry.runtimeProfiles['desktop/cloud-chat'].status, 'implemented');
  assert.equal(
    registry.runtimeProfiles['web/cloud-chat'].features.toolDiscovery.implementation,
    'implemented',
    'Managed Web loads operator MCP and per-user connector tools into the platform tool loop',
  );
  assert.equal(
    registry.runtimeProfiles['desktop/cloud-chat'].features.webSearch.implementation,
    'implemented',
    'Desktop Cloud forwards managed search through the shared cloud endpoint',
  );
  assert.ok(
    registry.runtimeProfiles['desktop/cloud-chat'].allowedHarnessIds.includes('openai/media'),
    'Desktop Cloud consumes generated media/files from the shared cloud endpoint',
  );
  assert.equal(registry.runtimeProfiles['mobile/local-chat'].trustMode, 'on_device');
  assert.equal(
    registry.runtimeProfiles['mobile/cloud-chat'].features.imageGeneration.implementation,
    'implemented',
    'Mobile Cloud ships the managed image endpoint and must admit it honestly',
  );
  assert.equal(
    registry.runtimeProfiles['mobile/cloud-chat'].features.webSearch.implementation,
    'implemented',
    'Mobile Cloud sends server-side search requests and consumes streamed search results',
  );
  assert.ok(
    registry.runtimeProfiles['mobile/cloud-chat'].allowedHarnessIds.includes('openai/media'),
    'Mobile Cloud must admit registry-selected media routes instead of app-local model logic',
  );
  assert.deepEqual(
    registry.runtimeProfiles['chrome/browser-task'].allowedHarnessIds,
    [],
    'Chrome browser actions must not inherit provider execution merely because chat is managed',
  );
  assert.equal(
    registry.runtimeProfiles['chrome/managed-chat'].trustMode,
    'managed_cloud',
    'Chrome inference is Managed Cloud only',
  );
  assert.equal(registry.runtimeProfiles['chrome/managed-chat'].status, 'implemented');
  assert.ok(
    registry.runtimeProfiles['chrome/managed-chat'].allowedHarnessIds.length > 0,
    'Chrome Managed chat must admit registry-owned managed text routes',
  );
  assert.equal(
    registry.runtimeProfiles['chrome/managed-chat'].features.webSearch.implementation,
    'implemented',
    'Chrome uses the shared Managed Cloud route that implements web search',
  );
  assert.ok(Array.isArray(registry.evidence));
  assert.ok(registry.evidence.length > 0);

  assert.deepEqual(
    JSON.parse(fs.readFileSync(RUST_JSON, 'utf8')),
    registry,
    'TypeScript and Rust JSON artifacts must be identical',
  );
  assert.match(fs.readFileSync(REGISTRY_TS, 'utf8'), /export type ModelKey = keyof/u);
  assert.match(fs.readFileSync(REGISTRY_TS, 'utf8'), /export type ProviderId = keyof/u);
  assert.match(fs.readFileSync(REGISTRY_TS, 'utf8'), /export type HarnessId = keyof/u);
  assert.match(fs.readFileSync(RUST_MODULE, 'utf8'), /include_str!\("model_registry\.json"\)/u);
});

test('keeps Auto routing profiles out of the compatibility model identity map', () => {
  const catalog = JSON.parse(fs.readFileSync(COMPATIBILITY_CATALOG, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(REGISTRY_JSON, 'utf8'));
  const autoProfileIds = ['auto', 'auto-economy', 'auto-balanced', 'auto-premium'];

  for (const profileId of autoProfileIds) {
    assert.equal(
      catalog.models[profileId],
      undefined,
      `${profileId} is a routing profile, not a provider model`,
    );
  }

  assert.equal(
    Object.hasOwn(catalog, 'modelPresets'),
    false,
    'compatibility output must not carry a second hand-maintained picker roster',
  );
  assert.deepEqual(
    Object.entries(registry.policies.auto.aliases)
      .filter(([, profile]) => profile.selectable)
      .map(([profileId]) => profileId),
    ['auto'],
    'the managed-cloud picker exposes one self-routing Auto policy independently of model metadata',
  );
});

test('keeps compatibility quality tiers inside the canonical model taxonomy', () => {
  const catalog = JSON.parse(fs.readFileSync(COMPATIBILITY_CATALOG, 'utf8'));
  const allowedQualityTiers = new Set(['fast', 'balanced', 'best']);

  for (const [modelId, model] of Object.entries(catalog.models)) {
    assert.ok(
      allowedQualityTiers.has(model.qualityTier),
      `${modelId} has invalid qualityTier ${String(model.qualityTier)}`,
    );
  }
});
