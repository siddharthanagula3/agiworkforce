import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const curation = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'models.curation.json'), 'utf8'),
);
const harnesses = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'catalog', 'harnesses.json'), 'utf8'),
);

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

const permanentlyExcludedModels = [
  'claude-sonnet-4.6',
  'ideogram-2',
  'kimi-k2.6',
  'qwen-3.5-plus',
  'stable-diffusion-xl',
];

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

test('pins the verified multimodal Qwen replacements and standard Sonnet 5 prices', () => {
  assert.deepEqual(curation.models['qwen-3.7-plus'], {
    ...curation.models['qwen-3.7-plus'],
    id: 'qwen-3.7-plus',
    apiModelId: 'qwen3.7-plus',
    provider: 'qwen',
  });
  assert.deepEqual(curation.models['qwen-3.5-flash'], {
    ...curation.models['qwen-3.5-flash'],
    id: 'qwen-3.5-flash',
    apiModelId: 'qwen3.5-flash',
    provider: 'qwen',
  });

  for (const modelKey of ['qwen-3.7-plus', 'qwen-3.5-flash']) {
    const model = curation.models[modelKey];
    assert.deepEqual(model.inputModalities, ['text', 'image', 'video']);
    assert.equal(model.contextOverride, 1_000_000);
    assert.equal(model.maxOutputTokens, 64_000);
    assert.equal(model.capabilitiesOverride.vision, true);
    assert.equal(model.capabilitiesOverride.tools, true);
    assert.equal(model.capabilitiesOverride.caching, true);
    assert.equal(model.capabilitiesOverride.search, false);
    assert.equal(model.capabilitiesOverride.codeExecution, false);
  }

  assert.deepEqual(curation.models['claude-sonnet-5'].costOverride, {
    inputCost: 3,
    outputCost: 15,
    cached_input: 0.3,
    cached_write: 3.75,
    cached_write_1h: 6,
  });
  assert.equal(curation.models['claude-sonnet-5'].promo_expires_at, undefined);
  assert.equal(curation.models['claude-sonnet-5'].post_promo_prices, undefined);
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
