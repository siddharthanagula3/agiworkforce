#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
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
  topUps: 'packages/contracts/types/src/billing-topups.ts',
  storeCommission: 'packages/contracts/types/src/mobile-iap.ts',
  tierPolicies: 'packages/contracts/types/src/model-catalog.ts',
  modelPrices: 'packages/ai/model-registry/generated/registry.json',
  cacheWritePremium: 'apps/web/lib/services/llm-cost-calculator.ts',
  includedSearch: 'apps/web/lib/web-search/search-budget.ts',
  groundingPool: 'apps/web/lib/web-search/web-search-pricing.json',
  regionalPricing: 'apps/web/lib/regional-pricing.ts',
  pricePoints: 'apps/web/lib/pricing.ts',
  liveVoiceBilling: 'apps/web/lib/voice/live-voice-billing.ts',
  freePools: 'apps/web/config/free-pools.json',
  freeSandbox: 'apps/web/lib/e2b/compute-metering.ts',
  guestChat: 'apps/web/lib/guest-chat/config.ts',
  rateLimits: 'apps/web/lib/rate-limit.ts',
  euAccess: 'apps/web/lib/eu-access.ts',
  flyRelay: 'services/signaling-server/fly.toml',
  flyScanner: 'services/upload-scanner/fly.toml',
};

const VOICE_BRANCH = {
  branch: 'fix/voice-conversation',
  meteringCommit: '1ffb43f575',
  backendUsageCommit: '369f4443f0',
  freeBackendSlot: 'voice_live_backend_free',
  freeBackendFamily: 'openai/gpt-fast',
  note: 'Owner decision D1 of 2026-10-10: live voice is metered in plan voice minutes and no longer draws the managed-usage credit windows; the close route books provider cost, session minutes and delegated backend tokens with no customer charge. Not merged to main on 2026-10-10.',
};

const OBSERVED_ON = '2026-10-10';

const EXTERNAL = {
  stripeUs: {
    url: 'https://stripe.com/pricing',
    readOn: OBSERVED_ON,
    domesticCardShare: 0.029,
    fixedUsd: 0.3,
    internationalCardShare: 0.015,
    currencyConversionShare: 0.01,
    billingShare: 0.007,
    taxShare: 0.005,
  },
  stripeIndia: {
    url: 'https://stripe.com/in/pricing',
    readOn: OBSERVED_ON,
    domesticCardShare: 0.02,
    internationalCardShare: 0.03,
    currencyConversionShare: 0.02,
  },
  apple: {
    url: 'https://developer.apple.com/app-store/subscriptions/',
    smallBusinessUrl: 'https://developer.apple.com/app-store/small-business-program/',
    readOn: OBSERVED_ON,
    smallBusinessShare: 0.15,
    smallBusinessThresholdUsd: 1_000_000,
  },
  googlePlay: {
    url: 'https://support.google.com/googleplay/android-developer/answer/112622',
    readOn: OBSERVED_ON,
    subscriptionShare: 0.15,
    oneTimeNewInstallUsShare: 0.25,
    note: 'US, EEA and UK from 2026-06-30: subscriptions 10% plus 5% billing fee; other transactions on new installs 20% plus 5% for the first $1M; remaining markets 15%.',
  },
  fx: {
    url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    readOn: OBSERVED_ON,
    referenceDate: '2026-10-09',
    eurUsd: 1.1206,
    eurInr: 108.3965,
  },
  fly: {
    url: 'https://docs.fly.io/about/pricing',
    readOn: OBSERVED_ON,
    sharedCpu1x1GbUsdPerMonth: 6.7,
    sharedCpu2x2GbUsdPerMonth: 13.39,
    additionalRamUsdPerGbMonth: 6,
    note: 'Ashburn and Secaucus base prices; the apps run in sjc, whose regional premium is not stated in the page text.',
  },
  e2b: {
    url: 'https://e2b.dev/pricing',
    readOn: OBSERVED_ON,
    proUsdPerMonth: 150,
    hobbyConcurrentSandboxes: 20,
    hobbyMaxSessionHours: 1,
  },
  neon: {
    url: 'https://neon.com/pricing',
    readOn: OBSERVED_ON,
    freeCuHoursPerProject: 100,
    launchUsdPerCuHour: 0.106,
    scaleUsdPerCuHour: 0.222,
    storageUsdPerGbMonth: 0.35,
  },
  clerk: {
    url: 'https://clerk.com/pricing',
    readOn: OBSERVED_ON,
    freeMonthlyRetainedUsers: 50_000,
  },
  developerPrograms: {
    appleUrl: 'https://developer.apple.com/programs/',
    googleUrl: 'https://support.google.com/googleplay/android-developer/answer/6112435',
    readOn: OBSERVED_ON,
    appleUsdPerYear: 99,
    googleUsdOneTime: 25,
  },
  liveVoice: {
    url: 'https://developers.openai.com/api/docs/pricing',
    readOn: OBSERVED_ON,
    note: 'gpt-live sessions are billed per second at the published per-minute rate; backend model and tool usage are billed separately.',
    alternativeUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    alternativeAudioInUsdPerMinute: 0.005,
    alternativeAudioOutUsdPerMinute: 0.018,
    alternativeLabel: 'Google 3.8 Live audio rates, paid tier',
  },
  wages: {
    supportUrl:
      'https://www.bls.gov/ooh/office-and-administrative-support/customer-service-representatives.htm',
    engineeringUrl:
      'https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm',
    readOn: OBSERVED_ON,
    supportUsdPerHour: 21.53,
    engineeringUsdPerYear: 135_980,
    dataPeriod: 'May 2025',
  },
  marginBenchmark: {
    url: 'https://www.bvp.com/atlas/the-state-of-ai-2025',
    readOn: OBSERVED_ON,
    shootingStarGrossMargin: 0.6,
    supernovaGrossMargin: 0.25,
  },
};

const PARAMS = {
  activeAccounts: 1_000,
  targetGrossMargin: 0.5,
  supersededTokenBudgetMargin: EXTERNAL.marginBenchmark.shootingStarGrossMargin,
  daysPerMonth: 365.25 / 12,
  stripeAccountCountry: 'US',
  stripeTaxRegistered: true,
  indiaStoreTaxShareIncluded: 0.18,
  iosCommission: 'first_year',
  unlimitedStorageGibAssumed: 100,
  paidEgressMatchesFreeDailyCap: true,
  voiceHumanHoursPerDay: 8,
  voiceBackend: {
    worst: {
      delegationsPerMinute: 2,
      inputTokens: 6_000,
      cachedShare: 0.5,
      outputTokens: 600,
      searchesPerMinute: 0.5,
    },
    typical: {
      delegationsPerMinute: 0.3,
      inputTokens: 4_000,
      cachedShare: 0.5,
      outputTokens: 300,
      searchesPerMinute: 0.05,
    },
  },
  deepResearchRun: {
    groundedSearches: 40,
    steps: 30,
    inputTokens: 20_000,
    outputTokens: 2_000,
    cacheHitShare: 0.3,
  },
  referenceTurn: { inputTokens: 6_000, outputTokens: 1_000 },
  longContextTurn: { inputTokens: 300_000, outputTokens: 2_000 },
  freeMediaVideoSecondsPerGeneration: 8,
  typicalStorageGib: 0.5,
  typicalEgressGib: 1,
  supportMinutesPerPayingUser: 5,
  supportLoadedMultiplier: 1.25,
  engineeringFte: 1,
  freeUsersPerPayingUser: 10,
  leanStorageCostShareOfPrice: 0.01,
  leanDownloadCostShareOfPrice: 0.03,
  leanDailyMessages: 300,
  leanDailyEmails: 5,
  weeklyShareOfMonthly: 0.25,
  fiveHourShareOfMonthly: 0.025,
  minimumFiveHourVoiceMinutes: 1,
  uiVideoSeconds: 8,
  freeAcquisitionShareOfContribution: 0.25,
  freeDailyDownloadMiB: 20,
  freeDailyEmails: 1,
  everydayMessage: {
    base: { inputTokens: 1_500, outputTokens: 400, cachedShare: 0.4 },
    long: { share: 0.03, inputTokens: 150_000, outputTokens: 800, cachedShare: 0.5 },
    veryLong: { share: 0.005, inputTokens: 300_000, outputTokens: 1_000, cachedShare: 0.5 },
  },
  proposedRouting: {
    everydayFamily: 'openai/gpt-fast',
    backupFamily: 'qwen/qwen-flash',
    everydayTasks: ['simple_chat', 'general', 'creative_writing', 'research'],
    hardFamilies: {
      coding: 'slot:coding_balanced',
      agentic: 'slot:coding_balanced',
      'computer-use': 'slot:computer_use_balanced',
      reasoning: 'openai/gpt-balanced',
      long_context: 'openai/gpt-balanced',
    },
    flagshipFamilies: { coding: 'slot:flagship_coding', default: 'openai/gpt-frontier' },
    maxManualFlagshipShareOfHardTurns: 0.15,
  },
  uiVoiceCreditsPerMinute: 13,
  profileMixByPlan: {
    basic: { Light: 1 },
    pro: { Normal: 0.8, 'Research heavy': 0.2 },
    max: { Power: 0.7, 'Coding heavy': 0.3 },
    max_15x: {
      '95th percentile': 0.4,
      'Desktop agent heavy': 0.3,
      'Multimodal heavy': 0.2,
      'Automated or abusive': 0.1,
    },
    team: { Normal: 1 },
    team_premium: { Power: 1 },
  },
  planMixForAverage: { basic: 0.3, pro: 0.55, max: 0.1, max_15x: 0.05 },
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

function lineOf(relPath, pattern) {
  const lines = readSource(relPath).split('\n');
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) throw new Error(`could not find ${pattern} in ${relPath}`);
  return `${relPath}:${index + 1}`;
}

function importSource(relPath) {
  return import(pathToFileURL(sourcePath(relPath)).href);
}

const argv = process.argv.slice(2);
function argValue(flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : argv[index + 1];
}
const paramsOverridePath = argValue('--params');
if (paramsOverridePath) Object.assign(PARAMS, JSON.parse(readFileSync(paramsOverridePath, 'utf8')));
const jsonOutPath = argValue('--json');

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
const {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  BILLING_PLAN_PRODUCT_LIMITS,
  FREE_DAILY_CAPS,
  FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD,
  MIN_PURCHASABLE_SEATS,
} = await importSource(SOURCES.plans);
const { TOP_UP_UNITS_PER_USD, quoteTopUp } = await importSource(SOURCES.topUps);
const { BASIS_POINTS_PER_WHOLE, MOBILE_IAP_PRODUCT_DEFINITIONS, MOBILE_IAP_STORE_COMMISSION } =
  await importSource(SOURCES.storeCommission);
const registry = JSON.parse(readSource(SOURCES.modelPrices));
const groundingPool = JSON.parse(readSource(SOURCES.groundingPool)).googleGrounding.currentTier;
const freePools = JSON.parse(readSource(SOURCES.freePools));
const auto = registry.policies.auto;

const CACHE_WRITE_PREMIUM = readDeclaredNumber(
  SOURCES.cacheWritePremium,
  /CACHE_WRITE_FALLBACK_MULTIPLIERS = \{\s*write5m: ([0-9.]+)/,
);
const FREE_INCLUDED_SEARCH_CALLS = readDeclaredNumber(
  SOURCES.includedSearch,
  /FREE_PLAN_MONTHLY_SEARCH_CALLS = ([0-9_]+)/,
);
const PAID_INCLUDED_SEARCH_CALLS = readDeclaredNumber(
  SOURCES.includedSearch,
  /\?\s*FREE_PLAN_MONTHLY_SEARCH_CALLS\s*:\s*([0-9_]+)/,
);
const LIVE_SESSION_BLOCK_MINUTES = readDeclaredNumber(
  SOURCES.liveVoiceBilling,
  /LIVE_SESSION_BLOCK_MINUTES = ([0-9_]+)/,
);
const GUEST_DAILY_SPEND_MICROUSD = readDeclaredNumber(
  SOURCES.guestChat,
  /globalSpendMicrousdPerDay: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(([0-9_]+)\)/,
);
const CHAT_MESSAGES_PER_MINUTE = readDeclaredNumber(
  SOURCES.rateLimits,
  /'chat-message': \{\s*limit: ([0-9_]+),/,
);

function parseIndiaMonthlyPrices() {
  const block = readSource(SOURCES.regionalPricing).match(
    /INDIA_MONTHLY_PRICE_MINOR[^{]*\{([^}]*)\}/,
  );
  if (!block) throw new Error(`no India price table in ${SOURCES.regionalPricing}`);
  return Object.fromEntries(
    [...block[1].matchAll(/(\w+): ([0-9_]+)/g)].map(([, plan, minor]) => [
      plan,
      Number(minor.replace(/_/g, '')),
    ]),
  );
}
const INDIA_MONTHLY_PRICE_MINOR = parseIndiaMonthlyPrices();
for (const [plan, minor] of Object.entries(INDIA_MONTHLY_PRICE_MINOR)) {
  const catalog = BILLING_PLAN_PRICING[plan]?.monthlyPriceInr;
  if (catalog * 100 !== minor) {
    throw new Error(`India price for ${plan} differs: ${minor} minor units vs catalog ${catalog}`);
  }
}

const STRIPE_PRICE_POINTS = [
  ...readSource(SOURCES.pricePoints).matchAll(
    /\{\s*plan: '(\w+)',\s*interval: '(\w+)',\s*currency: '(\w+)',\s*envVar: '(\w+)',?\s*\}/g,
  ),
].map(([, plan, interval, currency, envVar]) => ({ plan, interval, currency, envVar }));

function parseTierPolicies() {
  const text = readSource(SOURCES.tierPolicies);
  const start = text.indexOf('const TIER_POLICIES_DEFINITION');
  const end = text.indexOf('function deepFreezeTierPolicy');
  if (start === -1 || end === -1) throw new Error('no TIER_POLICIES_DEFINITION block');
  const block = text.slice(start, end);
  const policies = {};
  for (const match of block.matchAll(/\n {2}(\w+): \{\n {4}tier: '(\w+)',([\s\S]*?)\n {2}\},/g)) {
    const body = match[3];
    const number = (key) => {
      const found = body.match(new RegExp(`\\n {4}${key}: ([0-9_]+|null),`));
      if (!found) return undefined;
      return found[1] === 'null' ? null : Number(found[1].replace(/_/g, ''));
    };
    const slots = body.match(/allowedSlots: \[([\s\S]*?)\]/);
    policies[match[2]] = {
      allowVoice: /\n {4}allowVoice: true,/.test(body),
      voiceMinutesPerMonth: number('voiceMinutesPerMonth'),
      videoSecondsPerMonth: number('videoSecondsPerMonth'),
      computerUseHardCap: number('computerUseHardCap'),
      allowedSlots: slots ? [...slots[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]) : [],
    };
  }
  const mapping = {};
  const fn = text.match(/function normalizeProductTier[\s\S]*?\n\}/);
  if (!fn) throw new Error('no normalizeProductTier');
  let pending = [];
  for (const line of fn[0].split('\n')) {
    const caseMatch = line.match(/case '([^']+)':/);
    if (caseMatch) pending.push(caseMatch[1]);
    const returnMatch = line.match(/return '(\w+)';/);
    if (returnMatch) {
      for (const key of pending) mapping[key] = returnMatch[1];
      pending = [];
    }
  }
  return { policies, mapping };
}
const TIER_POLICY_TEXT = parseTierPolicies();

function productTierOf(planTier) {
  return TIER_POLICY_TEXT.mapping[planTier] ?? 'free';
}

function tierPolicy(planTier) {
  return TIER_POLICY_TEXT.policies[productTierOf(planTier)];
}

function parseFlyMachine(relPath) {
  const text = readSource(relPath);
  const app = text.match(/^app = '([^']+)'/m)?.[1];
  const cpus = Number(text.match(/^\s*cpus = (\d+)/m)?.[1]);
  const memoryMb = text.match(/memory_mb = (\d+)/)?.[1];
  const memoryGb = text.match(/memory = '(\d+)gb'/)?.[1];
  const minRunning = Number(text.match(/min_machines_running = (\d+)/)?.[1] ?? 0);
  const ramGb = memoryMb ? Number(memoryMb) / 1024 : Number(memoryGb);
  const includedRamGb = cpus === 1 ? 1 : 2;
  const base =
    cpus === 1 ? EXTERNAL.fly.sharedCpu1x1GbUsdPerMonth : EXTERNAL.fly.sharedCpu2x2GbUsdPerMonth;
  const usdPerMonth =
    minRunning *
    (base + Math.max(0, ramGb - includedRamGb) * EXTERNAL.fly.additionalRamUsdPerGbMonth);
  return { app, cpus, ramGb, minRunning, usdPerMonth, source: relPath };
}

const DAYS = PARAMS.daysPerMonth;
const TOKENS_PER_PRICED_UNIT = 1_000_000;
const SECONDS_PER_MINUTE = 60;
const MIB_PER_GIB = 1_024;
const BYTES_PER_GIB = 1024 ** 3;
const MONTHS_PER_YEAR = 12;
const USD_PER_CREDIT = MICROUSD_PER_CREDIT / MICROUSD_PER_USD;
const INR_PER_USD = EXTERNAL.fx.eurInr / EXTERNAL.fx.eurUsd;
const ACTIVE_ACCOUNT_SENSITIVITY = [PARAMS.activeAccounts / 10, PARAMS.activeAccounts * 10];

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

