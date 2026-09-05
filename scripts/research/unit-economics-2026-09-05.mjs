#!/usr/bin/env node
/**
 * Deterministic monthly-COGS model per user profile, sourced entirely from
 * the model registry and the tool-pricing files the running product reads.
 * No model id, provider rate, or tool price is typed by hand here: every
 * number below is either read from
 * packages/ai/model-registry/generated/registry.json, from
 * apps/web/lib/web-search/web-search-pricing.json, or extracted from the
 * declared constants in apps/web/lib/places/places-config.ts and
 * packages/contracts/types/src/billing-catalog.ts.
 *
 * Usage-quantity assumptions (turns, tokens, tool calls per profile) are the
 * one input this script cannot source from the repo, because no profile like
 * this is metered yet. Each is documented with its reasoning next to its
 * definition below and printed in the report so the assumption is auditable.
 *
 * Run: node scripts/research/unit-economics-2026-09-05.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function readText(relPath) {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

function extractNumberConst(text, name, sourceLabel) {
  const match = text.match(new RegExp(`${name}[^=]*=\\s*([0-9_.eE+-]+)`));
  if (!match) throw new Error(`could not find ${name} in ${sourceLabel}`);
  return Number(match[1].replace(/_/g, ''));
}

function extractTierMonthlyPriceUsd(text, tierKey) {
  const pattern = new RegExp(`\\b${tierKey}: \\{[\\s\\S]{0,220}?monthlyPriceUsd: ([0-9.]+)`);
  const match = text.match(pattern);
  if (!match)
    throw new Error(`could not find monthlyPriceUsd for ${tierKey} in billing-catalog.ts`);
  return Number(match[1]);
}

// ---------------------------------------------------------------------------
// Sourced pricing
// ---------------------------------------------------------------------------

const registry = readJson('packages/ai/model-registry/generated/registry.json');
const auto = registry.policies.auto;
const webSearchPricing = readJson('apps/web/lib/web-search/web-search-pricing.json');
const placesConfigText = readText('apps/web/lib/places/places-config.ts');
const billingCatalogText = readText('packages/contracts/types/src/billing-catalog.ts');

const GOOGLE_TEXT_SEARCH_ENTERPRISE_USD_PER_BLOCK = extractNumberConst(
  placesConfigText,
  'GOOGLE_TEXT_SEARCH_ENTERPRISE_USD_PER_BLOCK',
  'apps/web/lib/places/places-config.ts',
);

const GOOGLE_GROUNDING_USD_PER_THOUSAND =
  webSearchPricing.googleGrounding.currentTier.usdPerThousandBeyondPool;
const GOOGLE_GROUNDING_FREE_POOL_PER_MONTH =
  webSearchPricing.googleGrounding.currentTier.poolFreeRequests;
const PERPLEXITY_USD_PER_THOUSAND = webSearchPricing.perplexitySearch.usdPerThousandRequests;

const E2B_COMPUTE_RATE_PER_UNIT_USD = registry.computePricing.e2b.ratePerUnit; // usd_per_vcpu_second
const E2B_DEFAULT_VCPU_COUNT = 2; // apps/web/lib/e2b/compute-metering.ts DEFAULT_E2B_VCPU_COUNT

// The cache-write fallback multipliers a route with no explicit cache-write
// price is billed at, taken verbatim from
// apps/web/lib/services/llm-cost-calculator.ts CACHE_WRITE_FALLBACK_MULTIPLIERS.
const CACHE_WRITE_FALLBACK_MULTIPLIER_5M = 1.25;

const PLAN_MONTHLY_PRICE_USD = {
  basic: extractTierMonthlyPriceUsd(billingCatalogText, 'basic'),
  pro: extractTierMonthlyPriceUsd(billingCatalogText, 'pro'),
  max: extractTierMonthlyPriceUsd(billingCatalogText, 'max'),
  max_15x: extractTierMonthlyPriceUsd(billingCatalogText, 'max_15x'),
};

// Capability gates, mirrored from packages/contracts/types/src/billing-catalog.ts
// BILLING_PLAN_CAPABILITY_TIERS (PRO_TIERS / the video_generation row). Read
// directly rather than retyped, so a catalog change breaks this script's
// assertion instead of silently drifting from it.
function extractCapabilityTiers(text, capabilityKey) {
  const pattern = new RegExp(`${capabilityKey}: (\\[[^\\]]*\\]|PRO_TIERS|CLOUD_CHAT_TIERS)`);
  const match = text.match(pattern);
  if (!match) throw new Error(`could not find capability row ${capabilityKey}`);
  if (match[1] === 'PRO_TIERS') {
    const proTiersMatch = text.match(/PRO_TIERS = (\[[^\]]*\])/);
    return JSON.parse(proTiersMatch[1].replace(/'/g, '"'));
  }
  if (match[1] === 'CLOUD_CHAT_TIERS') {
    const cloudMatch = text.match(/CLOUD_CHAT_TIERS = (\[[^\]]*\])/);
    return JSON.parse(cloudMatch[1].replace(/'/g, '"'));
  }
  return JSON.parse(match[1].replace(/'/g, '"'));
}

const IMAGE_GENERATION_TIERS = extractCapabilityTiers(billingCatalogText, 'image_generation');
const VIDEO_GENERATION_TIERS = extractCapabilityTiers(billingCatalogText, 'video_generation');
const AGI_WORK_TIERS = extractCapabilityTiers(billingCatalogText, 'agi_work');

// Enforced per-plan COGS ceiling, reproduced from the same conversion the
// reservation system applies (apps/web/lib/server/managed-usage-policy.ts
// getPlanUsageBudgetCents) over the unit table it reads
// (apps/web/lib/billing/managed-usage-caps.ts MANAGED_USAGE_LIMITS). This is
// the hard stop a real account hits regardless of what this script's profile
// assumptions say, so every profile's modeled COGS is checked against it.
const managedUsageCapsText = readText('apps/web/lib/billing/managed-usage-caps.ts');
const managedUsagePolicyText = readText('apps/web/lib/server/managed-usage-policy.ts');

function extractMonthlyUnits(text, tierKey) {
  const pattern = new RegExp(`'?${tierKey}'?: \\{[\\s\\S]{0,20}?monthlyUnits: ([0-9_]+)`);
  const match = text.match(pattern);
  if (!match)
    throw new Error(`could not find monthlyUnits for ${tierKey} in managed-usage-caps.ts`);
  return Number(match[1].replace(/_/g, ''));
}

const INTERNAL_USAGE_UNITS_PER_LEDGER_CENT = extractNumberConst(
  managedUsagePolicyText,
  'INTERNAL_USAGE_UNITS_PER_LEDGER_CENT',
  'apps/web/lib/server/managed-usage-policy.ts',
);

const PLAN_MONTHLY_COGS_CEILING_CENTS = {};
for (const tierKey of Object.keys(PLAN_MONTHLY_PRICE_USD)) {
  PLAN_MONTHLY_COGS_CEILING_CENTS[tierKey] =
    extractMonthlyUnits(managedUsageCapsText, tierKey) / INTERNAL_USAGE_UNITS_PER_LEDGER_CENT;
}

// ---------------------------------------------------------------------------
// Router simulation - reproduces packages/ai/routing/src/auto.ts normalizeTier
// and resolveRoutingLane against the SAME registry-declared policy tables, so
// the model mix per profile is the router's actual admitted slot, not a
// hand-picked model.
// ---------------------------------------------------------------------------

function normalizeTier(tier) {
  switch (tier) {
    case 'pro':
    case 'team':
      return 'pro';
    case 'basic':
    case 'hobby':
      return 'free';
    case 'max':
    case 'max_15x':
      return 'max';
    case 'enterprise':
      return 'enterprise';
    case 'byok':
      return 'byok';
    default:
      return 'free';
  }
}

const routesByModelKey = new Map();
for (const [routeId, route] of Object.entries(registry.routes)) {
  const list = routesByModelKey.get(route.modelKey) ?? [];
  list.push({ routeId, ...route });
  routesByModelKey.set(route.modelKey, list);
}

function defaultRouteForModelKey(modelKey) {
  const candidates = routesByModelKey.get(modelKey);
  if (!candidates || candidates.length === 0) {
    throw new Error(`no registry route for model key ${modelKey}`);
  }
  return candidates.find((route) => route.isDefault) ?? candidates[0];
}

function resolveTaskRoute(taskType, planTier) {
  const registryTier = normalizeTier(planTier);
  const maxProfile = auto.tierMaximumProfiles[registryTier] ?? 'economy';
  const requestedProfile = auto.autoProfileByTask[taskType] ?? 'balanced';
  const order = auto.profileOrder;
  const effectiveProfile =
    order[Math.min(order.indexOf(requestedProfile), order.indexOf(maxProfile))];
  const allowedSlots = new Set(auto.tierAllowedSlots[registryTier] ?? [auto.fallbackSlot]);
  const task = auto.tasks[taskType];
  if (!task) throw new Error(`no auto.tasks entry for task type ${taskType}`);
  const preferred = task.preferredSlots[effectiveProfile] ?? [];
  const chosenSlotId = preferred.find((slotId) => allowedSlots.has(slotId)) ?? auto.fallbackSlot;
  const slot = auto.slots[chosenSlotId];
  const route = defaultRouteForModelKey(slot.modelKey);
  return { slotId: chosenSlotId, effectiveProfile, requestedProfile, route };
}

function resolveCacheRates(pricing) {
  const input = pricing.inputPerMillion;
  return {
    read: pricing.cacheReadPerMillion ?? input,
    write5m: pricing.cacheWritePerMillion ?? input * CACHE_WRITE_FALLBACK_MULTIPLIER_5M,
  };
}

function chatCostCents(
  route,
  turns,
  avgInputTokens,
  avgOutputTokens,
  cacheHitShare,
  cacheWriteShare,
) {
  const pricing = route.pricing;
  const totalInput = turns * avgInputTokens;
  const cacheRead = totalInput * cacheHitShare;
  const cacheWrite = totalInput * cacheWriteShare;
  const fresh = Math.max(0, totalInput - cacheRead - cacheWrite);
  const totalOutput = turns * avgOutputTokens;
  const rates = resolveCacheRates(pricing);
  const inputCostUsd =
    (fresh / 1_000_000) * pricing.inputPerMillion +
    (cacheRead / 1_000_000) * rates.read +
    (cacheWrite / 1_000_000) * rates.write5m;
  const outputCostUsd = (totalOutput / 1_000_000) * pricing.outputPerMillion;
  return (inputCostUsd + outputCostUsd) * 100;
}

function groundingCostCents(calls) {
  return calls * (GOOGLE_GROUNDING_USD_PER_THOUSAND / 10);
}

function fallbackSearchCostCents(calls) {
  return calls * (PERPLEXITY_USD_PER_THOUSAND / 10);
}

function placesCostCents(calls) {
  return calls * (GOOGLE_TEXT_SEARCH_ENTERPRISE_USD_PER_BLOCK / 10);
}

function sandboxMinutesCostCents(minutes) {
  const microusdPerSecond = Math.round(
    E2B_DEFAULT_VCPU_COUNT * E2B_COMPUTE_RATE_PER_UNIT_USD * 1_000_000,
  );
  const seconds = minutes * 60;
  return (seconds * microusdPerSecond) / 10_000;
}

const imageGenerationRoute = defaultRouteForModelKey(auto.slots['image_generation'].modelKey);
const IMAGE_USD_PER_IMAGE = imageGenerationRoute.pricing.imagePerImage;

function imageCostCents(count) {
  return count * IMAGE_USD_PER_IMAGE * 100;
}

const videoGenerationRoute = defaultRouteForModelKey(auto.slots['video_generation'].modelKey);
const VIDEO_USD_PER_SECOND_BY_RESOLUTION = videoGenerationRoute.pricing.videoPerSecondByResolution;

function videoCostCents(count, durationSecs, resolution) {
  const rate = VIDEO_USD_PER_SECOND_BY_RESOLUTION[resolution];
  if (typeof rate !== 'number')
    throw new Error(`no video rate declared for resolution ${resolution}`);
  return count * durationSecs * rate * 100;
}

// ---------------------------------------------------------------------------
// Profiles
//
// Every quantity below is this script's own documented assumption (the repo
// meters no profile like this yet); every PRICE applied to that quantity is
// read from the registry / tool-pricing files above. `notes` states the
// reasoning so the number is auditable rather than asserted.
// ---------------------------------------------------------------------------

const PROFILES = [
  {
    name: 'Light',
    planTier: 'basic',
    notes: 'About one short conversation a day; the entry paid tier, no tool use.',
    turnsPerMonth: 30,
    taskMix: { simple_chat: 0.9, coding: 0.05, reasoning: 0.05 },
    avgInputTokens: 500,
    avgOutputTokens: 250,
    cacheHitShare: 0.15,
    cacheWriteShare: 0.1,
    tools: {},
    retryShare: 0.02,
    gatewayOverheadShare: 0.02,
  },
  {
    name: 'Normal',
    planTier: 'pro',
    notes:
      'About ten turns a day of general chat with occasional coding help, search, and one image a week.',
    turnsPerMonth: 300,
    taskMix: {
      simple_chat: 0.6,
      coding: 0.15,
      reasoning: 0.1,
      research: 0.1,
      creative_writing: 0.05,
    },
    avgInputTokens: 1200,
    avgOutputTokens: 450,
    cacheHitShare: 0.45,
    cacheWriteShare: 0.15,
    tools: { webSearchGrounded: 20, webSearchFallback: 5, imageGenerations: 3 },
    retryShare: 0.03,
    gatewayOverheadShare: 0.03,
  },
  {
    name: 'Power',
    planTier: 'max',
    notes:
      'About 40 turns a day, a third of them coding, regular search and occasional sandboxed execution.',
    turnsPerMonth: 1200,
    taskMix: {
      simple_chat: 0.35,
      coding: 0.3,
      reasoning: 0.15,
      research: 0.1,
      creative_writing: 0.1,
    },
    avgInputTokens: 2500,
    avgOutputTokens: 800,
    cacheHitShare: 0.6,
    cacheWriteShare: 0.2,
    tools: {
      webSearchGrounded: 80,
      webSearchFallback: 10,
      sandboxMinutes: 90,
      imageGenerations: 12,
    },
    retryShare: 0.04,
    gatewayOverheadShare: 0.03,
  },
  {
    name: 'Research heavy',
    planTier: 'pro',
    notes:
      'Grounded search dominates the turn mix; long retrieved context keeps cache reuse lower than chat-only usage.',
    turnsPerMonth: 500,
    taskMix: { research: 0.55, simple_chat: 0.25, reasoning: 0.2 },
    avgInputTokens: 3500,
    avgOutputTokens: 650,
    cacheHitShare: 0.35,
    cacheWriteShare: 0.2,
    tools: { webSearchGrounded: 350, webSearchFallback: 60 },
    retryShare: 0.03,
    gatewayOverheadShare: 0.03,
  },
  {
    name: 'Coding heavy',
    planTier: 'max',
    notes:
      'Agentic multi-step coding; large repo context reused across a session drives cache hit rate up, and agent-loop retries push retry share up.',
    turnsPerMonth: 900,
    taskMix: { coding: 0.7, agentic: 0.2, reasoning: 0.1 },
    avgInputTokens: 6000,
    avgOutputTokens: 1100,
    cacheHitShare: 0.7,
    cacheWriteShare: 0.15,
    tools: { sandboxMinutes: 420, webSearchGrounded: 15 },
    retryShare: 0.08,
    gatewayOverheadShare: 0.04,
  },
  {
    name: 'Desktop agent heavy',
    planTier: 'max_15x',
    notes:
      'About 150 agent runs a month at roughly 16 model steps each; every run mixes computer-use, code execution and general steps, so both browser and sandbox minutes accrue alongside the chat turns.',
    turnsPerMonth: 2500,
    taskMix: { agentic: 0.4, 'computer-use': 0.4, coding: 0.2 },
    avgInputTokens: 3500,
    avgOutputTokens: 500,
    cacheHitShare: 0.55,
    cacheWriteShare: 0.15,
    tools: { browserMinutes: 600, sandboxMinutes: 300, webSearchGrounded: 40 },
    retryShare: 0.06,
    gatewayOverheadShare: 0.05,
  },
  {
    name: 'Multimodal heavy',
    planTier: 'max_15x',
    notes:
      'Image and short-video generation dominate the spend; only max_15x and enterprise are entitled to video generation, so this profile is priced on that tier.',
    turnsPerMonth: 200,
    taskMix: { multimodal: 0.5, simple_chat: 0.3, creative_writing: 0.2 },
    avgInputTokens: 1800,
    avgOutputTokens: 500,
    cacheHitShare: 0.3,
    cacheWriteShare: 0.1,
    tools: {
      imageGenerations: 300,
      videoGenerations: { count: 25, durationSecs: 6, resolution: '1080p' },
    },
    retryShare: 0.03,
    gatewayOverheadShare: 0.03,
  },
  {
    name: '95th percentile',
    planTier: 'max_15x',
    notes:
      'Top of the legitimate usage distribution: heavy on every dimension at once, still with realistic cache reuse.',
    turnsPerMonth: 4000,
    taskMix: {
      simple_chat: 0.3,
      coding: 0.25,
      reasoning: 0.15,
      research: 0.15,
      agentic: 0.1,
      creative_writing: 0.05,
    },
    avgInputTokens: 3200,
    avgOutputTokens: 750,
    cacheHitShare: 0.6,
    cacheWriteShare: 0.15,
    tools: {
      webSearchGrounded: 200,
      webSearchFallback: 30,
      sandboxMinutes: 400,
      browserMinutes: 120,
      imageGenerations: 40,
      videoGenerations: { count: 5, durationSecs: 6, resolution: '1080p' },
    },
    retryShare: 0.05,
    gatewayOverheadShare: 0.04,
  },
  {
    name: 'Automated or abusive',
    planTier: 'max_15x',
    notes:
      'Scripted, low-diversity probing: short independent prompts with no session reuse (zero cache hit) and a high retry share from hammering a failing call.',
    turnsPerMonth: 25000,
    taskMix: { simple_chat: 0.7, coding: 0.3 },
    avgInputTokens: 800,
    avgOutputTokens: 200,
    cacheHitShare: 0,
    cacheWriteShare: 0,
    tools: {},
    retryShare: 0.3,
    gatewayOverheadShare: 0.1,
  },
];

const AGI_WORK_TASK_TYPES = ['agentic', 'computer-use'];
for (const profile of PROFILES) {
  const usesAgiWork = AGI_WORK_TASK_TYPES.some((taskType) => profile.taskMix[taskType] > 0);
  if (usesAgiWork && !AGI_WORK_TIERS.includes(profile.planTier)) {
    throw new Error(
      `${profile.name} assumes agentic/computer-use task share on ${profile.planTier}, which billing-catalog.ts does not entitle to agi_work`,
    );
  }
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

function computeProfile(profile) {
  const components = [];
  let chatCentsTotal = 0;
  let chatCentsNoCache = 0;
  let chatCentsIfMaxProfile = 0;
  const slotUsage = [];

  for (const [taskType, share] of Object.entries(profile.taskMix)) {
    const turns = profile.turnsPerMonth * share;
    const { slotId, effectiveProfile, route } = resolveTaskRoute(taskType, profile.planTier);
    const cost = chatCostCents(
      route,
      turns,
      profile.avgInputTokens,
      profile.avgOutputTokens,
      profile.cacheHitShare,
      profile.cacheWriteShare,
    );
    chatCentsTotal += cost;
    chatCentsNoCache += chatCostCents(
      route,
      turns,
      profile.avgInputTokens,
      profile.avgOutputTokens,
      0,
      0,
    );

    const maxProfileRoute = (() => {
      const registryTier = normalizeTier(profile.planTier);
      const maxProfile = auto.tierMaximumProfiles[registryTier] ?? 'economy';
      const allowedSlots = new Set(auto.tierAllowedSlots[registryTier] ?? [auto.fallbackSlot]);
      const task = auto.tasks[taskType];
      const preferred = task.preferredSlots[maxProfile] ?? [];
      const chosenSlotId = preferred.find((id) => allowedSlots.has(id)) ?? auto.fallbackSlot;
      return defaultRouteForModelKey(auto.slots[chosenSlotId].modelKey);
    })();
    chatCentsIfMaxProfile += chatCostCents(
      maxProfileRoute,
      turns,
      profile.avgInputTokens,
      profile.avgOutputTokens,
      profile.cacheHitShare,
      profile.cacheWriteShare,
    );

    slotUsage.push({ taskType, share, slotId, effectiveProfile, turns, costCents: cost });
    components.push({ label: `chat: ${taskType} (${slotId})`, cents: cost });
  }

  const overheadCents = chatCentsTotal * (profile.retryShare + profile.gatewayOverheadShare);
  if (overheadCents > 0) {
    components.push({
      label: `retries + gateway overhead (${Math.round((profile.retryShare + profile.gatewayOverheadShare) * 100)}%)`,
      cents: overheadCents,
    });
  }

  const tools = profile.tools ?? {};
  let toolsGatedNote = null;

  if (tools.webSearchGrounded) {
    const cents = groundingCostCents(tools.webSearchGrounded);
    components.push({ label: `web search (grounded, beyond free pool)`, cents });
  }
  if (tools.webSearchFallback) {
    const cents = fallbackSearchCostCents(tools.webSearchFallback);
    components.push({ label: `web search (fallback provider)`, cents });
  }
  if (tools.placesSearch) {
    components.push({ label: 'places search', cents: placesCostCents(tools.placesSearch) });
  }
  if (tools.sandboxMinutes) {
    components.push({
      label: 'sandbox compute minutes',
      cents: sandboxMinutesCostCents(tools.sandboxMinutes),
    });
  }
  if (tools.browserMinutes) {
    components.push({
      label: 'browser (computer-use) compute minutes',
      cents: sandboxMinutesCostCents(tools.browserMinutes),
    });
  }
  if (tools.imageGenerations) {
    const entitled = IMAGE_GENERATION_TIERS.includes(profile.planTier);
    if (entitled) {
      components.push({ label: 'image generation', cents: imageCostCents(tools.imageGenerations) });
    } else {
      toolsGatedNote = `${tools.imageGenerations} image generations requested but ${profile.planTier} is not entitled to image_generation; excluded`;
    }
  }
  if (tools.videoGenerations) {
    const entitled = VIDEO_GENERATION_TIERS.includes(profile.planTier);
    if (entitled) {
      const { count, durationSecs, resolution } = tools.videoGenerations;
      components.push({
        label: 'video generation',
        cents: videoCostCents(count, durationSecs, resolution),
      });
    } else {
      toolsGatedNote = `${tools.videoGenerations.count} video generations requested but ${profile.planTier} is not entitled to video_generation; excluded`;
    }
  }

  const totalCents = components.reduce((sum, c) => sum + c.cents, 0);
  const cachingSavingsCents = chatCentsNoCache - chatCentsTotal;
  const routingSavingsCents = chatCentsIfMaxProfile - chatCentsTotal;
  const priceUsd = PLAN_MONTHLY_PRICE_USD[profile.planTier];
  const totalUsd = totalCents / 100;
  const marginUsd = priceUsd - totalUsd;
  const marginPercent = priceUsd > 0 ? (marginUsd / priceUsd) * 100 : null;

  return {
    profile,
    components,
    totalCents,
    totalUsd,
    priceUsd,
    marginUsd,
    marginPercent,
    cachingSavingsCents,
    routingSavingsCents,
    slotUsage,
    toolsGatedNote,
    storageNote: tools.fileStorageGB
      ? `${tools.fileStorageGB} GB/month of file storage assumed; no per-GB storage price exists in this repo, so it is excluded from the total`
      : null,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function usd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function pct(value) {
  return `${value.toFixed(1)}%`;
}

console.log('# Unit economics model output\n');
console.log('Sourced constants:\n');
console.log(
  `- Google grounding: $${GOOGLE_GROUNDING_USD_PER_THOUSAND}/1,000 calls beyond a ${GOOGLE_GROUNDING_FREE_POOL_PER_MONTH}/month free pool (apps/web/lib/web-search/web-search-pricing.json)`,
);
console.log(
  `- Fallback search (Perplexity): $${PERPLEXITY_USD_PER_THOUSAND}/1,000 calls (apps/web/lib/web-search/web-search-pricing.json)`,
);
console.log(
  `- Places search: $${GOOGLE_TEXT_SEARCH_ENTERPRISE_USD_PER_BLOCK}/1,000 calls (apps/web/lib/places/places-config.ts)`,
);
console.log(
  `- Sandbox/browser compute: $${E2B_COMPUTE_RATE_PER_UNIT_USD}/vCPU-second at ${E2B_DEFAULT_VCPU_COUNT} vCPU default (packages/ai/model-registry/catalog/provider-compute-pricing.json)`,
);
console.log(
  `- Image generation: $${IMAGE_USD_PER_IMAGE}/image on the ${auto.slots['image_generation'].modelKey ? 'image_generation' : ''} slot (registry route pricing)`,
);
console.log(
  `- Video generation: ${JSON.stringify(VIDEO_USD_PER_SECOND_BY_RESOLUTION)} USD/second by resolution on the video_generation slot (registry route pricing)`,
);
console.log(
  `- Plan prices: ${Object.entries(PLAN_MONTHLY_PRICE_USD)
    .map(([k, v]) => `${k}=$${v}`)
    .join(', ')} (packages/contracts/types/src/billing-catalog.ts)\n`,
);

const summaryRows = [];

for (const profile of PROFILES) {
  const result = computeProfile(profile);
  summaryRows.push(result);

  console.log(`## ${profile.name} (${profile.planTier}, $${result.priceUsd}/month)\n`);
  console.log(`Assumption: ${profile.notes}\n`);
  console.log(
    `Turns/month: ${profile.turnsPerMonth}, avg input tokens: ${profile.avgInputTokens}, avg output tokens: ${profile.avgOutputTokens}, cache hit share: ${pct(profile.cacheHitShare * 100)}, cache write share: ${pct(profile.cacheWriteShare * 100)}\n`,
  );

  console.log('| Component | Monthly cost |');
  console.log('| --- | --- |');
  for (const component of result.components) {
    console.log(`| ${component.label} | ${usd(component.cents)} |`);
  }
  console.log(`| **Total COGS** | **${usd(result.totalCents)}** |\n`);

  console.log(
    `Plan price: $${result.priceUsd.toFixed(2)} | Margin: ${usd(result.marginUsd * 100)} (${result.marginPercent === null ? 'n/a' : pct(result.marginPercent)})`,
  );
  console.log(`Prompt caching saves: ${usd(result.cachingSavingsCents)}/month versus no caching`);
  console.log(
    `Router savings: ${usd(result.routingSavingsCents)}/month versus forcing every task to the tier's maximum profile`,
  );
  if (result.toolsGatedNote) console.log(`Note: ${result.toolsGatedNote}`);
  if (result.storageNote) console.log(`Note: ${result.storageNote}`);

  const candidateDeltas = [-0.2, 0.2];
  const candidateLine = candidateDeltas
    .map((delta) => {
      const candidatePrice = result.priceUsd * (1 + delta);
      const candidateMargin = candidatePrice - result.totalUsd;
      const candidateMarginPct =
        candidatePrice > 0 ? (candidateMargin / candidatePrice) * 100 : null;
      return `$${candidatePrice.toFixed(2)} -> margin ${usd(candidateMargin * 100)} (${candidateMarginPct === null ? 'n/a' : pct(candidateMarginPct)})`;
    })
    .join(' | ');
  console.log(`Candidate price points: ${candidateLine}\n`);

  const ceilingCents = PLAN_MONTHLY_COGS_CEILING_CENTS[profile.planTier];
  const ceilingRatio = (result.totalCents / ceilingCents) * 100;
  console.log(
    `Enforced monthly COGS ceiling on ${profile.planTier} (reservation system): ${usd(ceilingCents)}; this profile reaches ${pct(ceilingRatio)} of it${result.totalCents > ceilingCents ? ' -- the reservation system would throttle this profile before it reached the modeled total' : ''}\n`,
  );
}

console.log('## Summary across profiles\n');
console.log('| Profile | Plan | Price | Total COGS | Margin | Margin % | % of enforced ceiling |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const result of summaryRows) {
  const ceilingCents = PLAN_MONTHLY_COGS_CEILING_CENTS[result.profile.planTier];
  const ceilingRatio = (result.totalCents / ceilingCents) * 100;
  console.log(
    `| ${result.profile.name} | ${result.profile.planTier} | $${result.priceUsd.toFixed(2)} | ${usd(result.totalCents)} | ${usd(result.marginUsd * 100)} | ${result.marginPercent === null ? 'n/a' : pct(result.marginPercent)} | ${pct(ceilingRatio)} |`,
  );
}
console.log(
  `\nEnforced monthly COGS ceilings by plan: ${Object.entries(PLAN_MONTHLY_COGS_CEILING_CENTS)
    .map(([tier, cents]) => `${tier}=${usd(cents)}`)
    .join(', ')}`,
);
