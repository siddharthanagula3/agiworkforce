import { BILLING_PLAN_PRICING, modelsCatalogJson } from '@agiworkforce/types';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import {
  AVAILABLE_NOW_LABEL,
  BYOK_SURFACES,
  COMING_SOON_LABEL,
  DESKTOP_LOCAL_RUNTIMES,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';
import { LANE_NAMES, type LaneId } from '../system/lanes';
import { WEB_ENTRY_HREF } from '../system/nav';

type CatalogModel = {
  id: string;
  provider: string;
  qualityTier?: string;
  openWeight?: boolean;
  name: string;
  inputCost: number;
  outputCost?: number;
  cached_input?: number;
};

const catalogModels = modelsCatalogJson.models as unknown as Record<string, CatalogModel>;
const catalogProviders = modelsCatalogJson.providers as unknown as Record<
  string,
  { label: string; defaultModel?: string }
>;
const LOCAL_SUFFIX = /\s+\(Local\)$/;

export const modelName = (id: string): string => catalogModels[id]?.name ?? id;
export const providerLabel = (id: string): string =>
  (catalogProviders[id]?.label ?? id).replace(LOCAL_SUFFIX, '');

export const CLI_HREF = '/download';
export const PRICING_HREF = '/pricing';
export const LOCAL_HREF = '/local';
export const BYOK_HREF = '/byok';
export const PRODUCT_NAME = 'AGI';
export const CLOUD_NAME = LANE_NAMES.cloud;

export const HERO = {
  title: 'One AI workspace. You choose where it runs.',
  lede: 'Work with the same assistant on the web and in your terminal. Run each request locally, through a provider key you already own, or on AGI Cloud, and see the route, model, privacy boundary and cost beneath every answer.',
  primary: { label: 'Try AGI Web', href: WEB_ENTRY_HREF },
  secondary: { label: 'Install the CLI', href: CLI_HREF },
} as const;

export const CONSOLE_URL = 'agiworkforce.com/chat';
export const CONSOLE_FILE = { name: 'msa-2026.pdf', pages: 14 } as const;
export const CONSOLE_PROMPT = 'Summarise this contract and flag the termination clause.';
export const CONSOLE_ANSWER = [
  {
    heading: 'Summary',
    items: [
      [
        'Term and renewal',
        'Starts 1 October 2026 and renews yearly unless either side gives notice.',
      ],
      ['Fees', 'Paid in advance and not refundable.'],
    ],
  },
  {
    heading: 'Termination clause, flagged',
    items: [
      ['For convenience', 'Either party, on 30 days written notice.'],
      ['For breach', '10 days written notice, with the chance to cure inside that window.'],
    ],
  },
] as const;

export const EXAMPLE_TURN = {
  promptTokens: 1842,
  completionTokens: 318,
  cacheReadShare: 0.94,
} as const;

const perMillion = (tokens: number, usdPerMillion: number) => (tokens * usdPerMillion) / 1_000_000;
const usd = (value: number) => {
  if (value === 0) return '$0.00';
  const digits = value < 0.001 ? 4 : 3;
  return `$${value.toFixed(digits)}`;
};
const tokens = (count: number) => count.toLocaleString('en-US');

function turnCost(id: string, cached: boolean): number {
  const model = catalogModels[id];
  if (!model?.inputCost || !model.outputCost) return 0;
  const cachedTokens = cached
    ? Math.round(EXAMPLE_TURN.promptTokens * EXAMPLE_TURN.cacheReadShare)
    : 0;
  const freshTokens = EXAMPLE_TURN.promptTokens - cachedTokens;
  return (
    perMillion(freshTokens, model.inputCost) +
    perMillion(cachedTokens, model.cached_input ?? model.inputCost) +
    perMillion(EXAMPLE_TURN.completionTokens, model.outputCost)
  );
}

const cachePercent = `${Math.round(EXAMPLE_TURN.cacheReadShare * 100)}%`;
const LOCAL_RUNTIME_ID = 'ollama';
const BYOK_PROVIDER_ID = 'anthropic';
const CLOUD_PROVIDER_ID = 'openai';
const BEST_QUALITY_TIER = 'best';

function providerDefaultModelId(providerId: string): string {
  return catalogProviders[providerId]?.defaultModel ?? '';
}

function cheapestModelId(filter: (model: CatalogModel) => boolean): string {
  const [first] = Object.values(catalogModels)
    .filter(filter)
    .sort((a, b) => a.inputCost - b.inputCost || a.id.localeCompare(b.id));
  return first?.id ?? '';
}

const CLOUD_MODEL_ID = cheapestModelId(
  (model) => model.provider === CLOUD_PROVIDER_ID && model.qualityTier === BEST_QUALITY_TIER,
);
const BYOK_MODEL_ID = providerDefaultModelId(BYOK_PROVIDER_ID);
const LOCAL_MODEL_ID = cheapestModelId((model) => model.openWeight === true);

export type SurfaceState = 'live' | 'pending' | 'soon';

const surfaceState = (status: string): SurfaceState =>
  status === AVAILABLE_NOW_LABEL ? 'live' : status === COMING_SOON_LABEL ? 'soon' : 'pending';

export const SURFACE_STATE_LABEL: Record<SurfaceState, string> = {
  live: AVAILABLE_NOW_LABEL,
  pending: 'Pending',
  soon: COMING_SOON_LABEL,
};

export const SURFACES = [
  {
    name: 'Web',
    kind: 'Any browser',
    status: SURFACE_STATUS.web,
    state: surfaceState(SURFACE_STATUS.web),
    href: WEB_ENTRY_HREF,
    blurb: 'Chat, projects, artifacts and cited research with nothing to install.',
  },
  {
    name: 'CLI',
    kind: 'macOS, Linux, Windows',
    status: SURFACE_STATUS.cli,
    state: surfaceState(SURFACE_STATUS.cli),
    href: '/cli',
    blurb: 'A Rust agent for the shell. Sessions resume and fork, commands run in a sandbox.',
  },
  {
    name: 'Desktop',
    kind: 'Native app',
    status: SURFACE_STATUS.desktop,
    state: surfaceState(SURFACE_STATUS.desktop),
    href: '/desktop',
    blurb: `Local runtimes (${DESKTOP_LOCAL_RUNTIMES.label}), encrypted keys and scheduled work.`,
  },
  {
    name: 'Mobile',
    kind: 'iPhone, Android',
    status: SURFACE_STATUS.mobile,
    state: surfaceState(SURFACE_STATUS.mobile),
    href: '/mobile',
    blurb: 'Local mode by default. Chats and memory stay on the phone until you move them.',
  },
  {
    name: 'Chrome',
    kind: 'Side panel',
    status: SURFACE_STATUS.chrome,
    state: surfaceState(SURFACE_STATUS.chrome),
    href: '/chrome-extension',
    blurb: 'Reads the page when you ask and runs the work on the paired desktop app.',
  },
  {
    name: 'VS Code',
    kind: 'Editor',
    status: SURFACE_STATUS.vscode,
    state: surfaceState(SURFACE_STATUS.vscode),
    href: '/vscode-extension',
    blurb: 'Chat with the workspace in context and review diffs before they land.',
  },
] as const;

export type SurfaceName = (typeof SURFACES)[number]['name'];

const LIVE_SURFACE_NAMES = new Set<string>(
  SURFACES.filter((surface) => surface.state === 'live').map((surface) => surface.name),
);

export const listLiveSurfaces = (candidates: readonly SurfaceName[]): string => {
  const live = candidates.filter((name) => LIVE_SURFACE_NAMES.has(name));
  if (live.length <= 1) return live[0] ?? 'Not shipped yet';
  if (live.length === 2) return `${live[0]} and ${live[1]}`;
  return `${live.slice(0, -1).join(', ')}, and ${live[live.length - 1]}`;
};

const LANE_SURFACES: Record<LaneId, readonly SurfaceName[]> = {
  local: ['Desktop', 'CLI'],
  byok: ['Desktop', 'CLI', 'VS Code'],
  cloud: ['Web', 'Desktop', 'Mobile'],
};

export const RECEIPT_LABELS = {
  route: 'Route',
  ranOn: 'Ran on',
  left: 'Left the device',
  tokens: 'Tokens',
  model: 'Provider and model',
  cost: 'Estimated cost',
  surfaces: 'Available on',
} as const;

export type ReceiptKey = keyof typeof RECEIPT_LABELS;

export type ConsoleLane = {
  lane: LaneId;
  name: string;
  modelId: string;
  activity: string;
  modelLine: string;
  receipt: Record<ReceiptKey, string>;
};

const fileActivity = (destination: string) =>
  `Sent ${CONSOLE_FILE.name} (${CONSOLE_FILE.pages} pages) to ${destination}`;

export const CONSOLE_LANES: readonly ConsoleLane[] = [
  {
    lane: 'local',
    name: LANE_NAMES.local,
    modelId: LOCAL_MODEL_ID,
    activity: `Read ${CONSOLE_FILE.name} on this machine, ${CONSOLE_FILE.pages} pages`,
    modelLine: `${modelName(LOCAL_MODEL_ID)} via ${providerLabel(LOCAL_RUNTIME_ID)}`,
    receipt: {
      route: LANE_NAMES.local,
      model: `${providerLabel(LOCAL_RUNTIME_ID)} · ${modelName(LOCAL_MODEL_ID)}`,
      ranOn: 'This machine',
      left: 'Nothing',
      tokens: `${tokens(EXAMPLE_TURN.promptTokens)} in · ${tokens(EXAMPLE_TURN.completionTokens)} out`,
      cost: usd(0),
      surfaces: listLiveSurfaces(LANE_SURFACES.local),
    },
  },
  {
    lane: 'byok',
    name: LANE_NAMES.byok,
    modelId: BYOK_MODEL_ID,
    activity: fileActivity(`${providerLabel(BYOK_PROVIDER_ID)} on your key`),
    modelLine: `${modelName(BYOK_MODEL_ID)} on your ${providerLabel(BYOK_PROVIDER_ID)} account`,
    receipt: {
      route: LANE_NAMES.byok,
      model: `${providerLabel(BYOK_PROVIDER_ID)} · ${modelName(BYOK_MODEL_ID)}`,
      ranOn: `${providerLabel(BYOK_PROVIDER_ID)}, on your account`,
      left: `Prompt and file, to ${providerLabel(BYOK_PROVIDER_ID)} only`,
      tokens: `${tokens(EXAMPLE_TURN.promptTokens)} in · ${tokens(EXAMPLE_TURN.completionTokens)} out`,
      cost: `${usd(turnCost(BYOK_MODEL_ID, false))} on your ${providerLabel(BYOK_PROVIDER_ID)} bill`,
      surfaces: listLiveSurfaces(LANE_SURFACES.byok),
    },
  },
  {
    lane: 'cloud',
    name: LANE_NAMES.cloud,
    modelId: CLOUD_MODEL_ID,
    activity: fileActivity(CLOUD_NAME),
    modelLine: `${modelName(CLOUD_MODEL_ID)} on ${CLOUD_NAME}`,
    receipt: {
      route: LANE_NAMES.cloud,
      model: `${providerLabel(CLOUD_PROVIDER_ID)} · ${modelName(CLOUD_MODEL_ID)}`,
      ranOn: `${CLOUD_NAME}, capacity we run`,
      left: 'Prompt and file, to the provider we route to',
      tokens: `${tokens(EXAMPLE_TURN.promptTokens)} in (${cachePercent} cached) · ${tokens(EXAMPLE_TURN.completionTokens)} out`,
      cost: `${usd(turnCost(CLOUD_MODEL_ID, true))} metered on your plan`,
      surfaces: listLiveSurfaces(LANE_SURFACES.cloud),
    },
  },
];

export const CATALOG_MODEL_COUNT = Object.keys(catalogModels).length;
export const PROVIDER_INTEGRATION_COUNT = Object.keys(catalogProviders).length;

export const ROUTES = {
  title: 'Every answer comes with a receipt.',
  lede: 'Three routes, one workspace. The route is recorded when the answer finishes and printed under it, so the same question answered three ways reads as three different receipts.',
  columns: [
    {
      lane: 'local' as LaneId,
      title: LANE_NAMES.local,
      cta: { label: 'Run AGI locally', href: LOCAL_HREF },
    },
    {
      lane: 'byok' as LaneId,
      title: LANE_NAMES.byok,
      cta: { label: 'Bring your key', href: BYOK_HREF },
    },
    {
      lane: 'cloud' as LaneId,
      title: LANE_NAMES.cloud,
      cta: { label: 'Start on the web', href: WEB_ENTRY_HREF },
    },
  ],
  rows: [
    {
      label: 'Where it runs',
      values: [
        `Your hardware, through ${DESKTOP_LOCAL_RUNTIMES.label}`,
        `Your account at one of ${BYOK_PROVIDERS.length} providers, from one key list`,
        'Capacity we run. The router names the provider and model on the answer',
      ],
    },
    {
      label: 'What leaves the device',
      values: [
        'Nothing. Moving a session to another route is an explicit fork with a preview and a secret scan',
        'Your prompt and files, straight to your provider',
        'Your prompt and files, to the provider we route to',
      ],
    },
    {
      label: 'Who bills the usage',
      values: [
        'No one. There is no key and no account',
        'Your provider. We are not in the payment path',
        'Your AGI plan, metered per turn',
      ],
    },
    {
      label: 'Surfaces today',
      values: [
        listLiveSurfaces(LANE_SURFACES.local),
        `${listLiveSurfaces(LANE_SURFACES.byok)}. ${BYOK_SURFACES.exclusion}`,
        `${listLiveSurfaces(LANE_SURFACES.cloud)}. The free plan needs no card`,
      ],
    },
  ],
} as const;

export const MODELS_SECTION = {
  title: 'Every model. One composer.',
  lede: `Pick any of ${CATALOG_MODEL_COUNT} models by name and that model answers, nothing substitutes behind your back. Or leave it on Auto and the router takes the lowest-cost route whose terms allow it, counting prompt-cache hits before it decides.`,
  points: [
    { title: 'Exact means exact', body: 'Ask for a model by name and that model answers.' },
    {
      title: 'Auto is priced before it routes',
      body: 'The router weighs cost, terms and cache hits, then names its choice on the receipt.',
    },
    {
      title: `${PROVIDER_INTEGRATION_COUNT} providers and local runtimes`,
      body: 'One catalog, one price sheet, one picker that shows what each model supports.',
    },
  ],
  image: {
    dark: '/product/models-dark-landing.png',
    alt: 'The AGI model picker open over the composer, listing models with their capabilities',
    width: 2240,
    height: 1400,
    url: CONSOLE_URL,
  },
} as const;

export const WORK = {
  title: 'Built for work you can verify.',
  lede: 'The parts of the workspace that make an answer checkable are product features, not promises.',
  items: [
    {
      title: 'Research that cites',
      body: 'A report with numbered sources you can open, written after the searches you can see. It is a mode on the composer, not a separate product.',
      image: {
        light: '/product/deep-research-report-light.png',
        dark: '/product/deep-research-report-dark.png',
        alt: 'A deep research report in AGI with the search plan marked done and numbered citations in the text',
        width: 2392,
        height: 1402,
      },
      url: CONSOLE_URL,
    },
    {
      title: 'Agents that stop and ask',
      body: 'Anything that writes, deletes, runs code or can move data out waits for you. Read-only actions can run on their own if you choose, and a blocked tool stays blocked.',
      image: {
        light: '/product/agents-tool-approvals-light.png',
        dark: '/product/agents-tool-approvals-dark.png',
        alt: 'The tool approvals setting in AGI, with ask before every action selected',
        width: 1132,
        height: 584,
      },
      url: 'agiworkforce.com/settings',
    },
    {
      title: 'Memory you can read',
      body: 'Every remembered fact is listed with where it came from. Edit it, delete it, or switch a whole source off.',
      image: {
        light: '/product/memory-settings-light.png',
        dark: '/product/memory-settings-dark.png',
        alt: 'The memory settings panel in AGI, listing where memories come from',
        width: 1720,
        height: 1360,
      },
      url: 'agiworkforce.com/settings',
    },
  ],
} as const;

export const SURFACES_SECTION = {
  title: 'Start here. Continue anywhere.',
  lede: 'Projects, memory and artifacts follow your account between surfaces. The release state beside each one is the same value the download page shows.',
} as const;

export const WEB_SHOT = {
  light: '/product/projects-light-landing.png',
  dark: '/product/projects-dark-landing.png',
  alt: 'AGI Web showing the projects view, with chat, code, projects, library and schedules in the sidebar',
  width: 2880,
  height: 1300,
  url: CONSOLE_URL,
} as const;

export const MOBILE_SHOT = {
  light: '/screenshots/mobile-light-v2.png',
  dark: '/screenshots/mobile-dark-v2.png',
  alt: 'AGI Mobile on a phone, in local mode',
  width: 1206,
  height: 2622,
} as const;

export const CLI_VERSION = '1.7.1';
export const CLI_TRANSCRIPT = [
  { kind: 'cmd', text: 'agi --version' },
  { kind: 'out', text: `agi ${CLI_VERSION}` },
  { kind: 'cmd', text: `agi -p ${LOCAL_RUNTIME_ID} -m ${LOCAL_MODEL_ID} "${CONSOLE_PROMPT}"` },
  { kind: 'dim', text: `read ${CONSOLE_FILE.name} · ${CONSOLE_FILE.pages} pages · local` },
  { kind: 'out', text: 'Termination: 30 days for convenience, 10 days for breach with cure.' },
  {
    kind: 'dim',
    text: `receipt  local · ${LOCAL_RUNTIME_ID} · ${LOCAL_MODEL_ID} · ${tokens(EXAMPLE_TURN.promptTokens)} in · ${tokens(EXAMPLE_TURN.completionTokens)} out · ${usd(0)}`,
  },
] as const;

const monthly = (value: number) => `$${value}`;

export const PRICING = {
  title: 'Pay only for the cloud lane.',
  lede: 'Local runs on hardware you already own. Your key is billed by your provider at their rates. Plans buy capacity on ours.',
  lanes: [
    { lane: 'local' as LaneId, name: LANE_NAMES.local, value: usd(0), note: 'No account needed' },
    {
      lane: 'byok' as LaneId,
      name: LANE_NAMES.byok,
      value: 'Provider rates',
      note: 'We are not in the payment path',
    },
    {
      lane: 'cloud' as LaneId,
      name: LANE_NAMES.cloud,
      value: 'Plans below',
      note: 'Metered per turn',
    },
  ],
  tiers: [
    {
      name: BILLING_PLAN_PRICING.free.label,
      price: monthly(BILLING_PLAN_PRICING.free.monthlyPriceUsd),
      cadence: 'no card',
    },
    {
      name: BILLING_PLAN_PRICING.basic.label,
      price: monthly(BILLING_PLAN_PRICING.basic.monthlyPriceUsd),
      cadence: 'a month',
    },
    {
      name: BILLING_PLAN_PRICING.pro.label,
      price: monthly(BILLING_PLAN_PRICING.pro.monthlyPriceUsd),
      cadence: 'a month',
    },
    {
      name: BILLING_PLAN_PRICING.max.label,
      price: monthly(BILLING_PLAN_PRICING.max.monthlyPriceUsd),
      cadence: 'a month',
    },
  ],
  cta: { label: 'Compare plans', href: PRICING_HREF },
} as const;

export const CLOSE = {
  title: 'Start on the web. Continue in the terminal.',
  body: 'AGI Web needs no install. The CLI is signed and downloadable now. Whichever you open, the answer says where it ran.',
} as const;
