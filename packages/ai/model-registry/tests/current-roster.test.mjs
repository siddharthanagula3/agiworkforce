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
const compatibility = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'packages', 'contracts', 'types', 'src', 'models.json'),
    'utf8',
  ),
);

const currentOpenAI = {
  'gpt-5.6-sol': {
    input: 5,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    output: 30,
  },
  'gpt-5.6-terra': {
    input: 2.5,
    cacheRead: 0.25,
    cacheWrite: 3.125,
    output: 15,
  },
  'gpt-5.6-luna': {
    input: 1,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    output: 6,
  },
};

const currentAnthropic = {
  'claude-fable-5': {
    providerModelId: 'claude-fable-5',
    input: 10,
    cacheRead: 1,
    cacheWrite5m: 12.5,
    cacheWrite1h: 20,
    output: 50,
    context: 1_000_000,
    maxOutput: 128_000,
  },
  'claude-opus-4.8': {
    providerModelId: 'claude-opus-4-8',
    input: 5,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    output: 25,
    context: 1_000_000,
    maxOutput: 128_000,
  },
  'claude-sonnet-5': {
    providerModelId: 'claude-sonnet-5',
    input: 3,
    cacheRead: 0.3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    output: 15,
    context: 1_000_000,
    maxOutput: 128_000,
  },
  'claude-haiku-4.5': {
    providerModelId: 'claude-haiku-4-5',
    input: 1,
    cacheRead: 0.1,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2,
    output: 5,
    context: 200_000,
    maxOutput: 64_000,
  },
};

test('publishes the GA GPT-5.6 API family with its implemented Responses search harness', () => {
  for (const [modelKey, expected] of Object.entries(currentOpenAI)) {
    assert.equal(registry.models[modelKey].identity.providerModelId, modelKey);
    assert.equal(registry.models[modelKey].lifecycle.availability, 'live');
    assert.equal(registry.models[modelKey].lifecycle.unavailableReason, undefined);
    assert.equal(registry.routes[`openai/${modelKey}`].selectable, true);
    assert.equal(registry.limits[modelKey].contextTokens, 1_050_000);
    assert.equal(registry.limits[modelKey].maxInputTokens, 922_000);
    assert.equal(registry.limits[modelKey].maxOutputTokens, 128_000);
    assert.equal(registry.limits[modelKey].knowledgeCutoff, '2026-02-16');
    assert.equal(registry.capabilities[modelKey].textInput, true);
    assert.equal(registry.capabilities[modelKey].imageInput, true);
    assert.equal(registry.capabilities[modelKey].textOutput, true);
    assert.equal(registry.pricing[modelKey].inputPerMillion, expected.input);
    assert.equal(registry.pricing[modelKey].cacheReadPerMillion, expected.cacheRead);
    assert.equal(registry.pricing[modelKey].cacheWritePerMillion, expected.cacheWrite);
    assert.equal(registry.pricing[modelKey].outputPerMillion, expected.output);
  }

  assert.equal(
    registry.harnesses['openai/responses'].features.webSearch.implementation,
    'implemented',
    'native search must stay unavailable until the AGI harness is implemented',
  );
  for (const modelKey of Object.keys(currentOpenAI)) {
    assert.equal(compatibility.models[modelKey].capabilities.search, true);
  }
});

