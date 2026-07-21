import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..', '..');
const REGISTRY_JSON = path.join(PACKAGE_ROOT, 'generated', 'registry.json');
const REGISTRY_TS = path.join(PACKAGE_ROOT, 'generated', 'registry.ts');
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
  assert.equal(registry.schemaVersion, 1);

  const key = 'gpt-5.6-luna';
  assert.equal(registry.models[key].identity.provider, 'openai');
  assert.equal(registry.models[key].identity.providerModelId, key);
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
  assert.equal(registry.pricing[key].inputPerMillion, 1);
  assert.equal(registry.pricing[key].cacheReadPerMillion, 0.1);
  assert.equal(registry.limits[key].contextTokens, 1050000);
  assert.equal(registry.limits[key].maxOutputTokens, 128000);
  assert.equal(registry.capabilities[key].imageInput, true);
  assert.equal('webSearch' in registry.capabilities[key], false);

  assert.equal(registry.capabilities['gpt-image-2'].imageOutput, true);
  assert.equal(registry.capabilities['gpt-image-2'].textOutput, false);
  assert.equal(registry.capabilities['veo-3.1'].videoOutput, true);
  assert.equal(registry.capabilities['gpt-4o-transcribe'].audioInput, true);
  assert.equal(registry.capabilities['gpt-4o-transcribe'].textOutput, true);
  assert.equal(registry.capabilities['tts-1'].textInput, true);
  assert.equal(registry.capabilities['tts-1'].audioOutput, true);

  const route = registry.routes['openai/gpt-5.6-luna'];
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
  assert.equal(registry.policies.auto.defaultAlias, 'auto-balanced');
  assert.equal(registry.policies.auto.aliases.auto.profile, 'balanced');
  assert.equal(registry.policies.auto.aliases['auto-economy'].profile, 'economy');
  assert.deepEqual(registry.policies.auto.tierAllowedSlots.free, ['workhorse_general']);
  assert.ok(registry.policies.auto.providerPolicies.usOnly.excludedProviders.includes('moonshot'));
  assert.deepEqual(registry.policies.auto.providerPolicies.usOnly.allowedTiers, [
    'max',
    'enterprise',
  ]);
  assert.equal(
    registry.policies.auto.tasks.image_generation.requiredCapabilities[0],
    'imageOutput',
  );
  assert.equal(registry.policies.auto.slots.image_generation.modelKey, 'gemini-3.1-flash-image');
  assert.equal(registry.policies.auto.slots.flagship_coding.modelKey, 'claude-opus-4.8');
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
  assert.equal(registry.runtimeProfiles['desktop/cloud-chat'].status, 'unwired');
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
    ['auto-economy', 'auto-balanced', 'auto-premium'],
    'managed-cloud picker profiles come from routing policy independently of model metadata',
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
