#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

module.registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const resolved = new URL(specifier, context.parentURL);
      if (!/\.[cm]?[jt]s$/.test(resolved.pathname)) return next(`${resolved.href}.ts`, context);
    }
    return next(specifier, context);
  },
});

const SOURCES = {
  credits: 'packages/contracts/types/src/credits.ts',
  allowances: 'packages/contracts/types/src/managed-usage-limits.ts',
  rateCard: 'packages/contracts/types/src/rate-card.ts',
  plans: 'packages/contracts/types/src/billing-catalog.ts',
  storeCommission: 'packages/contracts/types/src/mobile-iap.ts',
  modelPrices: 'packages/ai/model-registry/generated/registry.json',
  cacheWritePremium: 'apps/web/lib/services/llm-cost-calculator.ts',
  includedSearch: 'apps/web/lib/web-search/search-budget.ts',
  groundingPool: 'apps/web/lib/web-search/web-search-pricing.json',
};

function sourcePath(relPath) {
  return path.join(ROOT, relPath);
}

function readSource(relPath) {
  return readFileSync(sourcePath(relPath), 'utf8');
}

function readDeclaredNumber(relPath, pattern) {
  const match = readSource(relPath).match(pattern);
  if (!match) throw new Error(`could not find ${pattern} in ${relPath}`);
  return Number(match[1].replace(/_/g, ''));
}

function importSource(relPath) {
  return import(pathToFileURL(sourcePath(relPath)).href);
}

const { MICROUSD_PER_CREDIT, MICROUSD_PER_USD, creditsFromMicrousd } = await importSource(
  SOURCES.credits,
);
const { MANAGED_USAGE_LIMITS } = await importSource(SOURCES.allowances);
const {
  DEFAULT_SANDBOX_MEMORY_GIB,
  DEFAULT_SANDBOX_VCPU_COUNT,
  FEATURE_RATE_CARD,
  sandboxComputeRate,
} = await importSource(SOURCES.rateCard);
const { BILLING_PLAN_CAPABILITY_TIERS, BILLING_PLAN_PRICING, SELF_SERVE_PAID_PLAN_TIERS } =
  await importSource(SOURCES.plans);
const { BASIS_POINTS_PER_WHOLE, MOBILE_IAP_PRODUCT_DEFINITIONS, MOBILE_IAP_STORE_COMMISSION } =
  await importSource(SOURCES.storeCommission);
const registry = JSON.parse(readSource(SOURCES.modelPrices));
const groundingPool = JSON.parse(readSource(SOURCES.groundingPool)).googleGrounding.currentTier;
const auto = registry.policies.auto;

