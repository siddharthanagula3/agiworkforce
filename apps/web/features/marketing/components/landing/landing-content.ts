import { BILLING_PLAN_PRICING, modelsCatalogJson } from '@agiworkforce/types';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES, SURFACE_STATUS } from '@/lib/marketing-constants';
import { LANE_NAMES, type LaneId } from '../system/lanes';
import { WEB_ENTRY_HREF } from '../system/nav';

type CatalogModel = {
  name: string;
  inputCost?: number;
  outputCost?: number;
  cached_input?: number;
};

const catalogModels = modelsCatalogJson.models as unknown as Record<string, CatalogModel>;
const catalogProviders = modelsCatalogJson.providers as unknown as Record<
  string,
  { label: string }
>;
const LOCAL_SUFFIX = /\s+\(Local\)$/;

export const modelName = (id: string): string => catalogModels[id]?.name ?? id;
const providerLabel = (id: string): string =>
  (catalogProviders[id]?.label ?? id).replace(LOCAL_SUFFIX, '');

export const CLI_HREF = '/download';
export const PRICING_HREF = '/pricing';
export const LOCAL_HREF = '/local';
export const BYOK_HREF = '/byok';

export const HERO = {
  eyebrow: 'One assistant. Any model. Six surfaces.',
  lines: ['Any model.', 'Any surface.'],
  accent: 'You pick where it runs.',
  lede: 'AGI is one assistant for the browser, the desktop, the phone, the terminal, Chrome and VS Code. Each request runs on hardware you own, on a provider key you already pay for, or on capacity we run. The answer says which.',
  primary: { label: 'Try AGI Web', href: WEB_ENTRY_HREF },
  secondary: { label: 'Install the CLI', href: CLI_HREF },
} as const;

export const CONSOLE_PROMPT = 'Summarise this contract and flag the termination clause.';
export const CONSOLE_ACTIVITY = 'Read msa-2026.pdf, 14 pages';
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

export const LANE_MARKS: Record<LaneId, string> = { local: '◆', byok: '◇', cloud: '●' };

const cachePercent = `${Math.round(EXAMPLE_TURN.cacheReadShare * 100)}%`;
const LOCAL_MODEL_ID = 'gpt-oss-20b';
const BYOK_MODEL_ID = 'claude-sonnet-5';
const CLOUD_MODEL_ID = 'gpt-5.6-luna';
const LOCAL_RUNTIME_ID = 'ollama';
const BYOK_PROVIDER_ID = 'anthropic';
const CLOUD_PROVIDER_ID = 'openai';

export type ConsoleLane = {
  lane: LaneId;
  name: string;
  modelId: string;
  ranOn: string;
  receipt: readonly string[];
  leaves: string;
  availableOn: string;
};

export const SURFACES = [
  {
    name: 'Web',
    kind: 'Any browser',
    status: SURFACE_STATUS.web,
    live: true,
    href: WEB_ENTRY_HREF,
    blurb:
      'Chat, projects, artifacts and cited research with nothing to install. Your account and the cloud lane live here.',
  },
  {
    name: 'CLI',
    kind: 'macOS, Linux, Windows',
    status: SURFACE_STATUS.cli,
    live: true,
    href: '/cli',
    blurb:
      'A Rust agent for the shell. Sessions resume and fork, commands run in a sandbox, and local models work offline.',
  },
  {
    name: 'Desktop',
    kind: 'Native app',
    status: SURFACE_STATUS.desktop,
    live: false,
    href: '/desktop',
    blurb: `Local runtimes (${DESKTOP_LOCAL_RUNTIMES.label}), encrypted keys, connectors and scheduled work.`,
  },
  {
    name: 'Mobile',
    kind: 'iPhone, Android',
    status: SURFACE_STATUS.mobile,
    live: false,
    href: '/mobile',
    blurb: 'Local mode by default. Chats and memory stay on the phone until you move them.',
  },
  {
    name: 'Chrome',
    kind: 'Side panel',
    status: SURFACE_STATUS.chrome,
    live: false,
    href: '/chrome-extension',
    blurb: 'Reads the page when you ask and runs the work on the paired desktop app.',
  },
  {
    name: 'VS Code',
    kind: 'Editor',
    status: SURFACE_STATUS.vscode,
    live: false,
    href: '/vscode-extension',
    blurb: 'Chat with the workspace in context and review diffs before they land.',
  },
] as const;

const LIVE_SURFACE_NAMES = new Set<string>(
  SURFACES.filter((surface) => surface.live).map((surface) => surface.name),
);

const listLiveSurfaces = (candidates: readonly string[]): string => {
  const live = candidates.filter((name) => LIVE_SURFACE_NAMES.has(name));
  if (live.length <= 1) return live[0] ?? 'Not shipped yet';
  if (live.length === 2) return `${live[0]} and ${live[1]}`;
  return `${live.slice(0, -1).join(', ')}, and ${live[live.length - 1]}`;
};