test('publishes the current Claude roster with exact API IDs, limits, and prompt-cache rates', () => {
  for (const [modelKey, expected] of Object.entries(currentAnthropic)) {
    assert.equal(registry.models[modelKey].identity.providerModelId, expected.providerModelId);
    assert.equal(registry.models[modelKey].lifecycle.availability, 'live');
    assert.equal(registry.routes[`anthropic/${modelKey}`].selectable, true);
    assert.equal(registry.limits[modelKey].contextTokens, expected.context);
    assert.equal(registry.limits[modelKey].maxOutputTokens, expected.maxOutput);
    assert.equal(registry.capabilities[modelKey].textInput, true);
    assert.equal(registry.capabilities[modelKey].imageInput, true);
    assert.equal(registry.capabilities[modelKey].textOutput, true);
    assert.equal(registry.pricing[modelKey].inputPerMillion, expected.input);
    assert.equal(registry.pricing[modelKey].cacheReadPerMillion, expected.cacheRead);
    assert.equal(registry.pricing[modelKey].cacheWritePerMillion, expected.cacheWrite5m);
    assert.equal(registry.pricing[modelKey].cacheWrite1hPerMillion, expected.cacheWrite1h);
    assert.equal(registry.pricing[modelKey].outputPerMillion, expected.output);
  }

  const fableReasoning = compatibility.models['claude-fable-5'].reasoning;
  assert.deepEqual(fableReasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(fableReasoning.defaultEffort, 'high');
  assert.equal(fableReasoning.canDisableThinking, false);
  assert.equal(fableReasoning.request.effortPath, 'output_config.effort');

  const sonnetReasoning = compatibility.models['claude-sonnet-5'].reasoning;
  assert.deepEqual(sonnetReasoning.supportedEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(sonnetReasoning.defaultEffort, 'high');
  assert.equal(sonnetReasoning.canDisableThinking, true);
  assert.equal(sonnetReasoning.request.togglePath, 'thinking.type');

  assert.equal(compatibility.models['claude-sonnet-5'].promo_expires_at, undefined);
  assert.equal(compatibility.models['claude-sonnet-5'].post_promo_prices, undefined);
});

test('publishes exact multimodal Qwen replacement IDs and limits', () => {
  for (const [modelKey, providerModelId] of [
    ['qwen-3.7-plus', 'qwen3.7-plus'],
    ['qwen-3.5-flash', 'qwen3.5-flash'],
  ]) {
    assert.equal(registry.models[modelKey].identity.providerModelId, providerModelId);
    assert.equal(registry.limits[modelKey].contextTokens, 1_000_000);
    assert.equal(registry.limits[modelKey].maxOutputTokens, 64_000);
    assert.equal(registry.capabilities[modelKey].textInput, true);
    assert.equal(registry.capabilities[modelKey].imageInput, true);
    assert.equal(registry.capabilities[modelKey].videoInput, true);
    assert.equal(registry.capabilities[modelKey].functionCalling, true);
  }
});

test('selects only the founder-approved current-generation roster', () => {
  assert.equal(compatibility.providers.openai.defaultModel, 'gpt-5.6-sol');
  assert.equal(compatibility.providers.anthropic.defaultModel, 'claude-sonnet-5');
  const selectableRoster = new Set(Object.values(compatibility.tierAllowedModels).flat());
  for (const modelKey of Object.keys(currentOpenAI)) {
    assert.equal(selectableRoster.has(modelKey), true, `${modelKey} must remain selectable`);
  }
  for (const modelKey of Object.keys(currentAnthropic)) {
    assert.equal(selectableRoster.has(modelKey), true, `${modelKey} must remain selectable`);
  }
  const basicRoster = new Set(compatibility.tierAllowedModels.economy);
  assert.equal(basicRoster.has('gpt-5.6-luna'), true);
  assert.equal(basicRoster.has('gpt-5.6-terra'), false);
  assert.equal(basicRoster.has('claude-haiku-4.5'), false);
  assert.equal(compatibility.tierAllowedModels.pro_additions.includes('claude-haiku-4.5'), true);
  assert.equal(selectableRoster.has('sonar-pro'), false);

  const openAIRoutes = Object.values(compatibility.providers.openai.taskRouting);
  assert.equal(
    openAIRoutes.every((modelKey) => Object.hasOwn(currentOpenAI, modelKey)),
    true,
  );
  const anthropicRoutes = Object.values(compatibility.providers.anthropic.taskRouting);
  assert.equal(
    anthropicRoutes.every((modelKey) => Object.hasOwn(currentAnthropic, modelKey)),
    true,
  );

  const slotModels = Object.values(registry.policies.auto.slots).map(({ modelKey }) => modelKey);
  assert.equal(slotModels.includes('gpt-5.5'), false);
  assert.equal(slotModels.includes('gpt-5.4-mini'), false);
  assert.equal(slotModels.includes('claude-sonnet-4.6'), false);

  assert.ok(
    registry.models['sonar-pro'],
    'a still-served model may remain addressable even after leaving current-generation pickers',
  );
  assert.equal(registry.models['gpt-5.5'], undefined);
  assert.equal(registry.models['claude-sonnet-4.6'], undefined);
  assert.equal(registry.models['kimi-k2.6'], undefined);
  assert.equal(registry.models['qwen-3.5-plus'], undefined);
});