const CACHE_WRITE_PREMIUM = readDeclaredNumber(
  SOURCES.cacheWritePremium,
  /CACHE_WRITE_FALLBACK_MULTIPLIERS = \{\s*write5m: ([0-9.]+)/,
);
const INCLUDED_SEARCH_CALLS = readDeclaredNumber(
  SOURCES.includedSearch,
  /PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS = ([0-9_]+)/,
);

const TOKENS_PER_PRICED_UNIT = 1_000_000;
const SECONDS_PER_MINUTE = 60;
const MIB_PER_GIB = 1_024;
const MONTHS_PER_YEAR = 12;

const ASSUMED_ACTIVE_ACCOUNTS = 1_000;
const ACTIVE_ACCOUNT_SENSITIVITY = [ASSUMED_ACTIVE_ACCOUNTS / 10, ASSUMED_ACTIVE_ACCOUNTS * 10];

const INFRASTRUCTURE_FOOTPRINT = [
  {
    per: 'turn',
    feature: 'database_compute_second',
    quantity: 0.1,
    reason:
      'about 20 statements a turn (usage reservation and settlement, message and ledger writes, reads) at about 5 ms of one compute unit each',
  },
  {
    per: 'turn',
    feature: 'cache_command_request',
    quantity: 10,
    reason: 'rate limiter windows and cache reads and writes around one turn',
  },
  {
    per: 'image',
    feature: 'artifact_storage_gib_month',
    quantity: 1.5 / MIB_PER_GIB,
    reason: 'a 1.5 MiB image, accrued for one month of storage when it is saved',
  },
  {
    per: 'image',
    feature: 'network_egress_gib',
    quantity: 1.5 / MIB_PER_GIB,
    reason: 'the same image served once through the file route',
  },
  {
    per: 'video second',
    feature: 'artifact_storage_gib_month',
    quantity: 1 / MIB_PER_GIB,
    reason: 'about 8 Mbit/s of 1080p video, accrued for one month of storage',
  },
  {
    per: 'video second',
    feature: 'network_egress_gib',
    quantity: 1 / MIB_PER_GIB,
    reason: 'the same video served once through the file route',
  },
];

const WITHOUT_DEPLOYMENT_OVERRIDES = {};

function rateCardMicrousd(feature) {
  const cost = FEATURE_RATE_CARD[feature]?.providerCogsMicrousd;
  if (!(cost > 0)) throw new Error(`rate card row ${feature} declares no provider cost`);
  return cost;
}

const sandboxRate = sandboxComputeRate(undefined, WITHOUT_DEPLOYMENT_OVERRIDES);
if (!sandboxRate.ok) throw new Error('the rate card declares no sandbox vCPU and memory rate pair');
const SANDBOX_MICROUSD_PER_MINUTE = sandboxRate.microusdPerSecond * SECONDS_PER_MINUTE;

const SEARCH_TOOLS = {
  webSearchGrounded: { feature: 'web_search_grounding', label: 'web search (grounded)' },
  webSearchFallback: { feature: 'web_search_perplexity', label: 'web search (fallback provider)' },
};

const INCLUDED_SEARCH_FEATURES = Object.keys(FEATURE_RATE_CARD).filter(
  (feature) => FEATURE_RATE_CARD[feature].includedInPlans === 'interactive_chat',
);
const INCLUDED_SEARCH_MICROUSD =
  INCLUDED_SEARCH_CALLS * Math.max(...INCLUDED_SEARCH_FEATURES.map(rateCardMicrousd));

const routesByModelKey = new Map();
for (const [routeId, route] of Object.entries(registry.routes)) {
  routesByModelKey.set(route.modelKey, [
    ...(routesByModelKey.get(route.modelKey) ?? []),
    { routeId, ...route },
  ]);
}

function slotRoute(slotId) {
  const modelKey = auto.slots[slotId]?.modelKey;
  const routes = routesByModelKey.get(modelKey) ?? [];
  const route = routes.find((candidate) => candidate.isDefault) ?? routes[0];
  if (!route) throw new Error(`no registry route for slot ${slotId}`);
  return route;
}

const imageRoute = slotRoute('image_generation');
const IMAGE_MICROUSD =
  imageRoute.pricing.imagePerImage > 0
    ? Math.ceil(imageRoute.pricing.imagePerImage * MICROUSD_PER_USD)
    : rateCardMicrousd(`image_generation_${imageRoute.provider}`);

const videoRoute = slotRoute('video_generation');

function videoMicrousdPerSecond(resolution) {
  const usd = videoRoute.pricing.videoPerSecondByResolution?.[resolution];
  if (!(usd > 0)) throw new Error(`no video rate declared for resolution ${resolution}`);
  return usd * MICROUSD_PER_USD;
}

const ROUTING_TIER_BY_PLAN = {
  basic: 'basic',
  pro: 'pro',
  team: 'pro',
  max: 'max',
  max_15x: 'max',
  enterprise: 'enterprise',
};
const autoAlias = auto.aliases[auto.defaultAlias];

function routingTier(planTier) {
  return ROUTING_TIER_BY_PLAN[planTier] ?? 'free';
}

function tierMaximumProfile(planTier) {
  return auto.tierMaximumProfiles[routingTier(planTier)] ?? 'economy';
}

function taskProfile(taskType) {
  return autoAlias.computeProfile
    ? (auto.autoProfileByTask[taskType] ?? autoAlias.profile)
    : autoAlias.profile;
}

function admittedSlot(taskType, planTier, requestedProfile) {
  const order = auto.profileOrder;
  const maximum = tierMaximumProfile(planTier);
  const profile =
    order[Math.min(order.indexOf(requestedProfile), order.indexOf(maximum))] ?? maximum;
  const tierSlots = auto.tierAllowedSlots[routingTier(planTier)] ?? [auto.fallbackSlot];
  const fallbackSlot = tierSlots.includes(auto.fallbackSlot)
    ? auto.fallbackSlot
    : (tierSlots.find((slotId) => auto.slots[slotId]?.modelKey) ?? auto.fallbackSlot);
  const task = auto.tasks[taskType];
  if (!task) throw new Error(`no auto.tasks entry for task type ${taskType}`);
  return (
    (task.preferredSlots[profile] ?? []).find((slotId) => tierSlots.includes(slotId)) ??
    fallbackSlot
  );
}

function cacheRates(route) {
  const { inputPerMillion, cacheReadPerMillion, cacheWritePerMillion } = route.pricing;
  const writesBilledApart =
    registry.governance[route.provider]?.cacheTokenBillingClass === 'additional_to_input';
  return {
    read: cacheReadPerMillion ?? inputPerMillion,
    write:
      cacheWritePerMillion ??
      (writesBilledApart ? inputPerMillion * CACHE_WRITE_PREMIUM : inputPerMillion),
  };
}

function chatMicrousd(route, turns, profile, cacheHitShare, cacheWriteShare) {
  const { inputPerMillion, outputPerMillion } = route.pricing;
  if (typeof inputPerMillion !== 'number' || typeof outputPerMillion !== 'number') {
    throw new Error(`route ${route.routeId} declares no token price`);
  }
  const input = turns * profile.avgInputTokens;
  const cacheRead = input * cacheHitShare;
  const cacheWrite = input * cacheWriteShare;
  const fresh = Math.max(0, input - cacheRead - cacheWrite);
  const rates = cacheRates(route);
  const usd =
    (fresh * inputPerMillion +
      cacheRead * rates.read +
      cacheWrite * rates.write +
      turns * profile.avgOutputTokens * outputPerMillion) /
    TOKENS_PER_PRICED_UNIT;
  return usd * MICROUSD_PER_USD;
}

function footprintMicrousd(per, count) {
  return INFRASTRUCTURE_FOOTPRINT.filter((row) => row.per === per).reduce(
    (sum, row) => sum + count * row.quantity * rateCardMicrousd(row.feature),
    0,
  );
}

const PLATFORM_FEE_ROWS = Object.entries(FEATURE_RATE_CARD).filter(
  ([, row]) => row.vendor && (row.unit === 'month' || row.unit === 'active_user_month'),
);

function platformFeesMicrousd(activeAccounts) {
  return PLATFORM_FEE_ROWS.reduce((sum, [feature, row]) => {
    const rate = rateCardMicrousd(feature);
    if (row.unit === 'month') return sum + rate;
    return sum + Math.max(0, activeAccounts - (row.includedPerMonth ?? 0)) * rate;
  }, 0);
}

function platformShareMicrousd(activeAccounts) {
  return platformFeesMicrousd(activeAccounts) / activeAccounts;
}

const PLATFORM_SHARE_MICROUSD = platformShareMicrousd(ASSUMED_ACTIVE_ACCOUNTS);

function planPriceMicrousd(planTier, interval = 'monthly') {
  const pricing = BILLING_PLAN_PRICING[planTier];
  return interval === 'yearly'
    ? ((pricing.yearlyPriceUsd ?? 0) * MICROUSD_PER_USD) / MONTHS_PER_YEAR
    : pricing.monthlyPriceUsd * MICROUSD_PER_USD;
}

function monthlyCredits(planTier) {
  return MANAGED_USAGE_LIMITS[planTier].monthlyCredits;
}

function allowanceMicrousd(planTier) {
  return monthlyCredits(planTier) * MICROUSD_PER_CREDIT;
}

function planLabel(planTier) {
  return BILLING_PLAN_PRICING[planTier].label;
}

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

function requireCapability(profile, capability, reason) {
  if (!BILLING_PLAN_CAPABILITY_TIERS[capability].includes(profile.planTier)) {
    throw new Error(
      `${profile.name} assumes ${reason} on ${profile.planTier}, which billing-catalog.ts does not entitle to ${capability}`,
    );
  }
}

for (const profile of PROFILES) {
  if (AGI_WORK_TASK_TYPES.some((taskType) => profile.taskMix[taskType] > 0)) {
    requireCapability(profile, 'agi_work', 'agentic or computer-use turns');
  }
  if (profile.tools.imageGenerations) requireCapability(profile, 'image_generation', 'images');
  if (profile.tools.videoGenerations) requireCapability(profile, 'video_generation', 'video');
}

function computeProfile(profile) {
  const components = [];
  let chat = 0;
  let chatUncached = 0;
  let chatAtTierMaximum = 0;

  for (const [taskType, share] of Object.entries(profile.taskMix)) {
    const turns = profile.turnsPerMonth * share;
    const slotId = admittedSlot(taskType, profile.planTier, taskProfile(taskType));
    const route = slotRoute(slotId);
    const cost = chatMicrousd(
      route,
      turns,
      profile,
      profile.cacheHitShare,
      profile.cacheWriteShare,
    );
    chat += cost;
    chatUncached += chatMicrousd(route, turns, profile, 0, 0);
    chatAtTierMaximum += chatMicrousd(
      slotRoute(admittedSlot(taskType, profile.planTier, tierMaximumProfile(profile.planTier))),
      turns,
      profile,
      profile.cacheHitShare,
      profile.cacheWriteShare,
    );
    components.push({ label: `chat: ${taskType} (${slotId})`, microusd: cost });
  }

  const overheadShare = profile.retryShare + profile.gatewayOverheadShare;
  components.push({
    label: `retries + gateway overhead (${Math.round(overheadShare * 100)}%)`,
    microusd: chat * overheadShare,
  });

  const { tools } = profile;
  for (const [tool, { feature, label }] of Object.entries(SEARCH_TOOLS)) {
    if (tools[tool]) components.push({ label, microusd: tools[tool] * rateCardMicrousd(feature) });
  }
  if (tools.sandboxMinutes) {
    components.push({
      label: 'sandbox compute',
      microusd: tools.sandboxMinutes * SANDBOX_MICROUSD_PER_MINUTE,
    });
  }
  const images = tools.imageGenerations ?? 0;
  if (images) components.push({ label: 'image generation', microusd: images * IMAGE_MICROUSD });
  const video = tools.videoGenerations;
  const videoSeconds = video ? video.count * video.durationSecs : 0;
  if (video) {
    components.push({
      label: 'video generation',
      microusd: videoSeconds * videoMicrousdPerSecond(video.resolution),
    });
  }

  const providerMicrousd = components.reduce((sum, component) => sum + component.microusd, 0);
  const perUseInfrastructureMicrousd =
    footprintMicrousd('turn', profile.turnsPerMonth) +
    footprintMicrousd('image', images) +
    footprintMicrousd('video second', videoSeconds);
  const infrastructureMicrousd = perUseInfrastructureMicrousd + PLATFORM_SHARE_MICROUSD;
  const credits = creditsFromMicrousd(providerMicrousd);
  const planCoveredMicrousd = Math.min(providerMicrousd, allowanceMicrousd(profile.planTier));
  const priceMicrousd = planPriceMicrousd(profile.planTier);
  const marginMicrousd = priceMicrousd - planCoveredMicrousd - infrastructureMicrousd;

  return {
    profile,
    components,
    providerMicrousd,
    credits,
    allowanceShare: credits / monthlyCredits(profile.planTier),
    perUseInfrastructureMicrousd,
    infrastructureMicrousd,
    priceMicrousd,
    marginMicrousd,
    marginShare: marginMicrousd / priceMicrousd,
    cachingSavingsMicrousd: chatUncached - chat,
    routingSavingsMicrousd: chatAtTierMaximum - chat,
  };
}

function usd(microusd, digits = 2) {
  return `$${(microusd / MICROUSD_PER_USD).toFixed(digits)}`;
}

function pct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

function count(value, maximumFractionDigits = 0) {
  return value.toLocaleString('en-US', { maximumFractionDigits });
}

function creditCount(credits) {
  return count(credits, credits < 100 ? 1 : 0);
}

function rateCardRow(feature, unit, microusd) {
  const row = FEATURE_RATE_CARD[feature];
  return `| ${feature} | ${unit} | ${usd(microusd, 4)} | ${count(creditsFromMicrousd(microusd), 2)} | ${row.source}, verified ${row.verifiedOn} |`;
}

const results = PROFILES.map(computeProfile);
const maxPerUseInfrastructureMicrousd = Math.max(
  ...results.map((result) => result.perUseInfrastructureMicrousd),
);

console.log('# Unit economics model output\n');
console.log(
  `Every price is read when the script runs: credits from ${SOURCES.credits}, plan allowances from ${SOURCES.allowances}, tool, media, search, sandbox and infrastructure rates from ${SOURCES.rateCard}, plan prices and capability gates from ${SOURCES.plans}, store commission from ${SOURCES.storeCommission}, and model token prices and routing policy from ${SOURCES.modelPrices}. The cache-write premium (${CACHE_WRITE_PREMIUM}x) is read from ${SOURCES.cacheWritePremium} and the included search allowance (${INCLUDED_SEARCH_CALLS} calls) from ${SOURCES.includedSearch}. Rate card figures are the published ones; deployment overrides are not applied.\n`,
);
console.log(
  `1 credit = ${count(MICROUSD_PER_CREDIT)} microUSD of provider cost, so a profile's credits are its provider COGS divided by ${count(MICROUSD_PER_CREDIT)} microUSD, before the per-action round-up to 0.01 credit. Usage quantities (turns, tokens, tool calls per profile) are this script's own assumptions, because no profile like these is metered yet; each is printed with its reasoning.\n`,
);

console.log('## Assumptions\n');
console.log(
  `- Active accounts sharing the platform fees: ${count(ASSUMED_ACTIVE_ACCOUNTS)}. An active account is one with a provider cost event or a Free usage reservation in the month; the monthly allocation job divides each vendor's bill by that count. No measured count is in the repository.`,
);
console.log(
  `- Search calls are priced at the provider rate whether or not they draw credits. Paid plans include ${INCLUDED_SEARCH_CALLS} interactive search calls a month (${INCLUDED_SEARCH_FEATURES.join(', ')}) that draw no credits, so a search-heavy profile's credit count overstates what it draws by up to that many calls.`,
);
console.log(
  "- Browser minutes are kept in the profiles as documented but carry no platform cost: no rate card row prices them, because every browser path drives the user's own Chrome, desktop app or CLI. The computer-use turns that drive the browser are priced as chat.",
);
console.log(
  `- Sandbox minutes run at the default sandbox shape, ${DEFAULT_SANDBOX_VCPU_COUNT} vCPU and ${DEFAULT_SANDBOX_MEMORY_GIB} GiB.`,
);
console.log(
  "- Each task's model is the routing slot the router admits for the plan (auto policy, tier ceiling and allow-list in the registry), priced on that model's default route.",
);
console.log(
  `- Not modeled: payment processing fees (recorded per transaction from Stripe, not a rate), the flagship weekly share, the rolling 5-hour and weekly windows, the Google grounding free pool (${count(groundingPool.poolFreeRequests)} requests a ${groundingPool.poolWindow} for the whole platform, about ${count(groundingPool.poolFreeRequests / ASSUMED_ACTIVE_ACCOUNTS)} per account at ${count(ASSUMED_ACTIVE_ACCOUNTS)} accounts), and vendor invoices beyond the per-use rows (Neon, R2 and Upstash have no committed monthly fee row).\n`,
);
console.log('Per-use infrastructure footprint:\n');
console.log('| Per | Rate card row | Quantity | Reasoning |');
console.log('| --- | --- | --- | --- |');
for (const row of INFRASTRUCTURE_FOOTPRINT) {
  console.log(`| ${row.per} | ${row.feature} | ${count(row.quantity, 6)} | ${row.reason} |`);
}
console.log('');

console.log('## Unit prices\n');
console.log('| Rate card row | Unit | Provider cost | Credits per unit | Source |');
console.log('| --- | --- | --- | --- | --- |');
for (const feature of [
  'web_search_grounding',
  'web_search_perplexity',
  'web_search_anthropic',
  'web_search_openai',
  'places_text_search',
  'hosted_code_execution_openai_session',
  'hosted_code_execution_anthropic_hour',
]) {
  console.log(rateCardRow(feature, FEATURE_RATE_CARD[feature].unit, rateCardMicrousd(feature)));
}
console.log(
  `| sandbox_vcpu_second, sandbox_gib_second | minute at ${DEFAULT_SANDBOX_VCPU_COUNT} vCPU and ${DEFAULT_SANDBOX_MEMORY_GIB} GiB | ${usd(SANDBOX_MICROUSD_PER_MINUTE, 4)} | ${count(creditsFromMicrousd(SANDBOX_MICROUSD_PER_MINUTE), 2)} | ${FEATURE_RATE_CARD.sandbox_vcpu_second.source}, verified ${FEATURE_RATE_CARD.sandbox_vcpu_second.verifiedOn} |`,
);
console.log(
  `| image_generation slot | image | ${usd(IMAGE_MICROUSD, 4)} | ${count(creditsFromMicrousd(IMAGE_MICROUSD), 2)} | registry route price |`,
);
console.log(
  `| video_generation slot | second at 1080p | ${usd(videoMicrousdPerSecond('1080p'), 4)} | ${count(creditsFromMicrousd(videoMicrousdPerSecond('1080p')), 2)} | registry route price |\n`,
);

console.log('## Infrastructure platform fees\n');
console.log('| Rate card row | Vendor | Monthly fee |');
console.log('| --- | --- | --- |');
for (const [feature, row] of PLATFORM_FEE_ROWS) {
  const fee =
    row.unit === 'month'
      ? `${usd(rateCardMicrousd(feature))} a month`
      : `${usd(rateCardMicrousd(feature))} per active account above ${count(row.includedPerMonth ?? 0)}`;
  console.log(`| ${feature} | ${row.vendor} | ${fee} |`);
}
console.log(
  `\nAt ${count(ASSUMED_ACTIVE_ACCOUNTS)} active accounts the fees total ${usd(platformFeesMicrousd(ASSUMED_ACTIVE_ACCOUNTS))} a month, ${usd(PLATFORM_SHARE_MICROUSD)} per account. Sensitivity: ${ACTIVE_ACCOUNT_SENSITIVITY.map((accounts) => `${usd(platformShareMicrousd(accounts))} per account at ${count(accounts)}`).join(', ')}.\n`,
);

for (const result of results) {
  const { profile } = result;
  console.log(
    `## ${profile.name} (${planLabel(profile.planTier)}, ${usd(result.priceMicrousd)}/month)\n`,
  );
  console.log(`Assumption: ${profile.notes}\n`);
  console.log(
    `Turns/month: ${profile.turnsPerMonth}, avg input tokens: ${profile.avgInputTokens}, avg output tokens: ${profile.avgOutputTokens}, cache hit share: ${pct(profile.cacheHitShare)}, cache write share: ${pct(profile.cacheWriteShare)}\n`,
  );
  console.log('| Component | Monthly cost | Credits |');
  console.log('| --- | --- | --- |');
  for (const component of result.components) {
    console.log(
      `| ${component.label} | ${usd(component.microusd)} | ${creditCount(creditsFromMicrousd(component.microusd))} |`,
    );
  }
  console.log(
    `| **Provider COGS** | **${usd(result.providerMicrousd)}** | **${creditCount(result.credits)}** |\n`,
  );
  const allowance = monthlyCredits(profile.planTier);
  console.log(
    `Credits: ${creditCount(result.credits)} of the plan's ${count(allowance)} monthly credits (${pct(result.allowanceShare)}).${result.credits > allowance ? ` The monthly window stops included use at ${count(allowance)} credits; the other ${creditCount(result.credits - allowance)} need bonus or purchased credits, so the plan price carries only ${usd(allowanceMicrousd(profile.planTier))}.` : ''}`,
  );
  console.log(
    `Infrastructure: ${usd(result.infrastructureMicrousd)} (per-use rows ${usd(result.perUseInfrastructureMicrousd)}, platform share ${usd(PLATFORM_SHARE_MICROUSD)}).`,
  );
  console.log(
    `Gross margin at list price: ${usd(result.marginMicrousd)} (${pct(result.marginShare)}).`,
  );
  console.log(
    `Prompt caching saves ${usd(result.cachingSavingsMicrousd)}/month versus no caching; routing saves ${usd(result.routingSavingsMicrousd)}/month versus sending every task to the tier's maximum profile.`,
  );
  if (profile.tools.browserMinutes) {
    console.log(
      `Browser minutes: ${profile.tools.browserMinutes} assumed, at no platform cost (see assumptions).`,
    );
  }
  console.log('');
}

console.log('## Summary across profiles\n');
console.log(
  '| Profile | Plan | Price | Provider COGS | Credits | Share of monthly credits | Infrastructure | Gross margin at list price |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const result of results) {
  console.log(
    `| ${result.profile.name} | ${planLabel(result.profile.planTier)} | ${usd(result.priceMicrousd)} | ${usd(result.providerMicrousd)} | ${creditCount(result.credits)} | ${pct(result.allowanceShare)} | ${usd(result.infrastructureMicrousd)} | ${pct(result.marginShare)} |`,
  );
}
console.log('');

const iosCommissionShare =
  MOBILE_IAP_STORE_COMMISSION.ios.subscriptionFirstYearBasisPoints / BASIS_POINTS_PER_WHOLE;
const storeMonthlyPlans = new Set(
  MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
    (definition) => definition.kind === 'subscription' && definition.interval === 'monthly',
  ).map((definition) => definition.planTier),
);