export const CONSOLE_LANES: readonly ConsoleLane[] = [
  {
    lane: 'local',
    name: LANE_NAMES.local,
    modelId: LOCAL_MODEL_ID,
    ranOn: `${providerLabel(LOCAL_RUNTIME_ID)} on this machine`,
    receipt: [
      'local',
      LOCAL_RUNTIME_ID,
      LOCAL_MODEL_ID,
      `${tokens(EXAMPLE_TURN.promptTokens)} in`,
      `${tokens(EXAMPLE_TURN.completionTokens)} out`,
      usd(0),
    ],
    leaves: 'Nothing left the device.',
    availableOn: listLiveSurfaces(['Desktop', 'CLI']),
  },
  {
    lane: 'byok',
    name: LANE_NAMES.byok,
    modelId: BYOK_MODEL_ID,
    ranOn: `${providerLabel(BYOK_PROVIDER_ID)}, on your own key`,
    receipt: [
      'byok',
      BYOK_PROVIDER_ID,
      BYOK_MODEL_ID,
      `${tokens(EXAMPLE_TURN.promptTokens)} in`,
      `${tokens(EXAMPLE_TURN.completionTokens)} out`,
      `${usd(turnCost(BYOK_MODEL_ID, false))} on your ${providerLabel(BYOK_PROVIDER_ID)} bill`,
    ],
    leaves: `The prompt and the file went to ${providerLabel(BYOK_PROVIDER_ID)}. Nothing went to us.`,
    availableOn: listLiveSurfaces(['Desktop', 'CLI', 'VS Code']),
  },
  {
    lane: 'cloud',
    name: LANE_NAMES.cloud,
    modelId: CLOUD_MODEL_ID,
    ranOn: `${providerLabel(CLOUD_PROVIDER_ID)}, on capacity we run`,
    receipt: [
      'cloud',
      CLOUD_PROVIDER_ID,
      CLOUD_MODEL_ID,
      `cache read ${cachePercent}`,
      `${tokens(EXAMPLE_TURN.completionTokens)} out`,
      usd(turnCost(CLOUD_MODEL_ID, true)),
    ],
    leaves: 'Metered per turn and shown on the answer. Sign in and start, no waitlist.',
    availableOn: listLiveSurfaces(['Web', 'Desktop', 'Mobile']),
  },
];

export const CATALOG_MODEL_COUNT = Object.keys(catalogModels).length;
export const PROVIDER_INTEGRATION_COUNT = Object.keys(catalogProviders).length;

export const FACTS = [
  `${CATALOG_MODEL_COUNT} models in one catalog`,
  `${PROVIDER_INTEGRATION_COUNT} providers and local runtimes`,
  `${SURFACES.length} surfaces, one account`,
  'prompt cache hits priced on every route',
  'a receipt under every answer',
] as const;

export const ROUTER = {
  eyebrow: 'Routing',
  title: 'Every model, one router,',
  accent: 'your rules.',
  policies: [
    {
      label: 'Exact means exact',
      body: 'Ask for a model by name and that model answers. Nothing substitutes behind your back.',
    },
    {
      label: 'Cheapest clean route',
      body: 'Auto takes the lowest-cost route whose terms allow it, and counts prompt-cache hits before it decides.',
    },
    {
      label: 'The label travels',
      body: 'Provider, model, cost and cache hit are recorded when the answer finishes and printed under it.',
    },
  ],
} as const;

export const ROUTER_MODEL_IDS = [
  'gpt-5.6-luna',
  'claude-sonnet-5',
  'gemini-3.8-flash',
  'deepseek-v4-flash',
  'kimi-k3',
  'glm-5.3',
  'grok-4.5',
  'gpt-oss-20b',
] as const;

export type RouterRoute = {
  modelId: string;
  lane: LaneId;
  via: string;
  surface: string;
  note: string;
};

export const ROUTER_ROUTES: readonly RouterRoute[] = [
  { modelId: 'gpt-5.6-luna', lane: 'cloud', via: 'openai', surface: 'Web', note: 'cache read 99%' },
  { modelId: 'claude-sonnet-5', lane: 'byok', via: 'anthropic', surface: 'CLI', note: 'your key' },
  {
    modelId: 'gpt-oss-20b',
    lane: 'local',
    via: 'ollama',
    surface: 'CLI',
    note: 'nothing left the device',
  },
  {
    modelId: 'deepseek-v4-flash',
    lane: 'cloud',
    via: 'deepseek',
    surface: 'Web',
    note: 'cache read 94%',
  },
  { modelId: 'kimi-k3', lane: 'cloud', via: 'moonshot', surface: 'Desktop', note: 'metered' },
];

