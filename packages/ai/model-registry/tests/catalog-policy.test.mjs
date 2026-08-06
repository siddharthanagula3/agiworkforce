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
const registry = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, 'generated', 'registry.json'), 'utf8'),
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

/**
 * The founder pin above covers the OLD discount mechanism
 * (`promo_expires_at`/`post_promo_prices`). This covers the NEW one: a
 * `pricingSchedule` window can move any rate on a date, so a discount can be
 * reintroduced through it without touching `costOverride` at all — which is
 * exactly how the 2026-08-05 intro window slipped past the pin above.
 *
 * Decision #22 (docs/decisions/CURRENT_DECISIONS.md, reaffirmed 2026-08-05):
 * Claude Sonnet 5 bills users the founder-selected standard rates on EVERY
 * date. A provider's introductory window is a provider-cost fact recorded in
 * verificationLog, never a product price. The schedule MECHANISM stays for
 * future real product price changes, so this asserts "no sub-standard window",
 * not "no schedule".
 */
const SONNET_5_STANDARD_RATES = {
  inputCost: 3,
  outputCost: 15,
  cached_input: 0.3,
  cached_write: 3.75,
  cached_write_1h: 6,
};

test('never prices Sonnet 5 below the founder-selected standard rates on any date', () => {
  const model = curation.models['claude-sonnet-5'];
  const decision =
    'Decision #22 (docs/decisions/CURRENT_DECISIONS.md, reaffirmed 2026-08-05): Sonnet 5 bills ' +
    'users the founder-selected standard $3/$15 per MTok (cache read $0.30, 5m write $3.75, 1h ' +
    "write $6.00) on EVERY date. A provider's introductory window is a provider-cost fact for " +
    'verificationLog, not a product price. Record it there and leave the billed rates alone.';

  // The top-level rates ARE the standard price, so the schedule is compared
  // against costOverride rather than against a second hardcoded copy.
  assert.deepEqual(
    model.costOverride,
    SONNET_5_STANDARD_RATES,
    `claude-sonnet-5 costOverride must stay the standard rates. ${decision}`,
  );

  const schedule = model.pricingSchedule;
  if (schedule === undefined) return; // No schedule at all is the current, expected state.

  assert.ok(
    Array.isArray(schedule),
    `claude-sonnet-5 pricingSchedule must be an array. ${decision}`,
  );
  for (const [index, window] of schedule.entries()) {
    for (const [field, standard] of Object.entries(SONNET_5_STANDARD_RATES)) {
      const scheduled = window[field];
      if (scheduled === undefined) continue; // Omitted => inherits the standard rate.
      assert.ok(
        scheduled >= standard,
        `claude-sonnet-5 pricingSchedule[${index}].${field} = ${scheduled} is BELOW the standard ` +
          `${standard}. ${decision}`,
      );
    }
  }
});

test('publishes the standard Sonnet 5 rates in the compiled registry on any date', () => {
  const decision =
    'Decision #22 (docs/decisions/CURRENT_DECISIONS.md, reaffirmed 2026-08-05): Sonnet 5 bills ' +
    'users the founder-selected standard rates on EVERY date.';
  const pricing = registry.pricing['claude-sonnet-5'];
  const compiledStandard = {
    inputPerMillion: SONNET_5_STANDARD_RATES.inputCost,
    outputPerMillion: SONNET_5_STANDARD_RATES.outputCost,
    cacheReadPerMillion: SONNET_5_STANDARD_RATES.cached_input,
    cacheWritePerMillion: SONNET_5_STANDARD_RATES.cached_write,
    cacheWrite1hPerMillion: SONNET_5_STANDARD_RATES.cached_write_1h,
  };

  for (const [field, standard] of Object.entries(compiledStandard)) {
    assert.equal(pricing[field], standard, `compiled claude-sonnet-5 ${field}. ${decision}`);
  }

  // Same rule as the curation pin, applied to what actually ships: a compiled
  // window may never price below the standard rate.
  for (const [index, window] of (pricing.schedule ?? []).entries()) {
    for (const [field, standard] of Object.entries(compiledStandard)) {
      const scheduled = window[field];
      if (scheduled === undefined) continue;
      assert.ok(
        scheduled >= standard,
        `compiled claude-sonnet-5 schedule[${index}].${field} = ${scheduled} is BELOW the ` +
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