console.log('## Gross margin per plan\n');
console.log(
  `Worst case: the whole monthly allowance spent at ${usd(MICROUSD_PER_CREDIT, 3)} a credit, plus the platform share at ${count(ASSUMED_ACTIVE_ACCOUNTS)} active accounts. "With included search" adds the ${INCLUDED_SEARCH_CALLS} interactive search calls a month that draw no credits, at the dearest included rate (${usd(INCLUDED_SEARCH_MICROUSD)}). "Yearly billing" uses the yearly price spread over ${MONTHS_PER_YEAR} months. "App Store, first year" takes ${pct(iosCommissionShare)} commission off the list price. Per-use infrastructure rows come to at most ${usd(maxPerUseInfrastructureMicrousd)} a month in any modeled profile and are not in the worst case. Margins are shares of the monthly list price, except yearly billing, which is a share of the yearly price per month.\n`,
);
console.log(
  '| Plan | Price | Monthly credits | Modeled profiles at list price | Worst-case cost | Worst-case margin | With included search | Yearly billing | App Store, first year |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const planTier of SELF_SERVE_PAID_PLAN_TIERS) {
  const price = planPriceMicrousd(planTier);
  const worstCost = allowanceMicrousd(planTier) + PLATFORM_SHARE_MICROUSD;
  const onPlan = results.filter((result) => result.profile.planTier === planTier);
  const modeled =
    onPlan.length === 0
      ? 'none modeled'
      : onPlan.map((result) => `${result.profile.name} ${pct(result.marginShare)}`).join(', ');
  const yearlyPrice = planPriceMicrousd(planTier, 'yearly');
  const yearly = yearlyPrice > 0 ? pct((yearlyPrice - worstCost) / yearlyPrice) : 'not offered';
  const store = storeMonthlyPlans.has(planTier)
    ? pct((price * (1 - iosCommissionShare) - worstCost) / price)
    : 'not sold in the store';
  console.log(
    `| ${planLabel(planTier)} (${planTier}) | ${usd(price)} | ${count(monthlyCredits(planTier))} | ${modeled} | ${usd(worstCost)} | ${pct((price - worstCost) / price)} | ${pct((price - worstCost - INCLUDED_SEARCH_MICROUSD) / price)} | ${yearly} | ${store} |`,
  );
}