export const LANES = {
  eyebrow: 'Where it runs',
  title: 'Three places.',
  accent: 'One receipt.',
  columns: [
    {
      lane: 'local' as LaneId,
      title: 'On hardware you own',
      cta: { label: 'Run AGI locally', href: LOCAL_HREF },
    },
    {
      lane: 'byok' as LaneId,
      title: 'On your provider account',
      cta: { label: 'Bring your key', href: BYOK_HREF },
    },
    {
      lane: 'cloud' as LaneId,
      title: 'On capacity we run',
      cta: { label: 'Start on the web', href: WEB_ENTRY_HREF },
    },
  ],
  rows: [
    {
      label: 'What runs it',
      values: [
        DESKTOP_LOCAL_RUNTIMES.label,
        `${BYOK_PROVIDERS.length} providers, from one key list`,
        'Whatever the router picks, named on the answer',
      ],
    },
    {
      label: 'Where the key lives',
      values: [
        'There is no key and no account',
        'Desktop encrypted storage, the CLI keyring, VS Code SecretStorage',
        'With us. You never hold it',
      ],
    },
    {
      label: 'What it costs',
      values: [
        usd(0),
        'Whatever your provider charges. We are not in the payment path',
        'Metered, and shown per turn',
      ],
    },
    {
      label: 'What leaves the device',
      values: [
        'Nothing, until you send it. Moving a session to another lane is an explicit fork with a preview and a secret scan',
        'Your prompt, straight to your provider',
        'Your prompt, to the provider we route it to',
      ],
    },
    {
      label: 'Available on',
      values: [
        listLiveSurfaces(['Desktop', 'CLI']),
        `${listLiveSurfaces(['Desktop', 'CLI', 'VS Code'])}. ${BYOK_SURFACES.exclusion}`,
        `${listLiveSurfaces(['Web', 'Desktop', 'Mobile'])}. Auto Economy is free with no card`,
      ],
    },
  ],
} as const;

export const SURFACES_SECTION = {
  eyebrow: 'Six surfaces',
  title: 'One workspace,',
  accent: 'wherever the work is.',
  lede: 'Projects, memory and artifacts follow you between surfaces. The release state printed beside each one comes from the download page, not from a claim typed here.',
} as const;

export const WEB_SHOT = {
  light: '/product/projects-light-landing.png',
  dark: '/product/projects-dark-landing.png',
  alt: 'AGI Web showing the projects view, with chat, code, projects, library and schedules in the sidebar',
  width: 2880,
  height: 1480,
  url: 'agiworkforce.com/chat',
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
  { kind: 'cmd', text: 'agi --help' },
  { kind: 'out', text: 'Multi-provider AI agent for your terminal.' },
  { kind: 'dim', text: 'Usage: agi [OPTIONS] [PROMPT] [COMMAND]' },
  { kind: 'dim', text: '  exec        Run non-interactively' },
  { kind: 'dim', text: '  review      Non-interactive code review' },
  { kind: 'dim', text: '  apply       Apply latest diff as git patch' },
  { kind: 'dim', text: '  sandbox     Run commands inside a sandbox' },
  { kind: 'dim', text: '  resume      Continue previous session' },
  { kind: 'dim', text: '  fork        Fork a previous session' },
  { kind: 'dim', text: '  models      Manage and inspect model configuration' },
  { kind: 'dim', text: '  approvals   Manage command and file-operation approvals' },
  { kind: 'dim', text: '  login       Login to AGI cloud, or an LLM provider via OAuth' },
  { kind: 'dim', text: '  doctor      Run local preflight diagnostics' },
  {
    kind: 'cmd',
    text: `agi -p ${LOCAL_RUNTIME_ID} -m ${LOCAL_MODEL_ID} "${CONSOLE_PROMPT}"`,
  },
] as const;

export const MOMENTS = {
  eyebrow: 'The work',
  title: 'Built for the work,',
  accent: 'not the chat.',
  items: [
    {
      title: 'Research that cites',
      body: 'A report with sources you can check, rather than a paragraph you have to trust. It is a mode on the composer, not a separate product.',
      image: {
        light: '/product/deep-research-report-light.png',
        dark: '/product/deep-research-report-dark.png',
        alt: 'A deep research report in AGI with numbered citations and a sources panel',
        width: 2392,
        height: 1402,
      },
      caption: ['Composer', 'Deep research'],
    },
    {
      title: 'Agents that stop and ask',
      body: 'An agent is a file that names the tools it may touch. Anything that writes, deletes, runs code or can move data out waits for you, and the dialog opens with the cursor on No.',
      image: {
        light: '/product/agents-tool-approvals-light.png',
        dark: '/product/agents-tool-approvals-dark.png',
        alt: 'The tool approvals setting in AGI, with ask before every action selected',
        width: 1132,
        height: 584,
      },
      caption: ['Settings', 'Tool approvals'],
    },
    {
      title: 'Memory you can read',
      body: 'Facts come from what you wrote, what a chat captured and what you imported. Every one is listed, editable, and can be switched off by source.',
      image: {
        light: '/product/memory-settings-light.png',
        dark: '/product/memory-settings-dark.png',
        alt: 'The memory settings panel in AGI, listing where memories come from',
        width: 1720,
        height: 1360,
      },
      caption: ['Settings', 'Memory'],
    },
  ],
} as const;

const monthly = (value: number) => `$${value}`;

export const PLANS = {
  title: 'Pay for the cloud lane only.',
  body: 'Local costs nothing. Your own key is billed by your provider. These plans buy capacity on ours.',
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
  title: 'Start on the web.',
  accent: 'Move the session anywhere.',
  body: 'AGI Web needs no install. The CLI is signed and downloadable now. Whichever you open, the answer says which computer produced it.',
} as const;
