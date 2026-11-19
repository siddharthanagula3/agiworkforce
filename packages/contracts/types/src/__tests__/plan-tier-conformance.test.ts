/**
 * The TypeScript half of the plan-tier conformance fixture.
 *
 * Every question about a plan tier string is answered by several independent
 * copies in TypeScript and Rust, and they disagree (plans/pl3.md D1-D13).
 * `fixtures/plan-tier-conformance.json` records what each copy answers today,
 * per spelling, so a later change that collapses copies moves one recorded row
 * at a time. The fixture is the contract; no copy is the reference, and rows a
 * question's copies answer differently carry `differs`.
 *
 * Each language owns the answers of its own copies: the `ts.` copies are
 * written here, the `cli.` copies by the tests in `apps/cli/src` and the
 * `registry.` copy by `crates/agiworkforce-model-registry/tests/plan_tier_conformance.rs`.
 * Regenerate with `AGI_UPDATE_PLAN_CONFORMANCE=1`: this suite first, then the
 * Rust suites, then this suite again, because only this one recomputes
 * `differs` over every language's answers.
 *
 * Models are named by selector, resolved from the generated catalog at run
 * time, so the fixture carries no model id.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  LEGACY_BILLING_PLAN_TIER_ALIASES,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  canUseBillingPlanCapability,
  isBillingPlanTier,
  isFreeBillingPlanTier,
  isFreeOfChargePlanTier,
  normalizeBillingPlanTier,
  type BillingPlanCapability,
} from '../billing-catalog';
import {
  PLAN_LABEL,
  canSwitchProviderInThread,
  isFreePlan,
  normalizeUIPlanTier,
  tierAtLeast,
  type UIPlanTier,
} from '../design-system/user-identity';
import {
  CHAT_MODEL_TYPES,
  canAccessAutoRoutingProfileForTier,
  canAccessManualModelSelection,
  canAccessModelForSubscriptionTier,
  getDefaultModelFor,
  getMinimumRequiredTier,
  getTierPolicy,
  modelsCatalog,
  normalizeSubscriptionAccessTier,
  type DefaultModelKind,
} from '../model-catalog';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Answers = Record<string, Json>;

interface CopyDefinition {
  language: 'typescript' | 'rust';
  scope: 'spelling' | 'model';
  question: string;
  source: string;
}

interface SpellingRow {
  kind: string;
  answers: Answers;
  differs: string[];
}

interface ModelRow {
  selection: string;
  answers: Answers;
  differs: string[];
}

interface Fixture {
  copies: Record<string, CopyDefinition>;
  orderUniverse: string[];
  modelRows: Record<string, ModelRow>;
  rows: Record<string, SpellingRow>;
}

const FIXTURE_INDENT = 2;
const UPDATE_ENV = 'AGI_UPDATE_PLAN_CONFORMANCE';
const FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/plan-tier-conformance.json', import.meta.url),
);

const TS_PREFIX = 'ts.';
const SAMPLE_SEPARATOR = '@';
const NAMED_SLOTS = ['economy', 'pro_additions', 'flagship_additions'] as const;
const DEFAULT_MODEL_KINDS: readonly DefaultModelKind[] = ['chat', 'reasoning'];
const MEDIA_CAPABILITIES: readonly BillingPlanCapability[] = [
  'image_generation',
  'video_generation',
];

const UNNAMED_SAMPLE_COUNT = 3;
const UNNAMED_SAMPLE_IDS = [
  'unnamed_routed_cheapest',
  'unnamed_routed_median',
  'unnamed_routed_dearest',
] as const;

const ADDITIONAL_SPELLINGS: readonly { spelling: string; kind: string }[] = [
  { spelling: 'pro+', kind: 'ui_alias' },
  { spelling: 'max+', kind: 'model_side_alias' },
  { spelling: 'max_plus', kind: 'model_side_alias' },
  { spelling: 'max-plus', kind: 'model_side_alias' },
  { spelling: 'max-15x', kind: 'model_side_alias' },
  { spelling: 'max15x', kind: 'model_side_alias' },
  { spelling: 'local', kind: 'local' },
  { spelling: 'FREE', kind: 'letter_case' },
  { spelling: 'Pro', kind: 'letter_case' },
  { spelling: ' pro', kind: 'whitespace' },
  { spelling: 'unknown_tier', kind: 'unknown' },
  { spelling: '', kind: 'empty' },
];

interface ModelSample {
  selection: string;
  modelId: string;
}

interface CatalogModel {
  modelType: string;
  inputCost: number;
  outputCost: number;
  tierPolicy?: { minTier?: string };
}

const catalogModels = modelsCatalog.models as unknown as Record<string, CatalogModel>;
const registryRoutes = (
  modelRegistry as unknown as {
    routes: Record<string, { modelKey: string; selectable: boolean; trustModes: string[] }>;
  }
).routes;
const MANAGED_TRUST_MODE = 'managed_cloud';

function namedModelIds(): Set<string> {
  return new Set(NAMED_SLOTS.flatMap((slot) => modelsCatalog.tierAllowedModels[slot]));
}

function codeUnitOrder(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function pickFirst(ids: readonly string[], predicate: (id: string) => boolean): string {
  const picked = ids.find(predicate);
  if (picked === undefined) throw new Error('the generated catalog has no model for a sample');
  return picked;
}

function modelSamples(): ModelSample[] {
  const economy = modelsCatalog.tierAllowedModels.economy;
  const named = namedModelIds();
  const chatTypes = new Set<string>(CHAT_MODEL_TYPES);
  const managedModelKeys = new Set(
    Object.values(registryRoutes)
      .filter((route) => route.selectable && route.trustModes.includes(MANAGED_TRUST_MODE))
      .map((route) => route.modelKey),
  );
  const unnamed = Object.keys(catalogModels)
    .filter(
      (id) =>
        !named.has(id) && chatTypes.has(catalogModels[id]!.modelType) && managedModelKeys.has(id),
    )
    .sort((left, right) => {
      const price = (id: string) => catalogModels[id]!.inputCost + catalogModels[id]!.outputCost;
      return price(left) - price(right) || codeUnitOrder(left, right);
    });
  if (unnamed.length < UNNAMED_SAMPLE_COUNT) {
    throw new Error('the generated catalog names fewer unnamed chat models than the samples need');
  }
  const unnamedPicks = [0, Math.floor(unnamed.length / 2), unnamed.length - 1].map(
    (index) => unnamed[index]!,
  );
  return [
    {
      selection: 'economy_named_free',
      modelId: pickFirst(economy, (id) => catalogModels[id]?.tierPolicy?.minTier === 'free'),
    },
    {
      selection: 'economy_named_not_free',
      modelId: pickFirst(economy, (id) => catalogModels[id]?.tierPolicy?.minTier !== 'free'),
    },
    { selection: 'pro_addition', modelId: modelsCatalog.tierAllowedModels.pro_additions[0]! },
    {
      selection: 'flagship_addition',
      modelId: modelsCatalog.tierAllowedModels.flagship_additions[0]!,
    },
    ...UNNAMED_SAMPLE_IDS.map((selection, index) => ({
      selection,
      modelId: unnamedPicks[index]!,
    })),
  ];
}

function spellingList(): { spelling: string; kind: string }[] {
  const listed = new Map<string, string>();
  for (const spelling of Object.keys(BILLING_PLAN_PRICING)) listed.set(spelling, 'canonical');
  for (const spelling of Object.keys(LEGACY_BILLING_PLAN_TIER_ALIASES)) {
    listed.set(spelling, 'legacy_alias');
  }
  const registry = modelRegistry as unknown as {
    policies: { auto: { tierAllowedSlots: Record<string, unknown> } };
  };
  for (const spelling of Object.keys(registry.policies.auto.tierAllowedSlots)) {
    if (!listed.has(spelling)) listed.set(spelling, 'routing_name');
  }
  for (const { spelling, kind } of ADDITIONAL_SPELLINGS) {
    if (!listed.has(spelling)) listed.set(spelling, kind);
  }
  return [...listed].map(([spelling, kind]) => ({ spelling, kind }));
}

const BILLING_CAPABILITIES = Object.keys(BILLING_PLAN_CAPABILITY_TIERS)
  .sort(codeUnitOrder)
  .map((capability) => capability as BillingPlanCapability);

function capabilitiesOf(plan: string): Json {
  return BILLING_CAPABILITIES.filter((capability) => canUseBillingPlanCapability(plan, capability));
}

function mediaOf(granted: Json): Json {
  return (granted as string[]).filter((capability) =>
    (MEDIA_CAPABILITIES as readonly string[]).includes(capability),
  );
}

function sameDefaultsAs(spelling: string): Json {
  const accessTiers = ['free', 'basic', 'pro', 'max', 'enterprise'];
  return DEFAULT_MODEL_KINDS.map((kind) => {
    const defaultModel = getDefaultModelFor(spelling, kind);
    return {
      kind,
      sameAs: accessTiers.filter((tier) => getDefaultModelFor(tier, kind) === defaultModel),
    };
  });
}

const COPIES: Record<string, CopyDefinition> = {
  'ts.billing.normalize': {
    language: 'typescript',
    scope: 'spelling',
    question: 'identity',
    source: 'billing-catalog.ts normalizeBillingPlanTier',
  },
  'ts.ui.normalize': {
    language: 'typescript',
    scope: 'spelling',
    question: 'identity',
    source: 'design-system/user-identity.ts normalizeUIPlanTier',
  },
  'ts.billing.isPlan': {
    language: 'typescript',
    scope: 'spelling',
    question: 'recognised',
    source: 'billing-catalog.ts isBillingPlanTier',
  },
  'ts.access.normalize': {
    language: 'typescript',
    scope: 'spelling',
    question: 'modelBucket',
    source: 'model-catalog.ts normalizeSubscriptionAccessTier',
  },
  'ts.product.normalize': {
    language: 'typescript',
    scope: 'spelling',
    question: 'modelBucket',
    source: 'model-catalog.ts getTierPolicy(tier).tier',
  },
  'ts.ui.atLeast': {
    language: 'typescript',
    scope: 'spelling',
    question: 'order',
    source: 'design-system/user-identity.ts tierAtLeast over normalizeUIPlanTier',
  },
  'ts.billing.upgradeLadderIndex': {
    language: 'typescript',
    scope: 'spelling',
    question: 'upgradeLadder',
    source: 'billing-catalog.ts SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER',
  },
  'ts.billing.isFree': {
    language: 'typescript',
    scope: 'spelling',
    question: 'freePlan',
    source: 'billing-catalog.ts isFreeBillingPlanTier',
  },
  'ts.billing.isFreeOfCharge': {
    language: 'typescript',
    scope: 'spelling',
    question: 'freePlan',
    source: 'billing-catalog.ts isFreeOfChargePlanTier',
  },
  'ts.ui.isFree': {
    language: 'typescript',
    scope: 'spelling',
    question: 'freePlan',
    source: 'design-system/user-identity.ts isFreePlan over normalizeUIPlanTier',
  },
  'ts.billing.capabilities': {
    language: 'typescript',
    scope: 'spelling',
    question: 'capabilities',
    source: 'billing-catalog.ts canUseBillingPlanCapability on the spelling',
  },
  'ts.billing.capabilitiesNormalised': {
    language: 'typescript',
    scope: 'spelling',
    question: 'capabilitiesNormalised',
    source: 'billing-catalog.ts canUseBillingPlanCapability after normalizeBillingPlanTier',
  },
  'ts.billing.media': {
    language: 'typescript',
    scope: 'spelling',
    question: 'media',
    source: 'billing-catalog.ts image and video capabilities after normalizeBillingPlanTier',
  },
  'ts.product.media': {
    language: 'typescript',
    scope: 'spelling',
    question: 'media',
    source: 'model-catalog.ts getTierPolicy allowImageGeneration and allowVideoGeneration',
  },
  'ts.product.manualSelection': {
    language: 'typescript',
    scope: 'spelling',
    question: 'manualSelection',
    source: 'model-catalog.ts canAccessManualModelSelection',
  },
  'ts.product.allowedSlots': {
    language: 'typescript',
    scope: 'spelling',
    question: 'productSlots',
    source: 'model-catalog.ts getTierPolicy(tier).allowedSlots',
  },
  'ts.product.defaultModelSameAs': {
    language: 'typescript',
    scope: 'spelling',
    question: 'defaultModel',
    source: 'model-catalog.ts getDefaultModelFor compared with each access tier',
  },
  'ts.ui.canSwitchProvider': {
    language: 'typescript',
    scope: 'spelling',
    question: 'providerSwitch',
    source: 'design-system/user-identity.ts canSwitchProviderInThread',
  },
  'ts.access.canAccessModel': {
    language: 'typescript',
    scope: 'spelling',
    question: 'modelAdmission',
    source: 'model-catalog.ts canAccessModelForSubscriptionTier',
  },
  'ts.autoProfile.canAccess': {
    language: 'typescript',
    scope: 'spelling',
    question: 'autoProfileAdmission',
    source: 'model-catalog.ts canAccessAutoRoutingProfileForTier',
  },
  'ts.minimumRequiredTierLabel': {
    language: 'typescript',
    scope: 'model',
    question: 'minimumPlanLabel',
    source: 'model-catalog.ts getMinimumRequiredTier, as the plan label',
  },
};

function planLabel(plan: string | null): Json {
  return plan === null
    ? null
    : BILLING_PLAN_PRICING[plan as keyof typeof BILLING_PLAN_PRICING].label;
}

function spellingAnswers(spelling: string, samples: readonly ModelSample[]): Answers {
  const billing = normalizeBillingPlanTier(spelling);
  const ui = normalizeUIPlanTier(spelling);
  const universe = Object.keys(PLAN_LABEL) as UIPlanTier[];
  const registryAliases = Object.keys(
    (modelRegistry as unknown as { policies: { auto: { aliases: Record<string, unknown> } } })
      .policies.auto.aliases,
  ).sort(codeUnitOrder);
  const policy = getTierPolicy(spelling);
  const answers: Answers = {
    'ts.billing.normalize': billing,
    'ts.ui.normalize': ui,
    'ts.billing.isPlan': isBillingPlanTier(spelling),
    'ts.access.normalize': normalizeSubscriptionAccessTier(spelling),
    'ts.product.normalize': policy.tier,
    'ts.ui.atLeast': universe.filter((required) => tierAtLeast(ui, required)),
    'ts.billing.upgradeLadderIndex': (
      SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER as readonly string[]
    ).indexOf(spelling),
    'ts.billing.isFree': isFreeBillingPlanTier(spelling),
    'ts.billing.isFreeOfCharge': isFreeOfChargePlanTier(spelling),
    'ts.ui.isFree': isFreePlan(ui),
    'ts.billing.capabilities': capabilitiesOf(spelling),
    'ts.billing.capabilitiesNormalised': capabilitiesOf(billing),
    'ts.billing.media': mediaOf(capabilitiesOf(billing)),
    'ts.product.media': MEDIA_CAPABILITIES.filter((capability) =>
      capability === 'image_generation'
        ? policy.allowImageGeneration === true
        : policy.allowVideoGeneration === true,
    ),
    'ts.product.manualSelection': canAccessManualModelSelection(spelling),
    'ts.product.allowedSlots': [...policy.allowedSlots].sort(codeUnitOrder),
    'ts.product.defaultModelSameAs': sameDefaultsAs(spelling),
    'ts.ui.canSwitchProvider': canSwitchProviderInThread(ui),
  };
  for (const sample of samples) {
    answers[`ts.access.canAccessModel${SAMPLE_SEPARATOR}${sample.selection}`] =
      canAccessModelForSubscriptionTier(sample.modelId, spelling);
  }
  for (const alias of registryAliases) {
    answers[`ts.autoProfile.canAccess${SAMPLE_SEPARATOR}${alias}`] =
      canAccessAutoRoutingProfileForTier(alias, spelling);
  }
  return answers;
}

function modelAnswers(sample: ModelSample): Answers {
  return { 'ts.minimumRequiredTierLabel': planLabel(getMinimumRequiredTier(sample.modelId)) };
}

function copyOf(answerKey: string): string {
  return answerKey.split(SAMPLE_SEPARATOR)[0]!;
}

function suffixOf(answerKey: string): string {
  const [, suffix] = answerKey.split(SAMPLE_SEPARATOR);
  return suffix === undefined ? '' : `${SAMPLE_SEPARATOR}${suffix}`;
}

function differing(answers: Answers, copies: Fixture['copies'], scope: 'spelling' | 'model') {
  const seen = new Map<string, Set<string>>();
  for (const [answerKey, answer] of Object.entries(answers)) {
    const copy = copies[copyOf(answerKey)];
    if (copy === undefined || copy.scope !== scope) continue;
    const group = `${copy.question}${suffixOf(answerKey)}`;
    const values = seen.get(group) ?? new Set<string>();
    values.add(JSON.stringify(answer));
    seen.set(group, values);
  }
  return [...seen]
    .filter(([, values]) => values.size > 1)
    .map(([group]) => group)
    .sort(codeUnitOrder);
}

function sortedKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(codeUnitOrder)
        .map((key) => [key, sortedKeys(value[key]!)]),
    );
  }
  return value;
}

function readFixture(): Fixture {
  try {
    return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
  } catch {
    return { copies: {}, orderUniverse: [], modelRows: {}, rows: {} };
  }
}

function withoutOwnAnswers(answers: Answers): Answers {
  return Object.fromEntries(
    Object.entries(answers).filter(([answerKey]) => !copyOf(answerKey).startsWith(TS_PREFIX)),
  );
}

function regenerate(): Fixture {
  const existing = readFixture();
  const samples = modelSamples();
  const copies: Fixture['copies'] = Object.fromEntries(
    Object.entries(existing.copies).filter(([id]) => !id.startsWith(TS_PREFIX)),
  );
  Object.assign(copies, COPIES);

  const rows: Fixture['rows'] = {};
  for (const { spelling, kind } of spellingList()) {
    const answers = {
      ...withoutOwnAnswers(existing.rows[spelling]?.answers ?? {}),
      ...spellingAnswers(spelling, samples),
    };
    rows[spelling] = { kind, answers, differs: differing(answers, copies, 'spelling') };
  }

  const modelRows: Fixture['modelRows'] = {};
  for (const sample of samples) {
    const answers = {
      ...withoutOwnAnswers(existing.modelRows[sample.selection]?.answers ?? {}),
      ...modelAnswers(sample),
    };
    modelRows[sample.selection] = {
      selection: describeSelection(sample.selection),
      answers,
      differs: differing(answers, copies, 'model'),
    };
  }

  return {
    copies,
    orderUniverse: Object.keys(PLAN_LABEL),
    modelRows,
    rows,
  };
}

function describeSelection(selection: string): string {
  switch (selection) {
    case 'economy_named_free':
      return 'first model tierAllowedModels.economy names with tierPolicy.minTier free';
    case 'economy_named_not_free':
      return 'first model tierAllowedModels.economy names without tierPolicy.minTier free';
    case 'pro_addition':
      return 'first model tierAllowedModels.pro_additions names';
    case 'flagship_addition':
      return 'first model tierAllowedModels.flagship_additions names';
    case 'unnamed_routed_cheapest':
      return 'cheapest chat-type model no tierAllowedModels list names that has a selectable managed_cloud route, by inputCost plus outputCost then id';
    case 'unnamed_routed_median':
      return 'middle model of that same set and order';
    default:
      return 'dearest model of that same set and order';
  }
}

function serialised(fixture: Fixture): string {
  return `${JSON.stringify(sortedKeys(fixture as unknown as Json), null, FIXTURE_INDENT)}\n`;
}

describe('plan tier conformance fixture', () => {
  if (process.env[UPDATE_ENV] === '1') {
    it('regenerates the fixture', () => {
      const regenerated = regenerate();
      writeFileSync(FIXTURE_PATH, serialised(regenerated));
      expect(Object.keys(regenerated.rows).length).toBeGreaterThan(0);
    });
    return;
  }

  const recorded = readFixture();
  const samples = modelSamples();

  it('lists every spelling the generator covers', () => {
    expect(Object.keys(recorded.rows).sort(codeUnitOrder)).toEqual(
      spellingList()
        .map(({ spelling }) => spelling)
        .sort(codeUnitOrder),
    );
    expect(recorded.orderUniverse).toEqual(Object.keys(PLAN_LABEL));
    expect(Object.keys(recorded.modelRows).sort(codeUnitOrder)).toEqual(
      samples.map(({ selection }) => selection).sort(codeUnitOrder),
    );
  });

  it('records the answer every TypeScript copy gives today for each spelling', () => {
    const drifted = Object.entries(recorded.rows).flatMap(([spelling, row]) => {
      const actual = spellingAnswers(spelling, samples);
      const recordedOwn = Object.fromEntries(
        Object.entries(row.answers).filter(([answerKey]) =>
          copyOf(answerKey).startsWith(TS_PREFIX),
        ),
      );
      return JSON.stringify(sortedKeys(actual)) === JSON.stringify(sortedKeys(recordedOwn))
        ? []
        : [
            `${JSON.stringify(spelling)}: ${Object.keys(actual)
              .filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(recordedOwn[key]))
              .join(', ')}`,
          ];
    });
    expect(drifted, `drifted rows; regenerate with ${UPDATE_ENV}=1`).toEqual([]);
  });

  it('records the answer every TypeScript copy gives today for each sampled model', () => {
    for (const sample of samples) {
      const row = recorded.modelRows[sample.selection];
      expect(row?.answers['ts.minimumRequiredTierLabel']).toEqual(
        modelAnswers(sample)['ts.minimumRequiredTierLabel'],
      );
    }
  });

  it('marks exactly the rows whose copies answer one question differently', () => {
    for (const [spelling, row] of Object.entries(recorded.rows)) {
      expect(row.differs, `differs for ${JSON.stringify(spelling)}`).toEqual(
        differing(row.answers, recorded.copies, 'spelling'),
      );
    }
    for (const [selection, row] of Object.entries(recorded.modelRows)) {
      expect(row.differs, `differs for ${selection}`).toEqual(
        differing(row.answers, recorded.copies, 'model'),
      );
    }
  });

  it('carries no model id of its own', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf8');
    for (const modelId of Object.keys(catalogModels)) {
      expect(text.includes(modelId), `fixture names ${modelId}`).toBe(false);
    }
  });

  it('records disagreement for the questions plans/pl3.md names', () => {
    const differs = (spelling: string) => recorded.rows[spelling]?.differs ?? [];
    expect(differs('max+')).toContain('identity');
    expect(differs('')).toContain('identity');
    expect(differs('hobby')).toContain('modelBucket');
    expect(differs('max')).toContain('media');
  });
});