function rateCardUsd(feature) {
  return rateCardMicrousd(feature) / MICROUSD_PER_USD;
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
const DEAREST_INCLUDED_SEARCH_MICROUSD = Math.max(
  ...INCLUDED_SEARCH_FEATURES.map(rateCardMicrousd),
);

const routesByModelKey = new Map();
for (const [routeId, route] of Object.entries(registry.routes)) {
  routesByModelKey.set(route.modelKey, [
    ...(routesByModelKey.get(route.modelKey) ?? []),
    { routeId, ...route },
  ]);
}

function modelRoute(modelKey) {
  const routes = routesByModelKey.get(modelKey) ?? [];
  const route = routes.find((candidate) => candidate.isDefault) ?? routes[0];
  if (!route) throw new Error(`no registry route for model key ${modelKey}`);
  return route;
}

function slotRoute(slotId) {
  const modelKey = auto.slots[slotId]?.modelKey;
  if (!modelKey) throw new Error(`no routing slot ${slotId}`);
  return modelRoute(modelKey);
}

function proposedRoute(reference) {
  return reference.startsWith('slot:')
    ? slotRoute(reference.slice('slot:'.length))
    : familyRoute(reference);
}

function familyRoute(familyKey) {
  const modelKey = registry.families[familyKey]?.activeModelKey;
  if (!modelKey) throw new Error(`no model family ${familyKey}`);
  return modelRoute(modelKey);
}

const imageRoute = slotRoute('image_generation');
const IMAGE_MICROUSD =
  imageRoute.pricing.imagePerImage > 0
    ? Math.ceil(imageRoute.pricing.imagePerImage * MICROUSD_PER_USD)
    : rateCardMicrousd(`image_generation_${imageRoute.provider}`);

const videoRoute = slotRoute('video_generation');
const videoLiteRoute = familyRoute('google/veo-lite');

function videoMicrousdPerSecond(resolution, route = videoRoute) {
  const usd = route.pricing.videoPerSecondByResolution?.[resolution];
  if (!(usd > 0)) throw new Error(`no video rate declared for resolution ${resolution}`);
  return usd * MICROUSD_PER_USD;
}

const ROUTING_TIER_BY_PLAN = {
  basic: 'basic',
  pro: 'pro',
  team: 'pro',
  max: 'max',
  max_15x: 'max',
  team_premium: 'max',
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

function tokenPricesFor(route, inputTokens) {
  const tiers = route.pricing.inputTokenPricingTiers ?? [];
  const tier = [...tiers].reverse().find((candidate) => inputTokens > candidate.thresholdTokens);
  return tier
    ? {
        inputPerMillion: tier.inputPerMillion,
        outputPerMillion: tier.outputPerMillion,
        cacheReadPerMillion: tier.cacheReadPerMillion ?? route.pricing.cacheReadPerMillion,
      }
    : route.pricing;
}

function turnUsd(route, inputTokens, outputTokens, cachedShare = 0) {
  const prices = tokenPricesFor(route, inputTokens);
  const cached = inputTokens * cachedShare;
  const fresh = inputTokens - cached;
  return (
    (fresh * prices.inputPerMillion +
      cached * (prices.cacheReadPerMillion ?? prices.inputPerMillion) +
      outputTokens * prices.outputPerMillion) /
    TOKENS_PER_PRICED_UNIT
  );
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

const FLY_MACHINES = [parseFlyMachine(SOURCES.flyRelay), parseFlyMachine(SOURCES.flyScanner)];

const FIXED_MONTHLY = [
  ...PLATFORM_FEE_ROWS.filter(([, row]) => row.unit === 'month').map(([feature, row]) => ({
    id: feature,
    vendor: row.vendor,
    usdPerMonth: rateCardUsd(feature),
    basis: 'committed rate card row',
    source: `${SOURCES.rateCard} (${row.source}, verified ${row.verifiedOn})`,
    owner_confirm: true,
  })),
  ...FLY_MACHINES.map((machine) => ({
    id: `fly_${machine.app}`,
    vendor: 'fly',
    usdPerMonth: machine.usdPerMonth,
    basis: `${machine.minRunning} always-on shared-cpu-${machine.cpus}x machine with ${machine.ramGb} GB at the base-region price`,
    source: `${machine.source}; ${EXTERNAL.fly.url} read ${EXTERNAL.fly.readOn}`,
    owner_confirm: true,
  })),
  {
    id: 'e2b_pro',
    vendor: 'e2b',
    usdPerMonth: EXTERNAL.e2b.proUsdPerMonth,
    basis: `Hobby allows ${EXTERNAL.e2b.hobbyConcurrentSandboxes} concurrent sandboxes for the whole platform; plans grant up to 5 per user, so paid launch needs Pro`,
    source: `${EXTERNAL.e2b.url} read ${EXTERNAL.e2b.readOn}`,
    owner_confirm: true,
  },
  {
    id: 'apple_developer_program',
    vendor: 'apple',
    usdPerMonth: EXTERNAL.developerPrograms.appleUsdPerYear / MONTHS_PER_YEAR,
    basis: '$99 a year, also covers macOS signing and notarization in release-desktop-cloud.yml',
    source: `${EXTERNAL.developerPrograms.appleUrl} read ${OBSERVED_ON}`,
    owner_confirm: false,
  },
  {
    id: 'neon_database',
    vendor: 'neon',
    usdPerMonth: 0,
    basis: `Free plan per the owner (${EXTERNAL.neon.freeCuHoursPerProject} CU-hours a project, compute suspends when spent); AGI_DB_LOW_POWER keeps crons inside 15 minutes an hour. Launch is $${EXTERNAL.neon.launchUsdPerCuHour} per CU-hour with no minimum`,
    source: `apps/web/.env.example AGI_DB_LOW_POWER; docs/runbooks/capacity-and-load-testing.md; ${EXTERNAL.neon.url} read ${OBSERVED_ON}`,
    owner_confirm: true,
  },
  {
    id: 'upstash_redis',
    vendor: 'upstash',
    usdPerMonth: 0,
    basis: 'pay as you go with no base fee; per-command cost is in the per-turn footprint',
    source: `${SOURCES.rateCard} cache_command_request`,
    owner_confirm: false,
  },
  {
    id: 'cloudflare_r2',
    vendor: 'cloudflare_r2',
    usdPerMonth: 0,
    basis: 'no base fee; storage is priced per GiB-month in the per-user rows',
    source: `${SOURCES.rateCard} object_storage_gib_month`,
    owner_confirm: false,
  },
];

const FIXED_UNKNOWN = [
  { id: 'domain', note: 'registrar and renewal price are not recorded in the repository' },
  { id: 'github', note: 'plan and Actions minutes are not recorded in the repository' },
  {
    id: 'google_play_developer',
    note: `$${EXTERNAL.developerPrograms.googleUsdOneTime} one-time registration (${EXTERNAL.developerPrograms.googleUrl}); not a monthly cost`,
  },
];

const GUEST_CHAT_WORST_MONTHLY_USD = (GUEST_DAILY_SPEND_MICROUSD / MICROUSD_PER_USD) * DAYS;

function fixedMonthlyUsd() {
  return FIXED_MONTHLY.reduce((sum, row) => sum + row.usdPerMonth, 0);
}

function authShareUsd(activeAccounts) {
  const clerkMonthly = PLATFORM_FEE_ROWS.filter(([, row]) => row.vendor === 'clerk').reduce(
    (sum, [feature, row]) => {
      const rate = rateCardUsd(feature);
      if (row.unit === 'month') return sum + rate;
      return sum + Math.max(0, activeAccounts - (row.includedPerMonth ?? 0)) * rate;
    },
    0,
  );
  return clerkMonthly / activeAccounts;
}

function infraShareUsd(activeAccounts) {
  const clerk = FIXED_MONTHLY.filter((row) => row.vendor === 'clerk').reduce(
    (sum, row) => sum + row.usdPerMonth,
    0,
  );
  return (fixedMonthlyUsd() - clerk) / activeAccounts;
}

function monthlyCredits(planTier) {
  return MANAGED_USAGE_LIMITS[planTier].monthlyCredits;
}

function bindingMonthlyCredits(planTier) {
  const limit = MANAGED_USAGE_LIMITS[planTier];
  if (limit.unlimited) return Infinity;
  const weeks = DAYS / 7;
  const fiveHourWindows = (DAYS * 24) / 5;
  return Math.min(
    limit.monthlyCredits,
    limit.weeklyCredits * weeks,
    limit.fiveHourCredits * fiveHourWindows,
  );
}

function poolUsd(planTier) {
  return bindingMonthlyCredits(planTier) * USD_PER_CREDIT;
}

function planLabel(planTier) {
  return BILLING_PLAN_PRICING[planTier].label;
}

const LIVE_ROUTE = slotRoute('voice_live');
const LIVE_USD_PER_MINUTE = LIVE_ROUTE.pricing.sessionPerMinute;
if (!(LIVE_USD_PER_MINUTE > 0)) throw new Error('voice_live slot declares no session rate');
const PAID_BACKEND_ROUTE = slotRoute('voice_live_backend');
const FREE_BACKEND_ROUTE = familyRoute(VOICE_BRANCH.freeBackendFamily);

function backendUsdPerMinute(route, profile) {
  return (
    profile.delegationsPerMinute *
      turnUsd(route, profile.inputTokens, profile.outputTokens, profile.cachedShare) +
    profile.searchesPerMinute * rateCardUsd('web_search_openai')
  );
}

function voiceBackendRoute(planTier, scenario) {
  return scenario !== 'main' && planTier === 'free' ? FREE_BACKEND_ROUTE : PAID_BACKEND_ROUTE;
}

function voiceUsdPerMinute(planTier, scenario, level) {
  return (
    LIVE_USD_PER_MINUTE +
    backendUsdPerMinute(voiceBackendRoute(planTier, scenario), PARAMS.voiceBackend[level])
  );
}

function voiceMinutesCap(planTier) {
  const policy = tierPolicy(planTier);
  if (!policy?.allowVoice) return 0;
  return policy.voiceMinutesPerMonth;
}

const VOICE_CONTINUOUS_MINUTES = DAYS * 24 * 60;
const VOICE_HUMAN_MINUTES = DAYS * PARAMS.voiceHumanHoursPerDay * 60;

const ALTERNATIVE_VOICE_USD_PER_MINUTE =
  EXTERNAL.liveVoice.alternativeAudioInUsdPerMinute +
  EXTERNAL.liveVoice.alternativeAudioOutUsdPerMinute;

const DEEP_RESEARCH_RUN_USD = (() => {
  const run = PARAMS.deepResearchRun;
  const route = slotRoute('search_premium');
  return (
    run.groundedSearches * rateCardUsd('web_search_grounding') +
    run.steps * turnUsd(route, run.inputTokens, run.outputTokens, run.cacheHitShare)
  );
})();

function tierSlots(planTier) {
  const registrySlots = auto.tierAllowedSlots[routingTier(planTier)] ?? [];
  const policySlots = tierPolicy(planTier)?.allowedSlots ?? [];
  return [...new Set([...registrySlots, ...policySlots])].filter(
    (slot) => auto.slots[slot]?.modelKey,
  );
}

const CHAT_MODEL_KINDS = new Set(['chat', 'multimodal', 'reasoning', 'code']);

function dearestChatSlot(planTier) {
  const candidates = tierSlots(planTier)
    .filter((slot) => !slot.startsWith('voice_'))
    .map((slot) => ({ slot, route: slotRoute(slot) }))
    .filter(
      ({ route }) =>
        CHAT_MODEL_KINDS.has(registry.models[route.modelKey]?.identity.kind) &&
        route.pricing.unit === 'per_million_tokens' &&
        route.pricing.outputPerMillion > 0,
    );
  if (candidates.length === 0) return null;
  const scored = candidates.map((candidate) => ({
    ...candidate,
    referenceTurnUsd: turnUsd(
      candidate.route,
      PARAMS.referenceTurn.inputTokens,
      PARAMS.referenceTurn.outputTokens,
    ),
    longContextTurnUsd: turnUsd(
      candidate.route,
      PARAMS.longContextTurn.inputTokens,
      PARAMS.longContextTurn.outputTokens,
    ),
  }));
  return scored.sort((a, b) => b.referenceTurnUsd - a.referenceTurnUsd)[0];
}

function freeMediaOffer() {
  return freePools.limitedMediaOffer?.dailyCapPerUser ?? { image: 0, video: 0 };
}

function freePoolExpiries() {
  const byDate = {};
  for (const entry of freePools.inventory?.entries ?? []) {
    const date = entry.expiresOn ?? new Date(entry.expiresAtMs).toISOString().slice(0, 10);
    byDate[date] = (byDate[date] ?? 0) + 1;
  }
  const totals = {};
  for (const entry of freePools.inventory?.entries ?? []) {
    totals[entry.unit] = (totals[entry.unit] ?? 0) + (entry.limit ?? 0);
  }
  const dates = Object.keys(byDate).sort();
  const live = dates.filter((date) => date >= OBSERVED_ON);
  const largest = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
  return {
    entries: freePools.inventory?.entries?.length ?? 0,
    totals,
    byDate,
    largestExpiry: { date: largest?.[0], entries: largest?.[1] },
    lastExpiry: live.at(-1) ?? null,
    termsReviewExpires: new Date(freePools.inventory?.termsReview?.expiresAtMs)
      .toISOString()
      .slice(0, 10),
    spendOnCapacityShortage: freePools.inventory?.freeAutoFallback?.spendOnCapacityShortage,
    modelStudioEntries: freePools.entries.map((entry) => ({
      route: entry.routeId,
      limit: entry.limit,
      unit: entry.unit,
      expires: new Date(entry.expiresAtMs).toISOString().slice(0, 10),
      hardStopsBeforePaid: entry.hardStopsBeforePaid,
    })),
  };
}

const PLAN_ORDER = ['free', 'basic', 'pro', 'max', 'max_15x', 'team', 'team_premium', 'enterprise'];
const STORE_PLANS = new Set(
  MOBILE_IAP_PRODUCT_DEFINITIONS.filter((definition) => definition.kind === 'subscription').map(
    (definition) => definition.planTier,
  ),
);

const REGIONS = {
  us: {
    label: 'United States, USD, domestic card',
    stripeCardShare: EXTERNAL.stripeUs.domesticCardShare,
  },
  intl_usd: {
    label: 'Rest of served world, USD, international card',
    stripeCardShare: EXTERNAL.stripeUs.domesticCardShare + EXTERNAL.stripeUs.internationalCardShare,
  },
  in: {
    label: 'India, INR, Indian card on a US Stripe account',
    stripeCardShare:
      EXTERNAL.stripeUs.domesticCardShare +
      EXTERNAL.stripeUs.internationalCardShare +
      EXTERNAL.stripeUs.currencyConversionShare,
  },
};

function stripeFee(priceUsd, region, interval) {
  const share =
    REGIONS[region].stripeCardShare +
    EXTERNAL.stripeUs.billingShare +
    (PARAMS.stripeTaxRegistered ? EXTERNAL.stripeUs.taxShare : 0);
  const fixed =
    interval === 'yearly'
      ? EXTERNAL.stripeUs.fixedUsd / MONTHS_PER_YEAR
      : EXTERNAL.stripeUs.fixedUsd;
  return priceUsd * share + fixed;
}

function iosShare() {
  const commission = MOBILE_IAP_STORE_COMMISSION.ios;
  if (PARAMS.iosCommission === 'small_business') return EXTERNAL.apple.smallBusinessShare;
  if (PARAMS.iosCommission === 'after_first_year')
    return commission.subscriptionAfterFirstYearBasisPoints / BASIS_POINTS_PER_WHOLE;
  return commission.subscriptionFirstYearBasisPoints / BASIS_POINTS_PER_WHOLE;
}

function androidShare() {
  return (
    MOBILE_IAP_STORE_COMMISSION.android.subscriptionFirstYearBasisPoints / BASIS_POINTS_PER_WHOLE
  );
}

function pricePointsFor(planTier) {
  const pricing = BILLING_PLAN_PRICING[planTier];
  if (pricing.contractPriced || !(pricing.monthlyPriceUsd > 0)) return [];
  const points = [];
  const inrMinor = INDIA_MONTHLY_PRICE_MINOR[planTier];
  const inrCheckoutPricePoint = STRIPE_PRICE_POINTS.some(
    (point) => point.plan === planTier && point.currency === 'inr',
  );
  const push = (region, channel, interval, priceUsd, extra = {}) => {
    const fee = channel === 'web' ? stripeFee(priceUsd, region, interval) : 0;
    const storeTaxShare =
      channel !== 'web' && region === 'in' ? PARAMS.indiaStoreTaxShareIncluded : 0;
    const netOfTax = priceUsd / (1 + storeTaxShare);
    const share = channel === 'ios' ? iosShare() : channel === 'android' ? androidShare() : 0;
    const commission = netOfTax * share;
    points.push({
      region,
      channel,
      interval,
      priceUsd,
      paymentFeeUsd: fee,
      storeTaxUsd: priceUsd - netOfTax,
      storeCommissionUsd: commission,
      netRevenueUsd: netOfTax - fee - commission,
      ...extra,
    });
  };
  for (const region of ['us', 'intl_usd']) {
    push(region, 'web', 'monthly', pricing.monthlyPriceUsd, { currency: 'usd' });
    if (pricing.yearlyPriceUsd > 0) {
      push(region, 'web', 'yearly', pricing.yearlyPriceUsd / MONTHS_PER_YEAR, { currency: 'usd' });
    }
  }
  if (typeof inrMinor === 'number') {
    push('in', 'web', 'monthly', inrMinor / 100 / INR_PER_USD, {
      currency: 'inr',
      localPrice: inrMinor / 100,
      checkoutPricePointInRepo: inrCheckoutPricePoint,
    });
  }
  if (STORE_PLANS.has(planTier)) {
    for (const channel of ['ios', 'android']) {
      push('us', channel, 'monthly', pricing.monthlyPriceUsd, { currency: 'usd' });
      if (typeof inrMinor === 'number') {
        push('in', channel, 'monthly', inrMinor / 100 / INR_PER_USD, {
          currency: 'inr',
          localPrice: inrMinor / 100,
          storePriceAssumed: true,
        });
      }
    }
  }
  return points;
}

function storageGib(planTier) {
  const bytes = BILLING_PLAN_PRODUCT_LIMITS[planTier]?.knowledgeStorageBytes;
  if (typeof bytes === 'number') return { gib: bytes / BYTES_PER_GIB, bounded: true };
  return { gib: PARAMS.unlimitedStorageGibAssumed, bounded: false };
}

const FREE_EGRESS_GIB_PER_MONTH = (FREE_DAILY_CAPS.egressBytes / BYTES_PER_GIB) * DAYS;
const WORST_TURNS_PER_MONTH = FREE_DAILY_CAPS.messageWrites * DAYS;
const WORST_VECTOR_QUERIES = FREE_DAILY_CAPS.vectorQueries * DAYS;
const WORST_EMAILS = FREE_DAILY_CAPS.emailSends * DAYS;
const FREE_SANDBOX_MONTHLY_USD =
  (FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD / MICROUSD_PER_USD) * DAYS;

function generatedMediaWorstUsd(planTier) {
  if (planTier === 'free') {
    const offer = freeMediaOffer();
    const images = offer.image * DAYS;
    const videoSeconds = offer.video * DAYS * PARAMS.freeMediaVideoSecondsPerGeneration;
    return (
      (footprintMicrousd('image', images) + footprintMicrousd('video second', videoSeconds)) /
      MICROUSD_PER_USD
    );
  }
  const pool = poolUsd(planTier) * MICROUSD_PER_USD;
  const images = pool / IMAGE_MICROUSD;
  const viaImages = footprintMicrousd('image', images);
  const canVideo = BILLING_PLAN_CAPABILITY_TIERS.video_generation.includes(planTier);
  const viaVideo = canVideo
    ? footprintMicrousd('video second', pool / videoMicrousdPerSecond('1080p'))
    : 0;
  return Math.max(viaImages, viaVideo) / MICROUSD_PER_USD;
}

function nonPoolWorstLines(planTier, lean = null) {
  const storage = storageGib(planTier);
  const gib = lean?.storageGib ?? storage.gib;
  const egressGib =
    lean?.egressGib ??
    (planTier === 'free' || PARAMS.paidEgressMatchesFreeDailyCap ? FREE_EGRESS_GIB_PER_MONTH : 0);
  const turns = lean ? PARAMS.leanDailyMessages * DAYS : WORST_TURNS_PER_MONTH;
  const emails = lean ? PARAMS.leanDailyEmails * DAYS : WORST_EMAILS;
  const lines = {
    search:
      planTier === 'free'
        ? (FREE_INCLUDED_SEARCH_CALLS * DEAREST_INCLUDED_SEARCH_MICROUSD) / MICROUSD_PER_USD
        : (PAID_INCLUDED_SEARCH_CALLS * DEAREST_INCLUDED_SEARCH_MICROUSD) / MICROUSD_PER_USD,
    sandbox: planTier === 'free' ? FREE_SANDBOX_MONTHLY_USD : 0,
    storage: gib * rateCardUsd('object_storage_gib_month') + generatedMediaWorstUsd(planTier),
    egress: egressGib * rateCardUsd('network_egress_gib'),
    db:
      (footprintMicrousd('turn', turns) +
        WORST_VECTOR_QUERIES * rateCardMicrousd('vector_query_request') +
        emails * rateCardMicrousd('email_message_request')) /
      MICROUSD_PER_USD,
    auth: authShareUsd(PARAMS.activeAccounts),
    infraShare: infraShareUsd(PARAMS.activeAccounts),
  };
  return {
    lines,
    storageBounded: lean !== null || storage.bounded,
    egressBounded: lean !== null || planTier === 'free',
  };
}

function voiceWorst(planTier, scenario, capOverride) {
  const cap = capOverride === undefined ? voiceMinutesCap(planTier) : capOverride;
  const pool = poolUsd(planTier);
  if (scenario === 'pool') {
    const perMinute = voiceUsdPerMinute(planTier, 'pool', 'worst');
    return {
      minutes: Math.min(cap ?? Infinity, pool / perMinute),
      outsidePoolUsd: 0,
      bounded: true,
      formula:
        'single token pool: live minutes and delegated backend tokens both draw credits, so voice adds nothing beyond creditPoolUsd; minutes shown are creditPoolUsd / (liveUsdPerMinute + backendUsdPerMinute(worst))',
    };
  }
  if (scenario === 'main') {
    const reachable = Math.min(cap ?? Infinity, pool / LIVE_USD_PER_MINUTE);
    const backend = backendUsdPerMinute(PAID_BACKEND_ROUTE, PARAMS.voiceBackend.worst);
    return {
      minutes: reachable,
      outsidePoolUsd: reachable * backend,
      bounded: true,
      formula:
        'min(voiceMinutesPerMonth, creditPoolUsd / liveUsdPerMinute) x backendUsdPerMinute(worst); the live minutes themselves are inside the credit pool',
    };
  }
  const minutes = cap === null ? VOICE_HUMAN_MINUTES : cap;
  return {
    minutes,
    outsidePoolUsd: minutes * voiceUsdPerMinute(planTier, scenario, 'worst'),
    continuousSessionUsd:
      cap === null
        ? VOICE_CONTINUOUS_MINUTES * voiceUsdPerMinute(planTier, scenario, 'worst')
        : null,
    bounded: cap !== null,
    formula:
      cap === null
        ? 'no hard bound: one open session per conversation, any number of conversations; shown at voiceHumanHoursPerDay x 60 x daysPerMonth minutes x (liveUsdPerMinute + backendUsdPerMinute(worst)), continuousSessionUsd at 24 hours a day'
        : 'voiceMinutesPerMonth x (liveUsdPerMinute + backendUsdPerMinute(worst))',
  };
}

function evaluate(costLines, point) {
  const costUsd = Object.values(costLines).reduce((sum, value) => sum + value, 0);
  const contributionUsd =
    point.priceUsd - point.storeTaxUsd - point.paymentFeeUsd - point.storeCommissionUsd - costUsd;
  return {
    region: point.region,
    channel: point.channel,
    interval: point.interval,
    priceUsd: round(point.priceUsd),
    localPrice: point.localPrice ?? null,
    currency: point.currency,
    paymentFeeUsd: round(point.paymentFeeUsd),
    storeTaxUsd: round(point.storeTaxUsd),
    storeCommissionUsd: round(point.storeCommissionUsd),
    variableCostUsd: round(costUsd),
    contributionUsd: round(contributionUsd),
    grossMarginPct: round((contributionUsd / point.priceUsd) * 100, 1),
    ...(point.checkoutPricePointInRepo === false ? { checkoutPricePointInRepo: false } : {}),
    ...(point.storePriceAssumed ? { storePriceAssumed: true } : {}),
  };
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return value === Infinity ? 'unbounded' : null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function worstCase(planTier, scenario) {
  const pool = poolUsd(planTier);
  const { lines, storageBounded, egressBounded } = nonPoolWorstLines(planTier);
  const voice = voiceWorst(planTier, scenario);
  const costLines = {
    chat: pool,
    voice: voice.outsidePoolUsd,
    images: 0,
    video: 0,
    ...lines,
  };
  return {
    scenario,
    creditPool: {
      monthlyCredits: monthlyCredits(planTier),
      bindingMonthlyCredits: round(bindingMonthlyCredits(planTier), 1),
      usd: round(pool),
      covers:
        'chat on any reachable model, images, video, paid search, deep research, sandbox and code agent compute, transcription and read-aloud, all at provider cost; the five-hour and weekly windows do not bind below the monthly figure',
    },
    voice: {
      ...voice,
      minutes: round(voice.minutes, 0),
      outsidePoolUsd: round(voice.outsidePoolUsd),
      continuousSessionUsd: round(voice.continuousSessionUsd ?? NaN),
    },
    lineItems: Object.fromEntries(
      Object.entries(costLines).map(([key, value]) => [key, round(value)]),
    ),
    totalCostUsd: round(Object.values(costLines).reduce((sum, value) => sum + value, 0)),
    bounded: voice.bounded && storageBounded && egressBounded,
    unboundedItems: [
      ...(voice.bounded ? [] : ['voice minutes']),
      ...(storageBounded ? [] : ['file storage']),
      ...(egressBounded ? [] : ['file downloads']),
    ],
    byPricePoint: pricePointsFor(planTier).map((point) => evaluate(costLines, point)),
  };
}

const PROFILES = [
  {
    name: 'Free everyday',
    planTier: 'free',
    notes:
      'New for October: a Free account chatting most days on the zero-cost routes, a few searches and a short voice try.',
    turnsPerMonth: 60,
    taskMix: { simple_chat: 1 },
    avgInputTokens: 800,
    avgOutputTokens: 400,
    cacheHitShare: 0,
    cacheWriteShare: 0,
    tools: { webSearchGrounded: 5 },
    retryShare: 0.02,
    gatewayOverheadShare: 0.02,
    voiceMinutes: 5,
  },
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
    voiceMinutes: 0,
  },
  {
    name: 'Normal',
    planTier: 'pro',
    alsoPlans: ['team'],
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
    voiceMinutes: 20,
  },
  {
    name: 'Power',
    planTier: 'max',
    alsoPlans: ['team_premium'],
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
    voiceMinutes: 60,
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
    voiceMinutes: 10,
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
    voiceMinutes: 0,
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
    voiceMinutes: 0,
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
    voiceMinutes: 10,
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
    voiceMinutes: 120,
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
    voiceMinutes: 0,
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

function computeProfile(profile, planTier = profile.planTier) {
  const components = [];
  let chat = 0;
  let chatUncached = 0;
  let chatAtTierMaximum = 0;
  for (const [taskType, share] of Object.entries(profile.taskMix)) {
    const turns = profile.turnsPerMonth * share;
    const slotId =
      planTier === 'free'
        ? (auto.tierAllowedSlots.free ?? [auto.fallbackSlot])[0]
        : admittedSlot(taskType, planTier, taskProfile(taskType));
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
    chatAtTierMaximum +=
      planTier === 'free'
        ? cost
        : chatMicrousd(
            slotRoute(admittedSlot(taskType, planTier, tierMaximumProfile(planTier))),
            turns,
            profile,
            profile.cacheHitShare,
            profile.cacheWriteShare,
          );
    components.push({ label: `chat: ${taskType} (${slotId})`, category: 'chat', microusd: cost });
  }
  const overheadShare = profile.retryShare + profile.gatewayOverheadShare;
  components.push({
    label: `retries + gateway overhead (${Math.round(overheadShare * 100)}%)`,
    category: 'chat',
    microusd: chat * overheadShare,
  });
  const { tools } = profile;
  for (const [tool, { feature, label }] of Object.entries(SEARCH_TOOLS)) {
    if (tools[tool]) {
      components.push({
        label,
        category: 'search',
        microusd: tools[tool] * rateCardMicrousd(feature),
      });
    }
  }
  if (tools.sandboxMinutes) {
    components.push({
      label: 'sandbox compute',
      category: 'sandbox',
      microusd: tools.sandboxMinutes * SANDBOX_MICROUSD_PER_MINUTE,
    });
  }
  const images = tools.imageGenerations ?? 0;
  if (images) {
    components.push({
      label: 'image generation',
      category: 'images',
      microusd: images * IMAGE_MICROUSD,
    });
  }
  const video = tools.videoGenerations;
  const videoSeconds = video ? video.count * video.durationSecs : 0;
  if (video) {
    components.push({
      label: 'video generation',
      category: 'video',
      microusd: videoSeconds * videoMicrousdPerSecond(video.resolution),
    });
  }
  const providerMicrousd = components.reduce((sum, component) => sum + component.microusd, 0);
  const pool = poolUsd(planTier) * MICROUSD_PER_USD;
  const freeIncludedSearch =
    planTier === 'free'
      ? Math.min(tools.webSearchGrounded ?? 0, FREE_INCLUDED_SEARCH_CALLS) *
        rateCardMicrousd('web_search_grounding')
      : 0;
  const poolCharged = providerMicrousd - freeIncludedSearch;
  const coveredShare = poolCharged > pool ? pool / poolCharged : 1;
  const byCategory = { chat: 0, images: 0, video: 0, search: 0, sandbox: 0 };
  for (const component of components) {
    byCategory[component.category] += (component.microusd * coveredShare) / MICROUSD_PER_USD;
  }
  if (coveredShare < 1)
    byCategory.search += (freeIncludedSearch * (1 - coveredShare)) / MICROUSD_PER_USD;
  const voiceUsd = profile.voiceMinutes * voiceUsdPerMinute(planTier, 'branch', 'typical');
  const storage = storageGib(planTier);
  const storageGibUsed = Math.min(PARAMS.typicalStorageGib, storage.gib);
  const lines = {
    chat: byCategory.chat,
    voice: voiceUsd,
    images: byCategory.images,
    video: byCategory.video,
    search: byCategory.search,
    sandbox: byCategory.sandbox,
    storage:
      storageGibUsed * rateCardUsd('object_storage_gib_month') +
      (footprintMicrousd('image', images) + footprintMicrousd('video second', videoSeconds)) /
        MICROUSD_PER_USD,
    egress: PARAMS.typicalEgressGib * rateCardUsd('network_egress_gib'),
    db: footprintMicrousd('turn', profile.turnsPerMonth) / MICROUSD_PER_USD,
    auth: authShareUsd(PARAMS.activeAccounts),
    infraShare: infraShareUsd(PARAMS.activeAccounts),
  };
  const credits = creditsFromMicrousd(poolCharged);
  return {
    profile: profile.name,
    planTier,
    notes: profile.notes,
    usage: {
      turnsPerMonth: profile.turnsPerMonth,
      avgInputTokens: profile.avgInputTokens,
      avgOutputTokens: profile.avgOutputTokens,
      cacheHitShare: profile.cacheHitShare,
      tools: profile.tools,
      voiceMinutes: profile.voiceMinutes,
    },
    components: components.map((component) => ({
      label: component.label,
      usd: round(component.microusd / MICROUSD_PER_USD),
      credits: round(creditsFromMicrousd(component.microusd), 1),
    })),
    providerUsd: round(providerMicrousd / MICROUSD_PER_USD),
    credits: round(credits, 1),
    allowanceShare: Number.isFinite(bindingMonthlyCredits(planTier))
      ? round(credits / bindingMonthlyCredits(planTier), 3)
      : null,
    cappedByPool: coveredShare < 1,
    lineItems: Object.fromEntries(Object.entries(lines).map(([key, value]) => [key, round(value)])),
    totalCostUsd: round(Object.values(lines).reduce((sum, value) => sum + value, 0)),
    cachingSavingsUsd: round((chatUncached - chat) / MICROUSD_PER_USD),
    routingSavingsUsd: round((chatAtTierMaximum - chat) / MICROUSD_PER_USD),
    byPricePoint: pricePointsFor(planTier).map((point) => evaluate(lines, point)),
    _lines: lines,
  };
}

const TYPICAL = PROFILES.flatMap((profile) =>
  [profile.planTier, ...(profile.alsoPlans ?? [])].map((planTier) =>
    computeProfile(profile, planTier),
  ),
);

const SCENARIOS = ['main', 'branch', 'pool'];
const WORST = Object.fromEntries(
  PLAN_ORDER.filter((tier) => tier !== 'enterprise').map((tier) => [
    tier,
    Object.fromEntries(SCENARIOS.map((scenario) => [scenario, worstCase(tier, scenario)])),
  ]),
);

const supportUsdPerPayingUser =
  (PARAMS.supportMinutesPerPayingUser / 60) *
  EXTERNAL.wages.supportUsdPerHour *
  PARAMS.supportLoadedMultiplier;
const engineeringUsdPerMonth =
  (PARAMS.engineeringFte * EXTERNAL.wages.engineeringUsdPerYear) / MONTHS_PER_YEAR;

function typicalFor(planTier) {
  const preferred = {
    free: 'Free everyday',
    basic: 'Light',
    pro: 'Normal',
    max: 'Power',
    max_15x: '95th percentile',
    team: 'Normal',
    team_premium: 'Power',
  };
  return TYPICAL.find(
    (result) => result.planTier === planTier && result.profile === preferred[planTier],
  );
}

function pointFor(planTier, region, channel, interval = 'monthly') {
  return pricePointsFor(planTier).find(
    (point) => point.region === region && point.channel === channel && point.interval === interval,
  );
}

const FREE_TYPICAL_COST = typicalFor('free').totalCostUsd;

const MIXES = [
  {
    name: 'Launch mix, web, United States',
    shares: { basic: 0.3, pro: 0.55, max: 0.1, max_15x: 0.05 },
    channel: { region: 'us', channel: 'web' },
  },
  {
    name: 'Same mix, half on iOS in the first subscription year',
    shares: { basic: 0.3, pro: 0.55, max: 0.1, max_15x: 0.05 },
    channel: { region: 'us', channel: 'web' },
    blend: { region: 'us', channel: 'ios', share: 0.5 },
  },
  {
    name: 'Same mix, half in India on the web',
    shares: { basic: 0.3, pro: 0.55, max: 0.1, max_15x: 0.05 },
    channel: { region: 'us', channel: 'web' },
    blend: { region: 'in', channel: 'web', share: 0.5 },
  },
  {
    name: 'Teams, web, United States, monthly seats',
    shares: { team: 0.8, team_premium: 0.2 },
    channel: { region: 'us', channel: 'web' },
  },
];

function contributionFor(planTier, region, channel, costUsd) {
  const point = pointFor(planTier, region, channel) ?? pointFor(planTier, 'us', 'web');
  return point.netRevenueUsd - costUsd;
}

const BREAK_EVEN_BASES = {
  typical: 'typical profile cost on current allowances',
  worst_main: 'worst case on current allowances, code on main',
  budget_worst: 'worst case on the proposed 50% token budget, everything in one pool',
};

const CHANNEL_BUDGET_IDS = {
  'us:web': 'us_web',
  'intl_usd:web': 'intl_web',
  'in:web': 'india_web',
  'us:ios': 'us_ios_30',
  'us:android': 'us_play',
  'in:ios': 'india_ios_30',
  'in:android': 'india_play',
};

function mixCost(planTier, region, channel, basis) {
  if (basis === 'typical') return typicalFor(planTier).totalCostUsd;
  if (basis === 'worst_main') return WORST[planTier].main.totalCostUsd;
  const channels = TB50_BASE[planTier].byChannel;
  const row =
    channels.find((candidate) => candidate.id === CHANNEL_BUDGET_IDS[`${region}:${channel}`]) ??
    channels.find((candidate) => candidate.id === 'us_web');
  return row.nonPoolUsd + row.proposedWindows.monthlyCredits * USD_PER_CREDIT;
}

function mixContribution(mix, basis) {
  let sum = 0;
  for (const [planTier, share] of Object.entries(mix.shares)) {
    const base = contributionFor(
      planTier,
      mix.channel.region,
      mix.channel.channel,
      mixCost(planTier, mix.channel.region, mix.channel.channel, basis),
    );
    const blended = mix.blend
      ? (1 - mix.blend.share) * base +
        mix.blend.share *
          contributionFor(
            planTier,
            mix.blend.region,
            mix.blend.channel,
            mixCost(planTier, mix.blend.region, mix.blend.channel, basis),
          )
      : base;
    sum += share * blended;
  }
  return sum;
}

const FIXED_TOTAL = fixedMonthlyUsd();

function computeBreakEven() {
  return MIXES.flatMap((mix) =>
    Object.keys(BREAK_EVEN_BASES).map((basis) => {
      const perPaying =
        mixContribution(mix, basis) -
        supportUsdPerPayingUser -
        PARAMS.freeUsersPerPayingUser * FREE_TYPICAL_COST;
      const withoutPeople = perPaying > 0 ? Math.ceil(FIXED_TOTAL / perPaying) : null;
      const withPeople =
        perPaying > 0 ? Math.ceil((FIXED_TOTAL + engineeringUsdPerMonth) / perPaying) : null;
      return {
        mix: mix.name,
        basis,
        basisLabel: BREAK_EVEN_BASES[basis],
        shares: mix.shares,
        contributionPerPayingUserUsd: round(perPaying, 2),
        payingUsersToCoverFixed: withoutPeople,
        payingUsersToCoverFixedAndEngineering: withPeople,
        note:
          perPaying > 0
            ? null
            : 'contribution per paying user is not positive, so no user count covers the fixed costs',
      };
    }),
  );
}

function budgetFor(point, margin = PARAMS.targetGrossMargin) {
  return (
    point.priceUsd * (1 - margin) -
    point.storeTaxUsd -
    point.paymentFeeUsd -
    point.storeCommissionUsd
  );
}

function poolSubstitutes(usd, planTier) {
  const best = dearestChatSlot(planTier);
  const canVideo = BILLING_PLAN_CAPABILITY_TIERS.video_generation.includes(planTier);
  const canImages = BILLING_PLAN_CAPABILITY_TIERS.image_generation.includes(planTier);
  const canResearch = BILLING_PLAN_CAPABILITY_TIERS.deep_research.includes(planTier);
  return {
    credits: Math.max(0, Math.floor(usd / USD_PER_CREDIT)),
    bestModelReferenceTurns: best ? Math.floor(Math.max(0, usd) / best.referenceTurnUsd) : null,
    bestModelSlot: best?.slot ?? null,
    images: canImages ? Math.floor(Math.max(0, usd) / (IMAGE_MICROUSD / MICROUSD_PER_USD)) : 0,
    videoSecondsStandard: canVideo
      ? Math.floor(Math.max(0, usd) / (videoMicrousdPerSecond('1080p') / MICROUSD_PER_USD))
      : 0,
    videoSecondsLite: canVideo
      ? Math.floor(
          Math.max(0, usd) / (videoMicrousdPerSecond('1080p', videoLiteRoute) / MICROUSD_PER_USD),
        )
      : 0,
    deepResearchRuns: canResearch ? Math.floor(Math.max(0, usd) / DEEP_RESEARCH_RUN_USD) : 0,
    sandboxMinutes: Math.floor(Math.max(0, usd) / (SANDBOX_MICROUSD_PER_MINUTE / MICROUSD_PER_USD)),
    searchCalls: Math.floor(Math.max(0, usd) / rateCardUsd('web_search_grounding')),
  };
}

function nonPoolTotal(planTier, lean = null) {
  const { lines } = nonPoolWorstLines(planTier, lean);
  return Object.values(lines).reduce((sum, value) => sum + value, 0);
}

function verdictFor(result) {
  if (result.contributionUsd < 0) return 'worst case loses money';
  if (result.grossMarginPct < PARAMS.targetGrossMargin * 100)
    return 'worst case below target margin';
  return null;
}

function allowanceAudit(planTier, point) {
  const { lines } = nonPoolWorstLines(planTier);
  const net = point.priceUsd - point.storeTaxUsd - point.paymentFeeUsd - point.storeCommissionUsd;
  const budget = budgetFor(point);
  const storage = storageGib(planTier);
  const rows = [
    {
      allowance: `credit pool (${count(monthlyCredits(planTier))} credits)`,
      usd: poolUsd(planTier),
    },
    {
      allowance: 'voice backend tokens not charged on main',
      usd: WORST[planTier].main.voice.outsidePoolUsd,
    },
    {
      allowance: `voice minutes outside credits on ${VOICE_BRANCH.branch} (${count(WORST[planTier].branch.voice.minutes)} min${WORST[planTier].branch.voice.bounded ? '' : ', no hard bound'})`,
      usd: WORST[planTier].branch.voice.outsidePoolUsd,
    },
    {
      allowance: `file storage (${storage.bounded ? `${round(storage.gib, 2)} GiB` : `unlimited, shown at ${storage.gib} GiB`})`,
      usd: lines.storage,
    },
    {
      allowance:
        planTier === 'free'
          ? 'downloads (500 MiB a day)'
          : 'downloads (no cap, shown at the Free cap)',
      usd: lines.egress,
    },
    { allowance: 'messages, semantic search and email at the Free daily caps', usd: lines.db },
    ...(planTier === 'free'
      ? [
          { allowance: 'platform-funded sandbox ($1 a day, outside credits)', usd: lines.sandbox },
          { allowance: `${FREE_INCLUDED_SEARCH_CALLS} included searches`, usd: lines.search },
        ]
      : []),
  ].filter((row) => row.usd > 0);
  return rows.map((row) => ({
    allowance: row.allowance,
    worstUsd: round(row.usd, 2),
    netRevenueUsd: round(net, 2),
    verdict:
      planTier === 'free'
        ? row.usd > TOKEN_BUDGETS.free.fundedPerFreeUserUsd
          ? 'above what a Free account can be funded on its own'
          : 'within the Free funding on its own'
        : row.usd > net
          ? 'loses money on its own'
          : row.usd > budget
            ? 'over the target-margin cost budget on its own'
            : 'fits on its own',
    lossOnItsOwnUsd:
      planTier === 'free' ? round(-row.usd, 2) : row.usd > net ? round(net - row.usd, 2) : 0,
  }));
}

function recommendationsFor(planTier) {
  const scenario = 'branch';
  const worst = WORST[planTier][scenario];
  const voicePerMinute = voiceUsdPerMinute(planTier, scenario, 'worst');
  const currentVoice = worst.voice.outsidePoolUsd;
  const nonPool = nonPoolTotal(planTier);
  return pricePointsFor(planTier).map((point) => {
    const budget = budgetFor(point);
    const available = budget - nonPool;
    const match = (row) =>
      row.region === point.region &&
      row.channel === point.channel &&
      row.interval === point.interval;
    const result = worst.byPricePoint.find(match);
    const today = WORST[planTier].main.byPricePoint.find(match);
    const flags = [];
    const todayVerdict = verdictFor(today);
    if (todayVerdict) flags.push(`today: ${todayVerdict} (${pct(today.grossMarginPct)})`);
    const branchVerdict = verdictFor(result);
    if (branchVerdict) flags.push(`voice branch: ${branchVerdict} (${pct(result.grossMarginPct)})`);
    if (planTier !== 'free' && currentVoice > 0 && currentVoice > Math.max(0, available)) {
      flags.push('voice minutes alone exceed the worst-case budget');
    }
    if (worst.unboundedItems.length) flags.push(`unbounded: ${worst.unboundedItems.join(', ')}`);
    return {
      region: point.region,
      channel: point.channel,
      interval: point.interval,
      priceUsd: round(point.priceUsd, 2),
      worstCaseBudgetUsd: round(budget, 2),
      nonPoolCostUsd: round(nonPool, 2),
      availableForCreditsAndVoiceUsd: round(available, 2),
      currentCreditPoolUsd: round(poolUsd(planTier), 2),
      currentVoiceMinutes: worst.voice.minutes,
      currentVoiceWorstUsd: round(currentVoice, 2),
      maxMonthlyCreditsWithNoVoice: Math.max(0, Math.floor(available / USD_PER_CREDIT)),
      maxMonthlyCreditsWithCurrentVoice: Math.max(
        0,
        Math.floor(
          (available - (Number.isFinite(currentVoice) ? currentVoice : Infinity)) / USD_PER_CREDIT,
        ),
      ),
      maxVoiceMinutesWithCurrentCredits: Math.max(
        0,
        Math.floor((available - poolUsd(planTier)) / voicePerMinute),
      ),
      maxVoiceMinutesWithNoCredits: Math.max(0, Math.floor(available / voicePerMinute)),
      ifWholePoolWentToOneCategory: poolSubstitutes(available, planTier),
      currentGrossMarginPctToday: today.grossMarginPct,
      currentGrossMarginPctVoiceBranch: result.grossMarginPct,
      allowanceAudit: allowanceAudit(planTier, point),
      flags,
    };
  });
}

function niceFloor(value) {
  if (!(value > 0)) return 0;
  const step =
    value >= 5_000
      ? 500
      : value >= 1_000
        ? 100
        : value >= 200
          ? 50
          : value >= 50
            ? 10
            : value >= 20
              ? 5
              : 1;
  return Math.floor(value / step) * step;
}

const MESSAGE_SHAPE = PROFILES.find((profile) => profile.name === 'Normal');

function defaultMessage(planTier) {
  if (planTier === 'free') return null;
  const slot = admittedSlot('simple_chat', planTier, taskProfile('simple_chat'));
  return {
    slot,
    usd:
      chatMicrousd(
        slotRoute(slot),
        1,
        MESSAGE_SHAPE,
        MESSAGE_SHAPE.cacheHitShare,
        MESSAGE_SHAPE.cacheWriteShare,
      ) / MICROUSD_PER_USD,
  };
}

function bestMessage(planTier) {
  if (planTier === 'free') return null;
  const best = dearestChatSlot(planTier);
  if (!best) return null;
  return {
    slot: best.slot,
    usd:
      chatMicrousd(
        best.route,
        1,
        MESSAGE_SHAPE,
        MESSAGE_SHAPE.cacheHitShare,
        MESSAGE_SHAPE.cacheWriteShare,
      ) / MICROUSD_PER_USD,
  };
}

function unitCredits(planTier) {
  const can = (capability) => BILLING_PLAN_CAPABILITY_TIERS[capability].includes(planTier);
  const message = defaultMessage(planTier);
  const best = bestMessage(planTier);
  const rows = {
    defaultModelMessage: message ? message.usd : null,
    bestModelMessage: best ? best.usd : null,
    voiceMinuteTypical: voiceUsdPerMinute(planTier, 'pool', 'typical'),
    voiceMinuteWorst: voiceUsdPerMinute(planTier, 'pool', 'worst'),
    image: can('image_generation') ? IMAGE_MICROUSD / MICROUSD_PER_USD : null,
    video: can('video_generation')
      ? (PARAMS.uiVideoSeconds * videoMicrousdPerSecond('1080p')) / MICROUSD_PER_USD
      : null,
    videoLite: can('video_generation')
      ? (PARAMS.uiVideoSeconds * videoMicrousdPerSecond('1080p', videoLiteRoute)) / MICROUSD_PER_USD
      : null,
    searchCall: rateCardUsd('web_search_grounding'),
    deepResearchRun: can('deep_research') ? DEEP_RESEARCH_RUN_USD : null,
    sandboxMinute: SANDBOX_MICROUSD_PER_MINUTE / MICROUSD_PER_USD,
  };
  return Object.fromEntries(
    Object.entries(rows).map(([key, value]) => [
      key,
      value === null ? null : { usd: round(value, 5), credits: round(value / USD_PER_CREDIT, 2) },
    ]),
  );
}

function equivalents(credits, planTier) {
  const units = unitCredits(planTier);
  const of = (key) => (units[key] ? Math.floor(credits / units[key].credits) : 0);
  return {
    credits,
    usd: round(credits * USD_PER_CREDIT, 2),
    defaultModelMessages:
      planTier === 'free'
        ? 'not metered: Free chat runs on zero-cost routes'
        : of('defaultModelMessage'),
    defaultModelSlot: defaultMessage(planTier)?.slot ?? auto.tierAllowedSlots.free?.[0] ?? null,
    bestModelMessages: planTier === 'free' ? 0 : of('bestModelMessage'),
    bestModelSlot: bestMessage(planTier)?.slot ?? null,
    voiceMinutesTypical: of('voiceMinuteTypical'),
    voiceMinutesWorst: of('voiceMinuteWorst'),
    images: of('image'),
    videos: of('video'),
    videosLite: of('videoLite'),
    searchCalls: of('searchCall'),
    deepResearchRuns: of('deepResearchRun'),
    sandboxMinutes: of('sandboxMinute'),
  };
}

function proposedWindows(monthly, planTier) {
  const voiceMinuteCredits = voiceUsdPerMinute(planTier, 'pool', 'worst') / USD_PER_CREDIT;
  const weekly = Math.round(monthly * PARAMS.weeklyShareOfMonthly);
  const fiveHour = Math.min(
    weekly,
    Math.max(
      Math.round(monthly * PARAMS.fiveHourShareOfMonthly),
      Math.ceil(PARAMS.minimumFiveHourVoiceMinutes * voiceMinuteCredits),
    ),
  );
  const windowsPerDay = 24 / 5;
  return {
    monthlyCredits: monthly,
    weeklyCredits: weekly,
    fiveHourCredits: fiveHour,
    dailyCredits: 0,
    heaviestDayShareOfMonth:
      monthly > 0 ? round(Math.min(fiveHour * windowsPerDay, weekly) / monthly, 3) : 0,
    heaviestWeekShareOfMonth: monthly > 0 ? round(weekly / monthly, 3) : 0,
  };
}

function currentWindows(planTier) {
  const limit = MANAGED_USAGE_LIMITS[planTier];
  const windowsPerDay = 24 / 5;
  return {
    monthlyCredits: limit.monthlyCredits,
    weeklyCredits: limit.weeklyCredits,
    fiveHourCredits: limit.fiveHourCredits,
    dailyCredits: limit.dailyCredits,
    heaviestDayShareOfMonth:
      limit.monthlyCredits > 0
        ? round(
            Math.min(limit.fiveHourCredits * windowsPerDay, limit.weeklyCredits) /
              limit.monthlyCredits,
            3,
          )
        : 0,
  };
}

function recommendedCaps(planTier, point) {
  const storage = storageGib(planTier);
  return {
    storageGib: Math.max(
      1,
      Math.floor(
        Math.min(
          storage.bounded ? storage.gib : Infinity,
          (PARAMS.leanStorageCostShareOfPrice * point.priceUsd) /
            rateCardUsd('object_storage_gib_month'),
        ),
      ),
    ),
    egressGib:
      (PARAMS.leanDownloadCostShareOfPrice * point.priceUsd) / rateCardUsd('network_egress_gib'),
  };
}

function typicalCostAtBudget(planTier, budgetUsd) {
  const typical = typicalFor(planTier);
  const lines = { ...typical._lines };
  const poolKeys = ['chat', 'voice', 'images', 'video', 'search', 'sandbox'];
  const inPool = poolKeys.reduce((sum, key) => sum + lines[key], 0);
  const scale = inPool > budgetUsd && inPool > 0 ? budgetUsd / inPool : 1;
  for (const key of poolKeys) lines[key] *= scale;
  return {
    profile: typical.profile,
    usd: Object.values(lines).reduce((sum, value) => sum + value, 0),
  };
}

function tokenBudgetFor(planTier, margin = PARAMS.supersededTokenBudgetMargin) {
  const current = monthlyCredits(planTier);
  const rows = pricePointsFor(planTier).map((point) => {
    const caps = recommendedCaps(planTier, point);
    const budget = budgetFor(point, margin);
    const nonPool = nonPoolTotal(planTier, caps);
    const maxCredits = Math.max(0, Math.floor((budget - nonPool) / USD_PER_CREDIT));
    const maxCreditsUncapped = Math.max(
      0,
      Math.floor((budget - nonPoolTotal(planTier)) / USD_PER_CREDIT),
    );
    const net = point.priceUsd - point.storeTaxUsd - point.paymentFeeUsd - point.storeCommissionUsd;
    const currentWorst = net - nonPool - current * USD_PER_CREDIT;
    const typical = typicalCostAtBudget(planTier, current * USD_PER_CREDIT);
    return {
      region: point.region,
      channel: point.channel,
      interval: point.interval,
      priceUsd: round(point.priceUsd, 2),
      localPrice: point.localPrice ?? null,
      netRevenueUsd: round(net, 2),
      worstCaseBudgetUsd: round(budget, 2),
      nonPoolUsd: round(nonPool, 2),
      maxMonthlyCredits: maxCredits,
      maxMonthlyCreditsIfDownloadsStayUncapped: maxCreditsUncapped,
      currentMonthlyCredits: current,
      currentVersusSafeMaximum:
        maxCredits === 0
          ? 'no safe budget at this price and channel'
          : current > maxCredits
            ? `above the safe maximum by ${pct(((current - maxCredits) / maxCredits) * 100)}`
            : `below the safe maximum by ${pct(((maxCredits - current) / maxCredits) * 100)}`,
      currentWorstCaseGrossMarginPct: round((currentWorst / point.priceUsd) * 100, 1),
      currentTypicalGrossMarginPct: round(((net - typical.usd) / point.priceUsd) * 100, 1),
      equivalentsAtMaximum: equivalents(maxCredits, planTier),
    };
  });
  const webRows = rows.filter((row) => row.channel === 'web' && row.interval === 'monthly');
  const binding = webRows.reduce(
    (low, row) => (row.maxMonthlyCredits < low.maxMonthlyCredits ? row : low),
    webRows[0],
  );
  const usWeb = webRows.find((row) => row.region === 'us') ?? binding;
  const proposed = niceFloor(usWeb.maxMonthlyCredits);
  const usPoint = pointFor(planTier, usWeb.region, 'web');
  const caps = recommendedCaps(planTier, usPoint);
  const worstCost = nonPoolTotal(planTier, caps) + proposed * USD_PER_CREDIT;
  const typical = typicalCostAtBudget(planTier, proposed * USD_PER_CREDIT);
  const regionalOverrides = webRows
    .filter((row) => row.maxMonthlyCredits < proposed)
    .map((row) => ({
      region: row.region,
      maxMonthlyCredits: row.maxMonthlyCredits,
      proposedMonthlyCredits: niceFloor(row.maxMonthlyCredits),
      note: 'managed-usage-limits.ts has one budget per plan, so a lower regional budget needs a regional limit table or a price change',
    }));
  return {
    current: currentWindows(planTier),
    proposal: {
      basis: `United States web price at ${pct(margin * 100)} worst-case margin on list price`,
      ...proposedWindows(proposed, planTier),
      recommendedCaps: {
        storageGib: caps.storageGib,
        dailyDownloadMiB: Math.floor((caps.egressGib / DAYS) * MIB_PER_GIB),
        dailySavedMessages: PARAMS.leanDailyMessages,
        dailyEmails: PARAMS.leanDailyEmails,
      },
      worstCaseCostUsd: round(worstCost, 2),
      worstCaseGrossMarginPct: round(
        ((usPoint.priceUsd - usPoint.paymentFeeUsd - worstCost) / usPoint.priceUsd) * 100,
        1,
      ),
      typicalProfile: typical.profile,
      typicalCaseGrossMarginPct: round(
        ((usPoint.priceUsd - usPoint.paymentFeeUsd - typical.usd) / usPoint.priceUsd) * 100,
        1,
      ),
      changeFromToday:
        current > 0
          ? `${pct(((proposed - current) / current) * 100)} versus ${count(current)}`
          : null,
      equivalents: equivalents(proposed, planTier),
      regionalOverrides,
      storePriceForSameMarginUsd: STORE_PLANS.has(planTier)
        ? {
            iosFirstYear: round(
              (usPoint.priceUsd - usPoint.paymentFeeUsd) /
                (1 -
                  MOBILE_IAP_STORE_COMMISSION.ios.subscriptionFirstYearBasisPoints /
                    BASIS_POINTS_PER_WHOLE),
              2,
            ),
            iosSmallBusiness: round(
              (usPoint.priceUsd - usPoint.paymentFeeUsd) / (1 - EXTERNAL.apple.smallBusinessShare),
              2,
            ),
            android: round((usPoint.priceUsd - usPoint.paymentFeeUsd) / (1 - androidShare()), 2),
          }
        : null,
    },
    byPricePoint: rows,
  };
}

function freeTokenBudget() {
  const mix = MIXES[0];
  const contribution = mixContribution(mix, 'typical') - supportUsdPerPayingUser;
  const funded =
    (contribution * PARAMS.freeAcquisitionShareOfContribution) / PARAMS.freeUsersPerPayingUser;
  const egressGib = (PARAMS.freeDailyDownloadMiB / MIB_PER_GIB) * DAYS;
  const storage = storageGib('free').gib;
  const marginal =
    storage * rateCardUsd('object_storage_gib_month') +
    egressGib * rateCardUsd('network_egress_gib') +
    (footprintMicrousd('turn', PARAMS.leanDailyMessages * DAYS) +
      WORST_VECTOR_QUERIES * rateCardMicrousd('vector_query_request') +
      PARAMS.freeDailyEmails * DAYS * rateCardMicrousd('email_message_request')) /
      MICROUSD_PER_USD;
  const poolBudget = Math.max(0, funded - marginal);
  const credits = Math.floor(poolBudget / USD_PER_CREDIT);
  const current = monthlyCredits('free');
  return {
    assumptions: {
      freeUsersPerPayingUser: PARAMS.freeUsersPerPayingUser,
      impliedConversionShare: round(1 / (1 + PARAMS.freeUsersPerPayingUser), 3),
      freeAcquisitionShareOfContribution: PARAMS.freeAcquisitionShareOfContribution,
      paidMix: mix.name,
      paidContributionPerPayingUserUsd: round(contribution, 2),
      fixedCostsExcluded:
        'fixed vendor costs do not grow with one more Free account below 50,000 retained users, so only marginal costs are charged to Free',
    },
    formula:
      'freeBudgetUsd = paid contribution per paying user (typical, after support) x freeAcquisitionShareOfContribution / freeUsersPerPayingUser - marginal Free cost (storage quota, freeDailyDownloadMiB, leanDailyMessages, semantic searches, emails); credits = freeBudgetUsd / 0.005',
    fundedPerFreeUserUsd: round(funded, 3),
    marginalNonPoolUsd: round(marginal, 3),
    maxMonthlyCredits: credits,
    currentMonthlyCredits: current,
    currentVersusSafeMaximum:
      credits === 0
        ? 'no safe budget'
        : current > credits
          ? `above the safe maximum by ${pct(((current - credits) / credits) * 100)}`
          : `below the safe maximum by ${pct(((credits - current) / credits) * 100)}`,
    proposal: {
      ...proposedWindows(niceFloor(credits), 'free'),
      recommendedCaps: {
        storageGib: round(storage, 3),
        dailyDownloadMiB: PARAMS.freeDailyDownloadMiB,
        dailySavedMessages: PARAMS.leanDailyMessages,
        platformFundedSandbox: 'remove; Free sandbox draws the pool like everything else',
        includedSearchCalls: 'remove; Free search draws the pool',
      },
      equivalents: equivalents(niceFloor(credits), 'free'),
    },
    current: currentWindows('free'),
    separateFreeQuotaLayer:
      'free-pools.json allocations stay outside this budget at $0 provider cost until they expire or run out',
  };
}

function usd(value, digits = 2) {
  if (value === 'unbounded' || value === Infinity) return 'unbounded';
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(digits)}`;
}

function pct(value) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'n/a';
}

function count(value, maximumFractionDigits = 0) {
  if (value === Infinity || value === 'unbounded') return 'unbounded';
  if (value === null || value === undefined) return 'none';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits });
}

const FREE_POOL_SUMMARY = freePoolExpiries();
const RECOMMENDATIONS = Object.fromEntries(
  PLAN_ORDER.filter((tier) => tier !== 'enterprise').map((tier) => [
    tier,
    recommendationsFor(tier),
  ]),
);
const TOKEN_BUDGETS = {
  free: freeTokenBudget(),
  ...Object.fromEntries(
    PLAN_ORDER.filter((tier) => !['free', 'enterprise'].includes(tier)).map((tier) => [
      tier,
      tokenBudgetFor(tier),
    ]),
  ),
};

const SONNET_MODEL_KEY = auto.slots.coding_balanced?.modelKey;
const HAIKU_MODEL_KEY = Object.values(registry.models).find(
  (model) =>
    model.identity.provider === 'anthropic' &&
    model.identity.kind === 'chat' &&
    model.identity.familyPartner === SONNET_MODEL_KEY,
)?.identity.key;
if (!HAIKU_MODEL_KEY) throw new Error('no anthropic chat model partners the active Sonnet family');

const PROPOSED_ROUTES = {
  everyday: familyRoute(PARAMS.proposedRouting.everydayFamily),
  backups: [modelRoute(HAIKU_MODEL_KEY), familyRoute(PARAMS.proposedRouting.backupFamily)],
  hard: Object.fromEntries(
    Object.entries(PARAMS.proposedRouting.hardFamilies).map(([task, family]) => [
      task,
      proposedRoute(family),
    ]),
  ),
  flagship: Object.fromEntries(
    Object.entries(PARAMS.proposedRouting.flagshipFamilies).map(([task, family]) => [
      task,
      proposedRoute(family),
    ]),
  ),
};

const MAX_ROUTING_TIERS = new Set(['max', 'max_15x', 'team_premium', 'enterprise']);

function messageMixUsd(route, base) {
  const mix = PARAMS.everydayMessage;
  const baseShare = 1 - mix.long.share - mix.veryLong.share;
  return (
    baseShare * base +
    mix.long.share *
      turnUsd(route, mix.long.inputTokens, mix.long.outputTokens, mix.long.cachedShare) +
    mix.veryLong.share *
      turnUsd(route, mix.veryLong.inputTokens, mix.veryLong.outputTokens, mix.veryLong.cachedShare)
  );
}

function everydayMessageUsd(route) {
  const { base } = PARAMS.everydayMessage;
  return messageMixUsd(
    route,
    turnUsd(route, base.inputTokens, base.outputTokens, base.cachedShare),
  );
}

function proposedRouteFor(taskType, planTier) {
  if (PARAMS.proposedRouting.everydayTasks.includes(taskType))
    return { route: PROPOSED_ROUTES.everyday, label: 'everyday' };
  const hard = PROPOSED_ROUTES.hard[taskType];
  if (hard) return { route: hard, label: 'hard' };
  return {
    route: slotRoute(admittedSlot(taskType, planTier, taskProfile(taskType))),
    label: 'unchanged',
  };
}

function computeProfileProposed(profile, planTier) {
  const base = TYPICAL.find(
    (result) => result.profile === profile.name && result.planTier === planTier,
  );
  if (planTier === 'free') return { ...base._lines };
  let chat = 0;
  for (const [taskType, share] of Object.entries(profile.taskMix)) {
    const turns = profile.turnsPerMonth * share;
    const { route, label } = proposedRouteFor(taskType, planTier);
    const perTurn = (r) =>
      messageMixUsd(
        r,
        chatMicrousd(r, 1, profile, profile.cacheHitShare, profile.cacheWriteShare) /
          MICROUSD_PER_USD,
      );
    const flagshipShare =
      label === 'hard' && MAX_ROUTING_TIERS.has(planTier)
        ? PARAMS.proposedRouting.maxManualFlagshipShareOfHardTurns
        : 0;
    const flagship = PROPOSED_ROUTES.flagship[taskType] ?? PROPOSED_ROUTES.flagship.default;
    chat += turns * ((1 - flagshipShare) * perTurn(route) + flagshipShare * perTurn(flagship));
  }
  chat *= 1 + profile.retryShare + profile.gatewayOverheadShare;
  const lines = { ...base._lines, chat };
  lines.voice = profile.voiceMinutes * voiceUsdPerMinute(planTier, 'pool', 'typical');
  return lines;
}

const POOL_KEYS = ['chat', 'voice', 'images', 'video', 'search', 'sandbox'];

function capAtPool(lines, poolUsdValue) {
  const capped = { ...lines };
  const inPool = POOL_KEYS.reduce((sum, key) => sum + capped[key], 0);
  const scale = inPool > poolUsdValue && inPool > 0 ? poolUsdValue / inPool : 1;
  for (const key of POOL_KEYS) capped[key] *= scale;
  return {
    lines: capped,
    capped: scale < 1,
    usd: Object.values(capped).reduce((sum, value) => sum + value, 0),
  };
}

function channelPoints(planTier) {
  const points = pricePointsFor(planTier).filter((point) => point.interval === 'monthly');
  const find = (region, channel) =>
    points.find((point) => point.region === region && point.channel === channel);
  const usIos = find('us', 'ios');
  const variants = [
    { id: 'us_web', label: 'US web', point: find('us', 'web') },
    {
      id: 'intl_web',
      label: 'Rest of world web (USD, international card)',
      point: find('intl_usd', 'web'),
    },
    { id: 'india_web', label: 'India web (INR)', point: find('in', 'web') },
    { id: 'us_ios_30', label: 'iOS, first year (30%)', point: usIos },
    {
      id: 'us_ios_15',
      label: 'iOS, after a year or Small Business Program (15%)',
      point: usIos && {
        ...usIos,
        storeCommissionUsd: usIos.priceUsd * EXTERNAL.apple.smallBusinessShare,
        netRevenueUsd: usIos.priceUsd * (1 - EXTERNAL.apple.smallBusinessShare),
      },
    },
    {
      id: 'us_play',
      label: `Google Play subscription (${pct(androidShare() * 100)})`,
      point: find('us', 'android'),
    },
    {
      id: 'india_ios_30',
      label: 'India iOS, first year (30%), store price assumed',
      point: find('in', 'ios'),
    },
    {
      id: 'india_play',
      label: 'India Google Play (15%), store price assumed',
      point: find('in', 'android'),
    },
  ];
  return variants.filter((variant) => variant.point);
}

function netRevenueOf(point) {
  return point.priceUsd - point.storeTaxUsd - point.paymentFeeUsd - point.storeCommissionUsd;
}

function budget50For(point, planTier, margin) {
  const net = netRevenueOf(point);
  const nonPool = nonPoolTotal(planTier, recommendedCaps(planTier, point));
  return {
    netRevenueUsd: net,
    nonPoolUsd: nonPool,
    credits: Math.max(0, Math.floor((net * (1 - margin) - nonPool) / USD_PER_CREDIT)),
    creditsOnListPrice: Math.max(
      0,
      Math.floor(
        (point.priceUsd * (1 - margin) - (point.priceUsd - net) - nonPool) / USD_PER_CREDIT,
      ),
    ),
  };
}

function premiumMessage() {
  const candidates = [PROPOSED_ROUTES.hard.coding, PROPOSED_ROUTES.hard.reasoning].map((route) => ({
    route,
    usd: everydayMessageUsd(route),
  }));
  return candidates.sort((a, b) => b.usd - a.usd)[0];
}

function friendly50(credits, planTier) {
  const everyday = everydayMessageUsd(PROPOSED_ROUTES.everyday);
  const premium = premiumMessage();
  const can = (capability) => BILLING_PLAN_CAPABILITY_TIERS[capability].includes(planTier);
  const perCredit = (usd) => usd / USD_PER_CREDIT;
  return {
    credits,
    everydayMessages:
      planTier === 'free'
        ? 'zero-cost routes, not metered'
        : Math.floor(credits / perCredit(everyday)),
    premiumMessages: planTier === 'free' ? 0 : Math.floor(credits / perCredit(premium.usd)),
    voiceMinutesAtOwnerRate: Math.floor(credits / PARAMS.uiVoiceCreditsPerMinute),
    voiceMinutesTypical: Math.floor(
      credits / perCredit(voiceUsdPerMinute(planTier, 'pool', 'typical')),
    ),
    voiceMinutesHeavy: Math.floor(
      credits / perCredit(voiceUsdPerMinute(planTier, 'pool', 'worst')),
    ),
    images: can('image_generation')
      ? Math.floor(credits / perCredit(IMAGE_MICROUSD / MICROUSD_PER_USD))
      : 0,
    videosLite: can('video_generation')
      ? Math.floor(
          credits /
            perCredit(
              (PARAMS.uiVideoSeconds * videoMicrousdPerSecond('1080p', videoLiteRoute)) /
                MICROUSD_PER_USD,
            ),
        )
      : 0,
  };
}

function averagedMargin(margin) {
  const rows = [];
  for (const [planTier, weights] of Object.entries(PARAMS.profileMixByPlan)) {
    const usWeb = pointFor(planTier, 'us', 'web');
    const pool = TB50_BASE[planTier].proposal.monthlyCredits * USD_PER_CREDIT;
    let cost = 0;
    let costUncapped = 0;
    for (const [profileName, weight] of Object.entries(weights)) {
      const profile = PROFILES.find((candidate) => candidate.name === profileName);
      const lines = computeProfileProposed(profile, planTier);
      cost += weight * capAtPool(lines, pool).usd;
      costUncapped += weight * Object.values(lines).reduce((sum, value) => sum + value, 0);
    }
    const net = netRevenueOf(usWeb);
    rows.push({
      planTier,
      weights,
      priceUsd: round(usWeb.priceUsd, 2),
      netRevenueUsd: round(net, 2),
      averageCostUsd: round(cost, 2),
      averageCostUncappedUsd: round(costUncapped, 2),
      marginOnNetRevenuePct: round(((net - cost) / net) * 100, 1),
      marginOnListPricePct: round(((net - cost) / usWeb.priceUsd) * 100, 1),
    });
  }
  const mix = PARAMS.planMixForAverage;
  const totals = rows.reduce(
    (sum, row) => {
      const share = mix[row.planTier] ?? 0;
      return {
        price: sum.price + share * row.priceUsd,
        net: sum.net + share * row.netRevenueUsd,
        cost: sum.cost + share * row.averageCostUsd,
      };
    },
    { price: 0, net: 0, cost: 0 },
  );
  return {
    margin,
    byPlan: rows,
    planMix: mix,
    blended: {
      revenuePerUserUsd: round(totals.price, 2),
      netRevenuePerUserUsd: round(totals.net, 2),
      costPerUserUsd: round(totals.cost, 2),
      marginOnNetRevenuePct: round(((totals.net - totals.cost) / totals.net) * 100, 1),
      marginOnListPricePct: round(((totals.net - totals.cost) / totals.price) * 100, 1),
    },
  };
}

function tokenBudget50For(planTier, margin) {
  const variants = channelPoints(planTier).map((variant) => ({
    ...variant,
    ...budget50For(variant.point, planTier, margin),
  }));
  const base = variants.find((variant) => variant.id === 'us_web');
  const proposed = niceFloor(base.credits);
  const windows = proposedWindows(proposed, planTier);
  const pool = proposed * USD_PER_CREDIT;
  const worst = base.nonPoolUsd + pool;
  const typicalProfile = typicalFor(planTier).profile;
  const typicalLines = computeProfileProposed(
    PROFILES.find((profile) => profile.name === typicalProfile),
    planTier,
  );
  const typical = capAtPool(typicalLines, pool);
  return {
    current: currentWindows(planTier),
    proposal: {
      ...windows,
      basis: `US web net revenue x ${pct((1 - margin) * 100)} - non-pool cost`,
      creditsIfMarginOnListPrice: niceFloor(base.creditsOnListPrice),
      changeFromToday: `${pct(((proposed - monthlyCredits(planTier)) / monthlyCredits(planTier)) * 100)} versus ${count(monthlyCredits(planTier))}`,
      worstCaseCostUsd: round(worst, 2),
      worstCaseMarginOnNetRevenuePct: round(
        ((base.netRevenueUsd - worst) / base.netRevenueUsd) * 100,
        1,
      ),
      worstCaseMarginOnListPricePct: round(
        ((base.netRevenueUsd - worst) / base.point.priceUsd) * 100,
        1,
      ),
      typicalProfile,
      typicalCaseMarginOnNetRevenuePct: round(
        ((base.netRevenueUsd - typical.usd) / base.netRevenueUsd) * 100,
        1,
      ),
      friendly: friendly50(proposed, planTier),
    },
    byChannel: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      priceUsd: round(variant.point.priceUsd, 2),
      localPrice: variant.point.localPrice ?? null,
      netRevenueUsd: round(variant.netRevenueUsd, 2),
      nonPoolUsd: round(variant.nonPoolUsd, 2),
      maxMonthlyCredits: variant.credits,
      ratioToUsWeb: base.credits > 0 ? round(variant.credits / base.credits, 2) : null,
      proposedWindows: proposedWindows(niceFloor(variant.credits), planTier),
    })),
  };
}

const TB50_MARGIN = PARAMS.targetGrossMargin;
const TB50_BASE = Object.fromEntries(
  PLAN_ORDER.filter((tier) => !['free', 'enterprise'].includes(tier)).map((tier) => [
    tier,
    tokenBudget50For(tier, TB50_MARGIN),
  ]),
);
const TB50_AVERAGE = averagedMargin(TB50_MARGIN);
const TB50_UNIT = {
  everydayMessage: {
    route: PROPOSED_ROUTES.everyday.routeId,
    usd: round(everydayMessageUsd(PROPOSED_ROUTES.everyday), 6),
    credits: round(everydayMessageUsd(PROPOSED_ROUTES.everyday) / USD_PER_CREDIT, 3),
    withoutLongContextCredits: round(
      turnUsd(
        PROPOSED_ROUTES.everyday,
        PARAMS.everydayMessage.base.inputTokens,
        PARAMS.everydayMessage.base.outputTokens,
        PARAMS.everydayMessage.base.cachedShare,
      ) / USD_PER_CREDIT,
      3,
    ),
  },
  backups: PROPOSED_ROUTES.backups.map((route) => ({
    route: route.routeId,
    credits: round(everydayMessageUsd(route) / USD_PER_CREDIT, 3),
  })),
  premiumMessage: Object.entries(PROPOSED_ROUTES.hard)
    .filter(([task]) => ['coding', 'reasoning'].includes(task))
    .map(([task, route]) => ({
      task,
      route: route.routeId,
      credits: round(everydayMessageUsd(route) / USD_PER_CREDIT, 3),
    })),
  voiceMinuteOwnerRate: PARAMS.uiVoiceCreditsPerMinute,
  voiceMinuteTypical: round(voiceUsdPerMinute('pro', 'pool', 'typical') / USD_PER_CREDIT, 2),
  voiceMinuteHeavy: round(voiceUsdPerMinute('pro', 'pool', 'worst') / USD_PER_CREDIT, 2),
  image: round(IMAGE_MICROUSD / MICROUSD_PER_USD / USD_PER_CREDIT, 2),
};
const TOKEN_BUDGETS_50 = {
  decisions: [
    'Owner, 2026-10-10: plan budgets use a 50% worst-case gross margin target.',
    'Owner, 2026-10-10: everyday chat on paid plans moves to the fast OpenAI family with the Anthropic small model and the Qwen flash family as backups; auto steps up to the balanced OpenAI or Sonnet family only for hard tasks; flagships are manual on Max.',
    'Owner, 2026-10-10: budget follows revenue; each region and channel is sized to its net revenue after fees, tax and store commission.',
  ],
  marginDefinition:
    'worst-case gross margin = (net revenue - variable cost) / net revenue, net revenue = price - store tax - payment fee - store commission; creditsIfMarginOnListPrice shows the stricter reading where the margin is a share of the list price',
  formulas: {
    maxMonthlyCredits: 'floor((netRevenue x (1 - margin) - nonPool) / 0.005)',
    ratioToUsWeb: 'maxMonthlyCredits(channel) / maxMonthlyCredits(US web)',
    everydayMessage:
      '(1 - longShare - veryLongShare) x cost(base) + longShare x cost(long) + veryLongShare x cost(veryLong), each at the route price for its prompt length (long-context tiers applied)',
    profileChat:
      'turns x message mix on the proposed route (everyday tasks on the everyday family, hard tasks on the balanced families, a manual flagship share of hard turns on Max plans) x (1 + retry + gateway overhead)',
    averagedMargin:
      'sum over profiles of weight x min(profile cost, pool) per plan; blended by planMixForAverage on US web prices',
  },
  messageAssumption: PARAMS.everydayMessage,
  routing: {
    everyday: PROPOSED_ROUTES.everyday.routeId,
    backups: PROPOSED_ROUTES.backups.map((route) => route.routeId),
    hard: Object.fromEntries(
      Object.entries(PROPOSED_ROUTES.hard).map(([task, route]) => [task, route.routeId]),
    ),
    manualFlagshipOnMax: Object.fromEntries(
      Object.entries(PROPOSED_ROUTES.flagship).map(([task, route]) => [task, route.routeId]),
    ),
    maxManualFlagshipShareOfHardTurns: PARAMS.proposedRouting.maxManualFlagshipShareOfHardTurns,
    catalogNote:
      'the Anthropic small model has no family slot in model-families.json, so it is found as the chat model whose familyPartner is the active Sonnet model; a family slot would let routing name it',
  },
  unitCredits: TB50_UNIT,
  byTier: TB50_BASE,
  free: TOKEN_BUDGETS.free,
  averagedTypicalMargin: TB50_AVERAGE,
};
const BREAK_EVEN = computeBreakEven();

const CURRENT_LINES = {
  freeIncludedSearch: lineOf(SOURCES.includedSearch, /FREE_PLAN_MONTHLY_SEARCH_CALLS = /),
  paidIncludedSearch: lineOf(SOURCES.includedSearch, /\? FREE_PLAN_MONTHLY_SEARCH_CALLS : 0/),
  limits: lineOf(SOURCES.allowances, /export const MANAGED_USAGE_LIMITS:/),
  pricing: lineOf(SOURCES.plans, /export const BILLING_PLAN_PRICING = \{/),
  productLimits: lineOf(SOURCES.plans, /export const BILLING_PLAN_PRODUCT_LIMITS:/),
  freeDailyCaps: lineOf(SOURCES.plans, /export const FREE_DAILY_CAPS = /),
  freeSandbox: lineOf(SOURCES.plans, /export const FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD/),
  freeSandboxFunding: lineOf(
    SOURCES.freeSandbox,
    /FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD\) \{/,
  ),
  capabilities: lineOf(SOURCES.plans, /export const BILLING_PLAN_CAPABILITY_TIERS:/),
  tierPolicies: lineOf(SOURCES.tierPolicies, /const TIER_POLICIES_DEFINITION/),
  voiceMinutesFree: lineOf(SOURCES.tierPolicies, /voiceMinutesPerMonth: 30,/),
  voiceMinutesPro: lineOf(SOURCES.tierPolicies, /voiceMinutesPerMonth: 300,/),
  productTierMapping: lineOf(SOURCES.tierPolicies, /function normalizeProductTier/),
  indiaPrices: lineOf(SOURCES.regionalPricing, /const INDIA_MONTHLY_PRICE_MINOR/),
  stripePricePoints: lineOf(SOURCES.pricePoints, /export const STRIPE_PRICE_POINTS/),
  storeCommission: lineOf(SOURCES.storeCommission, /export const MOBILE_IAP_STORE_COMMISSION/),
  topUps: lineOf(SOURCES.topUps, /export const TOP_UP_UNITS_PER_USD/),
  liveBlock: lineOf(SOURCES.liveVoiceBilling, /export const LIVE_SESSION_BLOCK_MINUTES/),
  guestChat: lineOf(SOURCES.guestChat, /globalSpendMicrousdPerDay: z/),
  chatRateLimit: lineOf(SOURCES.rateLimits, /'chat-message': \{/),
  eeaBlock: lineOf(SOURCES.euAccess, /export const EEA_COUNTRY_CODES/),
  mediaOffer: lineOf(SOURCES.freePools, /"limitedMediaOffer"/),
};

function tierEntry(planTier) {
  const pricing = BILLING_PLAN_PRICING[planTier];
  const limit = MANAGED_USAGE_LIMITS[planTier];
  const product = BILLING_PLAN_PRODUCT_LIMITS[planTier];
  const policy = tierPolicy(planTier);
  const best = dearestChatSlot(planTier);
  const capabilities = Object.entries(BILLING_PLAN_CAPABILITY_TIERS)
    .filter(([, tiers]) => tiers.includes(planTier))
    .map(([capability]) => capability);
  return {
    id: planTier,
    label: pricing.label,
    perSeat: pricing.perSeat === true,
    minSeats: pricing.perSeat ? MIN_PURCHASABLE_SEATS : null,
    contractPriced: pricing.contractPriced === true,
    prices: pricePointsFor(planTier).map((point) => ({
      region: point.region,
      regionLabel: REGIONS[point.region].label,
      channel: point.channel,
      interval: point.interval,
      currency: point.currency,
      localPrice: point.localPrice ?? (point.currency === 'usd' ? round(point.priceUsd, 2) : null),
      usdPerMonth: round(point.priceUsd, 2),
      ...(point.checkoutPricePointInRepo === false
        ? {
            note: 'no INR Stripe price point in apps/web/lib/pricing.ts; checkout needs an INR currency option on the USD price, not visible from the repository',
          }
        : {}),
      ...(point.storePriceAssumed
        ? {
            note: 'store INR price is not in the repository; assumed equal to the web INR price, tax included',
          }
        : {}),
      source: point.region === 'in' ? CURRENT_LINES.indiaPrices : CURRENT_LINES.pricing,
    })),
    allowances: [
      {
        name: 'monthly credits',
        value: limit.unlimited ? 'unlimited' : limit.monthlyCredits,
        unit: 'credit (5,000 microUSD of provider cost)',
        source: CURRENT_LINES.limits,
      },
      {
        name: 'weekly credits',
        value: limit.unlimited ? 'unlimited' : limit.weeklyCredits,
        unit: 'credit',
        source: CURRENT_LINES.limits,
      },
      {
        name: 'five-hour credits',
        value: limit.unlimited ? 'unlimited' : limit.fiveHourCredits,
        unit: 'credit',
        source: CURRENT_LINES.limits,
      },
      {
        name: 'voice minutes',
        value: policy?.allowVoice ? (policy.voiceMinutesPerMonth ?? 'unlimited') : 0,
        unit: 'minute a calendar month',
        source: CURRENT_LINES.tierPolicies,
        productTier: productTierOf(planTier),
      },
      {
        name: 'live voice session block',
        value: LIVE_SESSION_BLOCK_MINUTES,
        unit: 'minute, renewable',
        source: CURRENT_LINES.liveBlock,
      },
      {
        name: 'video seconds',
        value:
          policy?.videoSecondsPerMonth ??
          (capabilities.includes('video_generation') ? 'credit pool only' : 0),
        unit: 'second a month',
        source: CURRENT_LINES.tierPolicies,
      },
      {
        name: 'computer-use requests',
        value: policy?.computerUseHardCap ?? 'credit pool only',
        unit: 'request a month',
        source: CURRENT_LINES.tierPolicies,
      },
      {
        name: 'included search calls',
        value: planTier === 'free' ? FREE_INCLUDED_SEARCH_CALLS : PAID_INCLUDED_SEARCH_CALLS,
        unit: 'call a rolling 30 days, no credits drawn',
        source:
          planTier === 'free' ? CURRENT_LINES.freeIncludedSearch : CURRENT_LINES.paidIncludedSearch,
      },
      {
        name: 'file storage',
        value:
          product.knowledgeStorageBytes === 'unlimited'
            ? 'unlimited'
            : product.knowledgeStorageBytes === 'custom'
              ? 'custom'
              : round(product.knowledgeStorageBytes / BYTES_PER_GIB, 3),
        unit: 'GiB',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'projects',
        value: product.projects,
        unit: 'project',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'custom MCP connectors',
        value: product.customMcpServers,
        unit: 'server',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'connector tools',
        value: product.maxConnectorTools,
        unit: 'tool',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'scheduled tasks',
        value: product.maxScheduledTasks,
        unit: 'task',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'concurrent turns',
        value: product.maxConcurrentTurns,
        unit: 'turn',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'sandboxes',
        value: product.maxSandboxes,
        unit: 'live sandbox',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'sandbox lifetime',
        value: product.sandboxTtlMs / 60_000,
        unit: 'minute',
        source: CURRENT_LINES.productLimits,
      },
      {
        name: 'AGI Code daily ceiling',
        value:
          product.codeHarnessDailyCeilingCents === 'custom'
            ? 'custom'
            : product.codeHarnessDailyCeilingCents / 100,
        unit: 'USD a rolling day, second layer behind the credit ledger',
        source: CURRENT_LINES.productLimits,
      },
      ...(planTier === 'free'
        ? [
            {
              name: 'platform-funded sandbox',
              value: FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD / MICROUSD_PER_USD,
              unit: 'USD a UTC day, outside credits',
              source: CURRENT_LINES.freeSandbox,
            },
            {
              name: 'messages saved',
              value: FREE_DAILY_CAPS.messageWrites,
              unit: 'a UTC day',
              source: CURRENT_LINES.freeDailyCaps,
            },
            {
              name: 'downloads',
              value: FREE_DAILY_CAPS.egressBytes / 1024 ** 2,
              unit: 'MiB a UTC day',
              source: CURRENT_LINES.freeDailyCaps,
            },
            {
              name: 'emails sent',
              value: FREE_DAILY_CAPS.emailSends,
              unit: 'a UTC day',
              source: CURRENT_LINES.freeDailyCaps,
            },
            {
              name: 'semantic searches',
              value: FREE_DAILY_CAPS.vectorQueries,
              unit: 'a UTC day',
              source: CURRENT_LINES.freeDailyCaps,
            },
            {
              name: 'free-quota images',
              value: freeMediaOffer().image,
              unit: 'a day while the temporary quota lasts, $0 provider cost',
              source: CURRENT_LINES.mediaOffer,
            },
            {
              name: 'free-quota videos',
              value: freeMediaOffer().video,
              unit: 'a day while the temporary quota lasts, $0 provider cost',
              source: CURRENT_LINES.mediaOffer,
            },
          ]
        : []),
    ],
    capabilities,
    dearestReachableChatSlot: best
      ? {
          slot: best.slot,
          referenceTurnUsd: round(best.referenceTurnUsd),
          longContextTurnUsd: round(best.longContextTurnUsd),
        }
      : null,
  };
}

const VARIABLE_COST_PER_UNIT = [
  { id: 'credit', unit: 'credit', usd: USD_PER_CREDIT, source: SOURCES.credits },
  {
    id: 'image',
    unit: 'image at 1K',
    usd: IMAGE_MICROUSD / MICROUSD_PER_USD,
    source: `${SOURCES.modelPrices} image_generation slot; ${EXTERNAL.liveVoice.alternativeUrl} read ${OBSERVED_ON}`,
  },
  {
    id: 'video_second_standard',
    unit: 'second at 1080p',
    usd: videoMicrousdPerSecond('1080p') / MICROUSD_PER_USD,
    source: `${SOURCES.modelPrices} video_generation slot`,
  },
  {
    id: 'video_second_lite',
    unit: 'second at 1080p',
    usd: videoMicrousdPerSecond('1080p', videoLiteRoute) / MICROUSD_PER_USD,
    source: `${SOURCES.modelPrices} family google/veo-lite`,
  },
  {
    id: 'voice_live_minute',
    unit: 'minute',
    usd: LIVE_USD_PER_MINUTE,
    source: `${SOURCES.modelPrices} voice_live slot; ${EXTERNAL.liveVoice.url} read ${OBSERVED_ON}`,
  },
  {
    id: 'voice_backend_minute_paid_worst',
    unit: 'minute',
    usd: backendUsdPerMinute(PAID_BACKEND_ROUTE, PARAMS.voiceBackend.worst),
    source: `${SOURCES.modelPrices} voice_live_backend slot x params.voiceBackend.worst`,
  },
  {
    id: 'voice_backend_minute_paid_typical',
    unit: 'minute',
    usd: backendUsdPerMinute(PAID_BACKEND_ROUTE, PARAMS.voiceBackend.typical),
    source: `${SOURCES.modelPrices} voice_live_backend slot x params.voiceBackend.typical`,
  },
  {
    id: 'voice_backend_minute_free_worst',
    unit: 'minute',
    usd: backendUsdPerMinute(FREE_BACKEND_ROUTE, PARAMS.voiceBackend.worst),
    source: `${SOURCES.modelPrices} family ${VOICE_BRANCH.freeBackendFamily} (the ${VOICE_BRANCH.freeBackendSlot} slot on ${VOICE_BRANCH.branch})`,
  },
  {
    id: 'voice_alternative_live_minute',
    unit: 'minute, both directions streaming',
    usd: ALTERNATIVE_VOICE_USD_PER_MINUTE,
    source: `${EXTERNAL.liveVoice.alternativeUrl} read ${OBSERVED_ON} (${EXTERNAL.liveVoice.alternativeLabel}); the registry records only text token prices for this model`,
  },
  {
    id: 'transcription_minute',
    unit: 'minute',
    usd: rateCardUsd('transcription_minute'),
    source: `${SOURCES.rateCard} transcription_minute`,
  },
  {
    id: 'search_grounded',
    unit: 'call',
    usd: rateCardUsd('web_search_grounding'),
    source: `${SOURCES.rateCard} web_search_grounding`,
  },
  {
    id: 'search_fallback',
    unit: 'call',
    usd: rateCardUsd('web_search_perplexity'),
    source: `${SOURCES.rateCard} web_search_perplexity`,
  },
  {
    id: 'sandbox_minute',
    unit: `minute at ${DEFAULT_SANDBOX_VCPU_COUNT} vCPU and ${DEFAULT_SANDBOX_MEMORY_GIB} GiB`,
    usd: SANDBOX_MICROUSD_PER_MINUTE / MICROUSD_PER_USD,
    source: `${SOURCES.rateCard} sandbox rows`,
  },
  {
    id: 'deep_research_run',
    unit: 'run (assumed shape)',
    usd: DEEP_RESEARCH_RUN_USD,
    source: 'params.deepResearchRun on the search_premium slot plus grounded search',
  },
  {
    id: 'storage_gib_month',
    unit: 'GiB-month',
    usd: rateCardUsd('object_storage_gib_month'),
    source: `${SOURCES.rateCard} object_storage_gib_month`,
  },
  {
    id: 'egress_gib',
    unit: 'GiB',
    usd: rateCardUsd('network_egress_gib'),
    source: `${SOURCES.rateCard} network_egress_gib (on-demand; Vercel Pro includes 1 TB)`,
  },
  {
    id: 'turn_infrastructure',
    unit: 'turn',
    usd: footprintMicrousd('turn', 1) / MICROUSD_PER_USD,
    source: 'INFRASTRUCTURE_FOOTPRINT turn rows',
  },
  {
    id: 'email',
    unit: 'email',
    usd: rateCardUsd('email_message_request'),
    source: `${SOURCES.rateCard} email_message_request`,
  },
  {
    id: 'vector_query',
    unit: 'query',
    usd: rateCardUsd('vector_query_request'),
    source: `${SOURCES.rateCard} vector_query_request (estimate)`,
  },
  {
    id: 'auth_active_user_above_included',
    unit: 'monthly retained user above 50,000',
    usd: rateCardUsd('auth_active_user_month'),
    source: `${SOURCES.rateCard} auth_active_user_month`,
  },
].map((row) => ({ ...row, usd: round(row.usd, 6), credits: round(row.usd / USD_PER_CREDIT, 2) }));

const TOP_UPS = [20, 100, 1_000].map((amount) => {
  const quote = quoteTopUp(amount);
  const cost = quote.budgetCents / 100;
  const price = quote.priceCents / 100;
  const web = price - stripeFee(price, 'us', 'monthly') - cost;
  return {
    amountUsd: amount,
    priceUsd: price,
    credits: quote.credits,
    providerCostUsd: cost,
    webContributionUsd: round(web, 2),
    webMarginPct: round((web / price) * 100, 1),
  };
});

const FORMULAS = {
  creditPoolUsd:
    'min(monthlyCredits, weeklyCredits x daysPerMonth/7, fiveHourCredits x daysPerMonth x 24/5) x 0.005',
  stripeFee:
    'price x (card share + Billing 0.7% + Tax 0.5% when registered) + $0.30 (spread over 12 months on yearly)',
  cardShare:
    'us 2.9%; intl_usd 2.9% + 1.5%; in 2.9% + 1.5% + 1% conversion (US Stripe account assumed)',
  storeCommission:
    'price / (1 + storeTaxShareIncluded) x commission share (iOS 30% first year, 15% after a year or with the Small Business Program; Google Play subscriptions 15%)',
  worstCaseCost:
    'creditPoolUsd + voice outside the pool + search outside the pool + Free platform sandbox + storage + egress + db + auth share + infra share',
  voiceOutsidePoolMain:
    'min(voiceMinutesPerMonth, creditPoolUsd / liveUsdPerMinute) x backendUsdPerMinute(worst): on main the live minutes draw credits but delegated backend tokens are not reliably charged',
  voiceOutsidePoolBranch:
    'minutes x (liveUsdPerMinute + backendUsdPerMinute(worst)); unlimited plans have no hard bound',
  backendUsdPerMinute:
    'delegationsPerMinute x (inputTokens x (1 - cachedShare) x inputRate + inputTokens x cachedShare x cacheReadRate + outputTokens x outputRate) / 1e6 + searchesPerMinute x $0.01',
  storage:
    'quota GiB x $/GiB-month + generated media (whole pool spent on images, or on 1080p video where entitled) x 1.5 MiB or 1 MiB/s',
  egress:
    'Free: 500 MiB a day cap x daysPerMonth x $/GiB; paid: same figure as an assumption, no code cap',
  db: 'turns x (0.1 CU-second + 10 cache commands) + semantic searches + emails, at the Free daily caps x daysPerMonth',
  authShare: '(Clerk monthly fee + MRUs above 50,000 x $0.02) / activeAccounts',
  infraShare: '(all fixed monthly vendor costs except Clerk) / activeAccounts',
  contribution: 'price - store tax - payment fee - store commission - worst or typical cost',
  grossMarginPct: 'contribution / price x 100',
  worstCaseBudget: 'price x (1 - targetGrossMargin) - store tax - payment fee - store commission',
  maxMonthlyCredits: '(worstCaseBudget - non-pool cost - voice) / 0.005',
  maxVoiceMinutes:
    '(worstCaseBudget - non-pool cost - creditPoolUsd) / (liveUsdPerMinute + backendUsdPerMinute(worst))',
  breakEven:
    '(fixedMonthly [+ engineering]) / (mix contribution per paying user - support per paying user - freeUsersPerPayingUser x Free typical cost)',
  support: 'supportMinutesPerPayingUser / 60 x BLS support wage x supportLoadedMultiplier',
  engineering: 'engineeringFte x BLS software developer median pay / 12',
  storePriceForSameMargin: '(web price - web payment fee) / (1 - store commission share)',
};

const SOURCE_LIST = [
  ...Object.entries(SOURCES).map(([id, file]) => ({ id, file, date: 'read at run time' })),
  ...Object.entries(CURRENT_LINES).map(([id, fileLine]) => ({
    id: `line_${id}`,
    file: fileLine,
    date: 'read at run time',
  })),
  {
    id: 'voice_branch',
    file: `${VOICE_BRANCH.branch} ${VOICE_BRANCH.meteringCommit}, ${VOICE_BRANCH.backendUsageCommit}`,
    date: OBSERVED_ON,
    note: VOICE_BRANCH.note,
  },
  ...Object.entries(EXTERNAL).flatMap(([id, row]) =>
    Object.entries(row)
      .filter(([key, value]) => /url$/i.test(key) && typeof value === 'string')
      .map(([key, value]) => ({ id: `${id}.${key}`, url: value, date: row.readOn ?? OBSERVED_ON })),
  ),
];

const FLAGGED = [];
for (const tier of Object.keys(RECOMMENDATIONS)) {
  for (const row of RECOMMENDATIONS[tier]) {
    if (row.flags.length)
      FLAGGED.push({
        tier,
        region: row.region,
        channel: row.channel,
        interval: row.interval,
        flags: row.flags,
        grossMarginPctToday: row.currentGrossMarginPctToday,
        grossMarginPctVoiceBranch: row.currentGrossMarginPctVoiceBranch,
      });
  }
}

const UNKNOWNS = [
  'Stripe account country is not recorded; fees assume a US account (an India account would charge 2% domestic and 3% plus 2% conversion on international cards).',
  'Which Stripe Tax registrations exist is not recorded; the 0.5% Tax fee is applied everywhere as the worst case, and India GST collection on INR sales depends on a registration the repository cannot show.',
  'Whether the USD Pro, Max and Max 20x prices carry an INR currency option in Stripe; without it Indian checkout for those plans stays closed (apps/web/lib/server/localized-pricing-service.ts).',
  'App Store and Google Play INR price points are not in the repository; India store rows assume the web INR price, 18% GST included.',
  'App Store Small Business Program enrollment is not recorded; code commits 30% first-year commission.',
  'Google Play now charges 20% plus 5% on one-time purchases for new US, EEA and UK installs; mobile-iap.ts records 15% for Android top-ups.',
  'Delegated voice backend usage per minute is an assumption (params.voiceBackend); no metered sessions are in the repository.',
  'Max, Max 20x and Team Premium file storage is unlimited and paid downloads have no cap beyond the 120 requests a minute file-serving rate limit; their worst case uses params.unlimitedStorageGibAssumed and the Free download cap as assumptions.',
  'Vendor plans actually held (Vercel, Clerk, Sentry, Resend, E2B) are taken from the rate card or vendor pages, not from invoices; Neon is the Free plan per the owner.',
  'The sjc regional premium for the two Fly machines is not stated in Fly pricing text; base-region prices are used.',
  'Domain and GitHub costs are not recorded in the repository.',
  'Active accounts (1,000), free users per paying user (10), support minutes per paying user (5) and the engineering budget (1 FTE at the BLS median) are owner inputs, not measurements.',
  'Enterprise is contract-priced with unlimited managed usage, so no worst case can be computed.',
  'The registry records Google 3.8 Live at text token prices; its audio rates come from the vendor page, so the voice alternative is not yet priced in code.',
  `Guest chat spend is capped at ${usd(GUEST_DAILY_SPEND_MICROUSD / MICROUSD_PER_USD)} a day by default (${CURRENT_LINES.guestChat}); its actual model and daily spend are not observable from the repository.`,
];

const OUTPUT = {
  asOf: new Date().toISOString().slice(0, 10),
  currency: 'USD per user (or seat) per month unless stated',
  generatedBy: 'node scripts/research/unit-economics-2026-09-05.mjs --json <path>',
  parameters: PARAMS,
  formulas: FORMULAS,
  sources: SOURCE_LIST,
  regions: Object.fromEntries(Object.entries(REGIONS).map(([id, region]) => [id, region.label])),
  regionNotes: [
    `EEA traffic is blocked in production (AGI_BLOCK_EEA_TRAFFIC, ${CURRENT_LINES.eeaBlock}), so EU VAT does not arise today.`,
    'Web prices are tax-exclusive (apps/web/lib/billing/tax-policy.ts): tax is added on top and is not revenue.',
    `INR is converted at ${INR_PER_USD.toFixed(2)} INR per USD (ECB reference rates of ${EXTERNAL.fx.referenceDate}).`,
  ],
  tiers: PLAN_ORDER.map(tierEntry),
  variableCostPerUnit: VARIABLE_COST_PER_UNIT,
  worstCase: WORST,
  typicalCase: TYPICAL.map(({ _lines, ...rest }) => rest),
  fixedMonthly: {
    items: FIXED_MONTHLY.map((row) => ({ ...row, usdPerMonth: round(row.usdPerMonth, 2) })),
    totalUsd: round(FIXED_TOTAL, 2),
    unknown: FIXED_UNKNOWN,
    guestChatWorstCaseUsd: round(GUEST_CHAT_WORST_MONTHLY_USD, 2),
    perActiveAccountUsd: round(FIXED_TOTAL / PARAMS.activeAccounts, 4),
    sensitivity: ACTIVE_ACCOUNT_SENSITIVITY.map((accounts) => ({
      activeAccounts: accounts,
      perActiveAccountUsd: round(FIXED_TOTAL / accounts, 4),
    })),
  },
  peopleAssumptions: {
    supportMinutesPerPayingUser: PARAMS.supportMinutesPerPayingUser,
    supportUsdPerHour: EXTERNAL.wages.supportUsdPerHour,
    supportLoadedMultiplier: PARAMS.supportLoadedMultiplier,
    supportUsdPerPayingUser: round(supportUsdPerPayingUser, 2),
    engineeringFte: PARAMS.engineeringFte,
    engineeringUsdPerYear: EXTERNAL.wages.engineeringUsdPerYear,
    engineeringUsdPerMonth: round(engineeringUsdPerMonth, 2),
    basis: `BLS ${EXTERNAL.wages.dataPeriod} medians (${EXTERNAL.wages.supportUrl}, ${EXTERNAL.wages.engineeringUrl}); every value is a parameter for the owner to replace`,
    statedAsFact: false,
  },
  breakEven: BREAK_EVEN,
  topUps: { creditsPerUsd: TOP_UP_UNITS_PER_USD, rows: TOP_UPS },
  groundingFreePool: {
    requests: groundingPool.poolFreeRequests,
    window: groundingPool.poolWindow,
    perActiveAccount: round(groundingPool.poolFreeRequests / PARAMS.activeAccounts, 2),
    note: 'platform-wide free grounded searches; the worst case prices every search at the paid rate',
    source: SOURCES.groundingPool,
  },
  freeQuotaOffer: {
    costToUsWhileQuotaLasts: 0,
    ...FREE_POOL_SUMMARY,
    note: 'QwenCloud allocations serve Free chat and the limited media offer at $0; spendOnCapacityShortage is false, so exhaustion falls back to the upgrade prompt, not paid spend.',
  },
  recommendations: {
    targetGrossMargin: PARAMS.targetGrossMargin,
    targetBasis: `owner decision of 2026-10-10 (50% worst case); for reference, ${EXTERNAL.marginBenchmark.url} reports ~60% average gross margin for AI "Shooting Stars" and ~25% for "Supernovas", read ${OBSERVED_ON}`,
    principle:
      'Allowances start from what stays at the target margin in the worst case; competitor limits are only a ceiling.',
    superseded:
      "Per-feature allowances are superseded by the owner decision of 2026-10-10 to put every feature in one token-cost pool; see tokenBudgets. byTier keeps the per-price-point audit of today's allowances.",
    byTier: RECOMMENDATIONS,
    freeAllowanceAudit: allowanceAudit('free', {
      priceUsd: 0,
      storeTaxUsd: 0,
      paymentFeeUsd: 0,
      storeCommissionUsd: 0,
    }),
    flagged: FLAGGED,
  },
  tokenBudgets50: TOKEN_BUDGETS_50,
  tokenBudgets: {
    superseded:
      'Sized at 60% of list price on the current routing; superseded by tokenBudgets50 (owner decisions of 2026-10-10).',
    decision:
      'Owner, 2026-10-10: one usage budget per plan in provider token cost (1 credit = 5,000 microUSD); chat, voice (live minutes plus backend tokens), images, video, search, sandbox and research all draw it. The temporary free-quota layer stays separate.',
    targetGrossMargin: PARAMS.supersededTokenBudgetMargin,
    formulas: {
      maxMonthlyCredits:
        'floor((price x (1 - targetGrossMargin) - store tax - payment fee - store commission - nonPool) / 0.005)',
      nonPool:
        'storage at the recommended quota + downloads at leanDownloadCostShareOfPrice x price + leanDailyMessages turns + semantic searches + emails + auth share + infra share',
      worstCase: 'monthly credits x 0.005 + nonPool + fees or commission',
      weekly: 'monthly x weeklyShareOfMonthly',
      fiveHour:
        'min(weekly, max(monthly x fiveHourShareOfMonthly, minimumFiveHourVoiceMinutes x credits per worst-case voice minute))',
      heaviestDayShareOfMonth: 'min(fiveHour x 24/5, weekly) / monthly',
      equivalents: 'credits / credits per unit, units from unitCredits',
      storePriceForSameMargin: '(US web price - web fee) / (1 - store commission share)',
    },
    windowReasoning: [
      `A five-hour window of ${pct(PARAMS.fiveHourShareOfMonthly * 100)} of the month means a full day of back-to-back windows (24/5 = 4.8) reaches at most ${pct(PARAMS.fiveHourShareOfMonthly * 4.8 * 100)} of the month, so no single day can drain it.`,
      `A weekly window of ${pct(PARAMS.weeklyShareOfMonthly * 100)} means the month lasts at least four weeks at maximum use; it is today's shape on every paid plan.`,
      `The five-hour window never drops below ${PARAMS.minimumFiveHourVoiceMinutes} worst-case voice minute, so a small plan can still hold a short call; on Basic that floor lifts the five-hour window above 2.5%, and the weekly window then bounds the heaviest day at 25%.`,
      'dailyCredits stays 0: the five-hour window already bounds a day, and a third window would add a refusal reason without adding protection.',
      'Max 20x today allows 1,000 credits a five-hour window (5% of the month), so one heavy day can take 24% of the month and nearly a whole week; the proposal brings it to the same 2.5% shape as the other plans.',
    ],
    unitCredits: Object.fromEntries(
      PLAN_ORDER.filter((tier) => tier !== 'enterprise').map((tier) => [tier, unitCredits(tier)]),
    ),
    byTier: TOKEN_BUDGETS,
    voiceBranchConflict: `${VOICE_BRANCH.branch} commit ${VOICE_BRANCH.meteringCommit} takes live voice out of the credit pool; the single-pool decision needs it reverted to drawing credits, while ${VOICE_BRANCH.backendUsageCommit} (charging delegated backend tokens) is required for the pool to be complete.`,
  },
  unknowns: UNKNOWNS,
};

if (jsonOutPath) writeFileSync(jsonOutPath, `${JSON.stringify(OUTPUT, null, 2)}\n`);

const out = [];
const say = (line = '') => out.push(line);

say('# Unit economics model output\n');
say(
  `Every price is read when the script runs: credits from ${SOURCES.credits}, plan allowances from ${SOURCES.allowances}, tool, media, search, sandbox and infrastructure rates from ${SOURCES.rateCard}, plan prices, product limits, Free caps and capability gates from ${SOURCES.plans}, India prices from ${SOURCES.regionalPricing}, store commission from ${SOURCES.storeCommission}, top-ups from ${SOURCES.topUps}, voice minutes and the plan-to-policy mapping from the text of ${SOURCES.tierPolicies}, and model prices and routing from ${SOURCES.modelPrices}. Card, store, exchange-rate and vendor figures without a repository owner are the dated observations in the script's EXTERNAL block. Assumptions are the PARAMS block; \`--params <file>\` overrides them and \`--json <file>\` writes the full model.\n`,
);

say('## Assumptions\n');
say(
  `- Active accounts sharing fixed costs: ${count(PARAMS.activeAccounts)}. Target gross margin: ${pct(PARAMS.targetGrossMargin * 100)} worst case (owner decision of 2026-10-10; Bessemer reports ~60% for AI "Shooting Stars", ${EXTERNAL.marginBenchmark.url}).`,
);
say(
  `- Gross margin here is (price - store tax - payment fee - store commission - variable cost) / price, at the tax-exclusive list price.`,
);
say(
  `- Card fees assume a US Stripe account with Stripe Billing (0.7%) and Stripe Tax (0.5%) on every charge. India adds the international (1.5%) and conversion (1%) surcharges. INR converts at ${INR_PER_USD.toFixed(2)} per USD.`,
);
say(
  `- iOS uses the ${PARAMS.iosCommission.replace(/_/g, ' ')} App Store commission (${pct(iosShare() * 100)}); Google Play subscriptions ${pct(androidShare() * 100)}. India store rows assume the web INR price with ${pct(PARAMS.indiaStoreTaxShareIncluded * 100)} GST included.`,
);
say(
  `- Voice backend, worst case: ${PARAMS.voiceBackend.worst.delegationsPerMinute} delegations a minute of ${count(PARAMS.voiceBackend.worst.inputTokens)} input tokens (${pct(PARAMS.voiceBackend.worst.cachedShare * 100)} cached) and ${count(PARAMS.voiceBackend.worst.outputTokens)} output tokens, plus ${PARAMS.voiceBackend.worst.searchesPerMinute} searches a minute. Typical: ${PARAMS.voiceBackend.typical.delegationsPerMinute} delegations of ${count(PARAMS.voiceBackend.typical.inputTokens)} in and ${count(PARAMS.voiceBackend.typical.outputTokens)} out.`,
);
say(
  `- Unlimited voice is shown at ${PARAMS.voiceHumanHoursPerDay} hours a day; nothing in code stops a longer total, because each conversation may hold one open session and a user may open many conversations.`,
);
say(
  `- Worst-case turns, semantic searches and emails use the Free daily caps for every plan (${count(FREE_DAILY_CAPS.messageWrites)} messages, ${count(FREE_DAILY_CAPS.vectorQueries)} searches, ${count(FREE_DAILY_CAPS.emailSends)} emails a day). Paid plans have no such cap; the chat rate limit (${CHAT_MESSAGES_PER_MINUTE} a minute, scaled by plan concurrency) is the only bound.`,
);
say(
  `- Unlimited file storage is shown at ${PARAMS.unlimitedStorageGibAssumed} GiB, and paid downloads at the Free cap of ${count(FREE_EGRESS_GIB_PER_MONTH, 1)} GiB a month; both are assumptions, not limits.`,
);
say(
  `- A deep research run is assumed to be ${PARAMS.deepResearchRun.groundedSearches} grounded searches and ${PARAMS.deepResearchRun.steps} steps of ${count(PARAMS.deepResearchRun.inputTokens)} in and ${count(PARAMS.deepResearchRun.outputTokens)} out: ${usd(DEEP_RESEARCH_RUN_USD)} a run.\n`,
);

say('## Variable cost per unit\n');
say('| Unit | Per | Provider cost | Credits | Source |');
say('| --- | --- | --- | --- | --- |');
for (const row of VARIABLE_COST_PER_UNIT) {
  say(
    `| ${row.id} | ${row.unit} | ${usd(row.usd, 4)} | ${count(row.credits, 2)} | ${row.source} |`,
  );
}
say('');

say('## Fixed monthly costs\n');
say('| Item | Monthly | Basis |');
say('| --- | --- | --- |');
for (const row of FIXED_MONTHLY) say(`| ${row.id} | ${usd(row.usdPerMonth)} | ${row.basis} |`);
say(
  `| **Total** | **${usd(FIXED_TOTAL)}** | ${usd(FIXED_TOTAL / PARAMS.activeAccounts)} per active account at ${count(PARAMS.activeAccounts)}; ${ACTIVE_ACCOUNT_SENSITIVITY.map((accounts) => `${usd(FIXED_TOTAL / accounts)} at ${count(accounts)}`).join(', ')} |`,
);
say(
  `\nNot included: ${FIXED_UNKNOWN.map((row) => `${row.id} (${row.note})`).join('; ')}. Guest chat may spend up to ${usd(GUEST_CHAT_WORST_MONTHLY_USD)} a month at its default daily cap.\n`,
);

say('## Worst case per plan\n');
say(
  `Every allowance used in full. Chat, images, video, paid search, deep research, sandbox, transcription and read-aloud all draw one credit pool at provider cost, so the pool is the worst case for all of them together, whichever model is used. "Main" is the code on main today, where delegated voice backend tokens go uncharged; "voice branch" is ${VOICE_BRANCH.branch} (owner decision D1), where live voice leaves the pool; "one pool" is the owner decision of 2026-10-10, where voice, backend tokens included, draws the pool like everything else.\n`,
);
say(
  '| Plan | Price | Credit pool | Voice outside pool (main) | Voice outside pool (branch) | Other outside pool | Worst cost (main) | Worst cost (branch) | Worst cost (one pool) | Unbounded |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(WORST)) {
  const main = WORST[tier].main;
  const branch = WORST[tier].branch;
  const other = branch.totalCostUsd - branch.lineItems.chat - branch.lineItems.voice;
  say(
    `| ${planLabel(tier)} | ${usd(BILLING_PLAN_PRICING[tier].monthlyPriceUsd)} | ${usd(main.lineItems.chat)} | ${usd(main.lineItems.voice)} (${count(main.voice.minutes)} min) | ${usd(branch.lineItems.voice)} (${count(branch.voice.minutes)} min) | ${usd(other)} | ${usd(main.totalCostUsd)} | ${usd(branch.totalCostUsd)} | ${usd(WORST[tier].pool.totalCostUsd)} | ${branch.unboundedItems.join(', ') || 'none'} |`,
  );
}
say('');
say('Line items, voice branch:\n');
say(
  '| Plan | chat (pool) | voice | search | sandbox | storage | egress | db | auth | infra share | total |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(WORST)) {
  const l = WORST[tier].branch.lineItems;
  say(
    `| ${planLabel(tier)} | ${usd(l.chat)} | ${usd(l.voice)} | ${usd(l.search)} | ${usd(l.sandbox)} | ${usd(l.storage)} | ${usd(l.egress)} | ${usd(l.db)} | ${usd(l.auth)} | ${usd(l.infraShare)} | ${usd(WORST[tier].branch.totalCostUsd)} |`,
  );
}
say('');

say('### Worst-case margin by region and channel\n');
say(
  '| Plan | Region | Channel | Interval | Price | Fee | Store tax | Commission | Margin (main) | Margin (branch) | Margin (one pool) |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(WORST)) {
  for (const row of WORST[tier].branch.byPricePoint) {
    const main = WORST[tier].main.byPricePoint.find(
      (candidate) =>
        candidate.region === row.region &&
        candidate.channel === row.channel &&
        candidate.interval === row.interval,
    );
    const pool = WORST[tier].pool.byPricePoint.find(
      (candidate) =>
        candidate.region === row.region &&
        candidate.channel === row.channel &&
        candidate.interval === row.interval,
    );
    say(
      `| ${planLabel(tier)} | ${row.region} | ${row.channel} | ${row.interval} | ${usd(row.priceUsd)} | ${usd(row.paymentFeeUsd)} | ${usd(row.storeTaxUsd)} | ${usd(row.storeCommissionUsd)} | ${pct(main.grossMarginPct)} | ${pct(row.grossMarginPct)} | ${pct(pool.grossMarginPct)} |`,
    );
  }
}
say('');

say('## Typical case per profile\n');
say(
  '| Profile | Plan | Credits used | chat | voice | images | video | search | sandbox | storage+egress | db | auth+infra | Cost | Margin, US web |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const result of TYPICAL) {
  const l = result.lineItems;
  const usWeb = result.byPricePoint.find(
    (row) => row.region === 'us' && row.channel === 'web' && row.interval === 'monthly',
  );
  say(
    `| ${result.profile} | ${planLabel(result.planTier)} | ${count(result.credits, 1)}${result.cappedByPool ? ' (capped)' : ''} | ${usd(l.chat)} | ${usd(l.voice)} | ${usd(l.images)} | ${usd(l.video)} | ${usd(l.search)} | ${usd(l.sandbox)} | ${usd(l.storage + l.egress)} | ${usd(l.db)} | ${usd(l.auth + l.infraShare)} | ${usd(result.totalCostUsd)} | ${usWeb ? pct(usWeb.grossMarginPct) : 'no revenue'} |`,
  );
}
say('');

say('## Break-even\n');
say(
  `Support ${usd(supportUsdPerPayingUser)} per paying user a month; engineering ${usd(engineeringUsdPerMonth)} a month; ${PARAMS.freeUsersPerPayingUser} Free accounts per paying user at ${usd(FREE_TYPICAL_COST)} each (typical). Fixed vendor costs ${usd(FIXED_TOTAL)} a month.\n`,
);
say(
  '| Mix | Basis | Contribution per paying user | Paying users for fixed costs | With engineering |',
);
say('| --- | --- | --- | --- | --- |');
for (const row of BREAK_EVEN) {
  say(
    `| ${row.mix} | ${row.basisLabel} | ${usd(row.contributionPerPayingUserUsd)} | ${count(row.payingUsersToCoverFixed)} | ${count(row.payingUsersToCoverFixedAndEngineering)} |`,
  );
}
say('');

say(`## Token budgets at ${pct(TB50_MARGIN * 100)} worst-case margin\n`);
say(
  `Owner decisions of 2026-10-10: a ${pct(TB50_MARGIN * 100)} worst-case margin, everyday chat on the fast OpenAI family (backups: the Anthropic small model and the Qwen flash family), hard tasks on the balanced OpenAI or Sonnet family, flagships manual on Max, and budgets that follow each channel's net revenue. Margin is measured on net revenue (price less tax, payment fee and store commission): credits = floor((net revenue x ${1 - TB50_MARGIN} - non-pool cost) / ${USD_PER_CREDIT}).\n`,
);
say(
  '| Plan | Today: monthly / weekly / 5-hour | Proposed: monthly / weekly / 5-hour | Change | If margin is on list price | Worst margin (net / list) | Typical margin (net) |',
);
say('| --- | --- | --- | --- | --- | --- | --- |');
for (const [tier, row] of Object.entries(TB50_BASE)) {
  const { current, proposal } = row;
  say(
    `| ${planLabel(tier)} | ${count(current.monthlyCredits)} / ${count(current.weeklyCredits)} / ${count(current.fiveHourCredits)} | ${count(proposal.monthlyCredits)} / ${count(proposal.weeklyCredits)} / ${count(proposal.fiveHourCredits)} | ${proposal.changeFromToday} | ${count(proposal.creditsIfMarginOnListPrice)} | ${pct(proposal.worstCaseMarginOnNetRevenuePct)} / ${pct(proposal.worstCaseMarginOnListPricePct)} | ${pct(proposal.typicalCaseMarginOnNetRevenuePct)} |`,
  );
}
say('');
say('### Budget by region and channel\n');
say(
  'Safe monthly credits at each price point, and the ratio to US web. Store rows use the US price unless marked India.\n',
);
const tb50Columns = [
  'us_web',
  'intl_web',
  'india_web',
  'us_ios_30',
  'us_ios_15',
  'us_play',
  'india_ios_30',
  'india_play',
];
const tb50Labels = {
  us_web: 'US web',
  intl_web: 'Rest of world web',
  india_web: 'India web',
  us_ios_30: 'iOS 30%',
  us_ios_15: 'iOS 15%',
  us_play: 'Google Play 15%',
  india_ios_30: 'India iOS 30%',
  india_play: 'India Play 15%',
};
say(`| Plan | ${tb50Columns.map((id) => tb50Labels[id]).join(' | ')} |`);
say(`| --- | ${tb50Columns.map(() => '---').join(' | ')} |`);
for (const [tier, row] of Object.entries(TB50_BASE)) {
  const cells = tb50Columns.map((id) => {
    const channel = row.byChannel.find((candidate) => candidate.id === id);
    return channel
      ? `${count(channel.maxMonthlyCredits)} (${channel.ratioToUsWeb ?? 'n/a'})`
      : 'not sold';
  });
  say(`| ${planLabel(tier)} | ${cells.join(' | ')} |`);
}
say('');
say('### What the budget buys, everyday model first\n');
const mix = PARAMS.everydayMessage;
say(
  `An everyday message is ${count(mix.base.inputTokens)} tokens in and ${count(mix.base.outputTokens)} out with ${pct(mix.base.cachedShare * 100)} cached, except ${pct(mix.long.share * 100)} of messages at ${count(mix.long.inputTokens)} tokens in and ${pct(mix.veryLong.share * 100)} at ${count(mix.veryLong.inputTokens)}, each priced at its long-context tier. That is ${count(TB50_UNIT.everydayMessage.credits, 3)} credits on the everyday route (${count(TB50_UNIT.everydayMessage.withoutLongContextCredits, 3)} without the long messages); the backups cost ${TB50_UNIT.backups.map((backup) => `${count(backup.credits, 3)} (${backup.route})`).join(' and ')}. A premium message is the same shape on the dearer of ${TB50_UNIT.premiumMessage.map((premium) => `${premium.route} (${count(premium.credits, 2)})`).join(' and ')}. Voice uses the owner's ${PARAMS.uiVoiceCreditsPerMinute} credits a minute; the model gives ${TB50_UNIT.voiceMinuteTypical} typical and ${TB50_UNIT.voiceMinuteHeavy} heavy. An image is ${TB50_UNIT.image} credits.\n`,
);
say(
  '| Plan | Credits | Everyday messages | Premium messages | Voice minutes at 13 (typical / heavy) | Images | Lite videos (8 s) |',
);
say('| --- | --- | --- | --- | --- | --- | --- |');
for (const [tier, row] of Object.entries(TB50_BASE)) {
  const f = row.proposal.friendly;
  say(
    `| ${planLabel(tier)} | ${count(f.credits)} | ${count(f.everydayMessages)} | ${count(f.premiumMessages)} | ${count(f.voiceMinutesAtOwnerRate)} (${count(f.voiceMinutesTypical)} / ${count(f.voiceMinutesHeavy)}) | ${count(f.images)} | ${count(f.videosLite)} |`,
  );
}
say('');
say('### Margin averaged across users\n');
say(
  'Typical profiles on the proposed routing, each capped at the proposed budget, weighted within each plan and blended by the launch plan mix on US web prices.\n',
);
say(
  '| Plan | Profile weights | Price | Net revenue | Average cost | Margin on net revenue | Margin on list price |',
);
say('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of TB50_AVERAGE.byPlan) {
  const weights = Object.entries(row.weights)
    .map(([name, weight]) => `${name} ${pct(weight * 100)}`)
    .join(', ');
  say(
    `| ${planLabel(row.planTier)} | ${weights} | ${usd(row.priceUsd)} | ${usd(row.netRevenueUsd)} | ${usd(row.averageCostUsd)} | ${pct(row.marginOnNetRevenuePct)} | ${pct(row.marginOnListPricePct)} |`,
  );
}
const blended = TB50_AVERAGE.blended;
say(
  `| **Blended** | ${Object.entries(TB50_AVERAGE.planMix)
    .map(([tier, share]) => `${planLabel(tier)} ${pct(share * 100)}`)
    .join(
      ', ',
    )} | ${usd(blended.revenuePerUserUsd)} | ${usd(blended.netRevenuePerUserUsd)} | ${usd(blended.costPerUserUsd)} | ${pct(blended.marginOnNetRevenuePct)} | ${pct(blended.marginOnListPricePct)} |`,
);
say('');

say('## Which allowances lose money\n');
say(
  'Each allowance priced alone at its worst case, against the US web price after fees, and against the lowest-revenue channel. "Loses money on its own" means that one allowance costs more than the plan brings in.\n',
);
say(
  '| Plan | Allowance | Worst cost | US web net revenue | Verdict, US web | Lowest-revenue channel | Verdict there |',
);
say('| --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(RECOMMENDATIONS)) {
  const rows = RECOMMENDATIONS[tier];
  const usWeb = rows.find(
    (row) => row.region === 'us' && row.channel === 'web' && row.interval === 'monthly',
  );
  const lowest = [...rows].sort(
    (a, b) => a.allowanceAudit[0].netRevenueUsd - b.allowanceAudit[0].netRevenueUsd,
  )[0];
  if (!usWeb) {
    for (const audit of allowanceAudit(tier, {
      priceUsd: 0,
      storeTaxUsd: 0,
      paymentFeeUsd: 0,
      storeCommissionUsd: 0,
    })) {
      say(
        `| ${planLabel(tier)} | ${audit.allowance} | ${usd(audit.worstUsd)} | no revenue | ${audit.verdict} | n/a | n/a |`,
      );
    }
    continue;
  }
  usWeb.allowanceAudit.forEach((audit, index) => {
    const low = lowest.allowanceAudit[index];
    say(
      `| ${planLabel(tier)} | ${audit.allowance} | ${usd(audit.worstUsd)} | ${usd(audit.netRevenueUsd)} | ${audit.verdict} | ${lowest.region} ${lowest.channel} ${lowest.interval} (${usd(low.netRevenueUsd)}) | ${low.verdict} |`,
    );
  });
}
say('');

say('## Per-feature budget audit, superseded by token budgets\n');
say(
  'Kept to show where each price point stands with voice outside the pool, as on the voice branch. The recommendation is the token budget section below.\n',
);
say(
  `For each plan and price point: the worst-case budget is price x ${1 - PARAMS.targetGrossMargin} minus fees and commission; non-pool costs come off first; the rest funds credits and voice.\n`,
);
say(
  '| Plan | Region | Channel | Interval | Budget | Available | Credits now | Max credits, voice as now | Max credits, no voice | Voice now (min) | Max voice min, credits as now | Flags |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(RECOMMENDATIONS)) {
  for (const row of RECOMMENDATIONS[tier]) {
    say(
      `| ${planLabel(tier)} | ${row.region} | ${row.channel} | ${row.interval} | ${usd(row.worstCaseBudgetUsd)} | ${usd(row.availableForCreditsAndVoiceUsd)} | ${count(monthlyCredits(tier))} | ${count(row.maxMonthlyCreditsWithCurrentVoice)} | ${count(row.maxMonthlyCreditsWithNoVoice)} | ${count(row.currentVoiceMinutes)} | ${count(row.maxVoiceMinutesWithCurrentCredits)} | ${row.flags.join('; ') || 'none'} |`,
    );
  }
}
say('');

say('## Token budgets at 60% of list price, superseded by the 50% budgets above\n');
say(
  `One budget per plan in provider token cost, everything drawing it (owner decision of 2026-10-10). The safe maximum is floor((price x ${1 - PARAMS.supersededTokenBudgetMargin} - fees - commission - non-pool cost) / ${USD_PER_CREDIT}); non-pool cost uses the recommended storage, download and message caps. The proposal takes the United States web price and the window shape below.\n`,
);
say(
  '| Plan | US web price | Today: monthly / weekly / 5-hour | Proposed: monthly / weekly / 5-hour | Change | Heaviest day, today / proposed | Worst margin | Typical margin | iOS price for same margin (first year / SBP) |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(TOKEN_BUDGETS).filter((tier) => tier !== 'free')) {
  const { current, proposal } = TOKEN_BUDGETS[tier];
  const ios = proposal.storePriceForSameMarginUsd
    ? `${usd(proposal.storePriceForSameMarginUsd.iosFirstYear)} / ${usd(proposal.storePriceForSameMarginUsd.iosSmallBusiness)}`
    : 'not sold in stores';
  say(
    `| ${planLabel(tier)} | ${usd(BILLING_PLAN_PRICING[tier].monthlyPriceUsd)} | ${count(current.monthlyCredits)} / ${count(current.weeklyCredits)} / ${count(current.fiveHourCredits)} | ${count(proposal.monthlyCredits)} / ${count(proposal.weeklyCredits)} / ${count(proposal.fiveHourCredits)} | ${proposal.changeFromToday} | ${pct(current.heaviestDayShareOfMonth * 100)} / ${pct(proposal.heaviestDayShareOfMonth * 100)} | ${pct(proposal.worstCaseGrossMarginPct)} | ${pct(proposal.typicalCaseGrossMarginPct)} | ${ios} |`,
  );
}
const freeBudget = TOKEN_BUDGETS.free;
say(
  `\nFree: ${PARAMS.freeUsersPerPayingUser} Free accounts per paying user (${pct(freeBudget.assumptions.impliedConversionShare * 100)} conversion) and ${pct(PARAMS.freeAcquisitionShareOfContribution * 100)} of a paying user's typical contribution (${usd(freeBudget.assumptions.paidContributionPerPayingUserUsd)}) spent on Free fund ${usd(freeBudget.fundedPerFreeUserUsd, 3)} per Free account a month. Marginal storage, ${PARAMS.freeDailyDownloadMiB} MiB of downloads a day and messages take ${usd(freeBudget.marginalNonPoolUsd, 3)}, leaving ${count(freeBudget.maxMonthlyCredits)} credits (today ${count(freeBudget.currentMonthlyCredits)}, ${freeBudget.currentVersusSafeMaximum}). Proposed: ${count(freeBudget.proposal.monthlyCredits)} / ${count(freeBudget.proposal.weeklyCredits)} / ${count(freeBudget.proposal.fiveHourCredits)} credits, with the $1-a-day platform sandbox and the 20 included searches folded into the pool. Free chat stays on zero-cost routes and the temporary free quota, outside the budget.\n`,
);

say('Window reasoning:\n');
for (const line of OUTPUT.tokenBudgets.windowReasoning) say(`- ${line}`);
say('');

say('### Safe maximum by region and channel\n');
say(
  '| Plan | Region | Channel | Interval | Price | Net revenue | Safe max credits | Today | Today versus safe max | Worst margin on the current budget, recommended caps |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(TOKEN_BUDGETS).filter((tier) => tier !== 'free')) {
  for (const row of TOKEN_BUDGETS[tier].byPricePoint) {
    const price =
      row.localPrice && row.region === 'in'
        ? `INR ${count(row.localPrice)} (${usd(row.priceUsd)})`
        : usd(row.priceUsd);
    say(
      `| ${planLabel(tier)} | ${row.region} | ${row.channel} | ${row.interval} | ${price} | ${usd(row.netRevenueUsd)} | ${count(row.maxMonthlyCredits)} | ${count(row.currentMonthlyCredits)} | ${row.currentVersusSafeMaximum} | ${pct(row.currentWorstCaseGrossMarginPct)} |`,
    );
  }
}
say('');

say('### What the proposed budget buys\n');
say(
  `Each figure assumes the whole month's budget goes to that one thing. A message is the Normal profile's shape (${count(MESSAGE_SHAPE.avgInputTokens)} tokens in, ${count(MESSAGE_SHAPE.avgOutputTokens)} out, ${pct(MESSAGE_SHAPE.cacheHitShare * 100)} cached); a video is ${PARAMS.uiVideoSeconds} seconds at 1080p.\n`,
);
say(
  '| Plan | Credits | Default-model messages | Best-model messages | Voice minutes, typical (heavy) | Images | Videos (lite model) | Searches | Deep research runs | Sandbox minutes |',
);
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of Object.keys(TOKEN_BUDGETS)) {
  const e = TOKEN_BUDGETS[tier].proposal.equivalents;
  say(
    `| ${planLabel(tier)} | ${count(e.credits)} | ${typeof e.defaultModelMessages === 'string' ? 'not metered' : count(e.defaultModelMessages)} | ${count(e.bestModelMessages)} | ${count(e.voiceMinutesTypical)} (${count(e.voiceMinutesWorst)}) | ${count(e.images)} | ${count(e.videos)} (${count(e.videosLite)}) | ${count(e.searchCalls)} | ${count(e.deepResearchRuns)} | ${count(e.sandboxMinutes)} |`,
  );
}
say('');

say('### Credits per unit, for "about N left" in the app\n');
const unitTiers = ['free', 'pro', 'max_15x'];
say(`| Unit | ${unitTiers.map(planLabel).join(' | ')} |`);
say(`| --- | ${unitTiers.map(() => '---').join(' | ')} |`);
for (const key of Object.keys(unitCredits('pro'))) {
  say(
    `| ${key} | ${unitTiers.map((tier) => (unitCredits(tier)[key] ? count(unitCredits(tier)[key].credits, 2) : 'not in plan')).join(' | ')} |`,
  );
}
say('');

say('## Temporary free quota\n');
say(
  `${count(FREE_POOL_SUMMARY.entries)} QwenCloud allocations (${Object.entries(
    FREE_POOL_SUMMARY.totals,
  )
    .map(([unit, total]) => `${count(total)} ${unit}`)
    .join(
      ', ',
    )}) cost $0 while they last. ${count(FREE_POOL_SUMMARY.largestExpiry.entries)} of them expire on ${FREE_POOL_SUMMARY.largestExpiry.date}; the last live one on ${FREE_POOL_SUMMARY.lastExpiry}; the terms review lapses on ${FREE_POOL_SUMMARY.termsReviewExpires}. Exhaustion falls back to the upgrade prompt, not paid spend.\n`,
);

say('## Top-ups\n');
say('| Top-up | Price | Credits | Provider cost | Web margin |');
say('| --- | --- | --- | --- | --- |');
for (const row of TOP_UPS)
  say(
    `| ${usd(row.amountUsd, 0)} | ${usd(row.priceUsd)} | ${count(row.credits)} | ${usd(row.providerCostUsd)} | ${pct(row.webMarginPct)} |`,
  );
say('');

console.log(out.join('\n'));
