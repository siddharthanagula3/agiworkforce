import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import {
  CLI_AVAILABILITY_NOTE,
  CLI_LOCAL_RUNTIMES,
  MARKETING,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';
import {
  isReleased,
  surfaceAvailabilitySummary,
  surfaceCta,
  type InstallableSurfaceId,
  type SurfaceId,
} from '@/lib/surface-status';
import {
  CLI_TRANSCRIPT,
  CONSOLE_FILE,
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  EXAMPLE_TURN,
  HERO,
  providerLabel,
  RECEIPT_LABELS,
  ROUTES,
  SURFACES,
  SURFACES_SECTION,
  type ReceiptKey,
  type SurfaceName,
} from '../../landing/landing-content';
import { LANE_NAMES, type LaneId } from '../../system/lanes';
import { WEB_ENTRY_HREF } from '../../system/nav';

export const BOARD_KEYS = ['model', 'ranOn', 'left', 'tokens', 'cost'] as const;
export type BoardKey = (typeof BOARD_KEYS)[number];

const formatTokens = (count: number) => count.toLocaleString('en-US');
const CACHE_PERCENT = `${Math.round(EXAMPLE_TURN.cacheReadShare * 100)}%`;
const TOKEN_LINES = `${formatTokens(EXAMPLE_TURN.promptTokens)} in\n${formatTokens(EXAMPLE_TURN.completionTokens)} out`;

function laneWhere(lane: LaneId): string {
  return lane === 'cloud' ? 'On the web' : 'In the CLI';
}

function laneStatus(lane: LaneId): string {
  return lane === 'cloud' ? SURFACE_STATUS.web : SURFACE_STATUS.cli;
}

export interface BoardRow {
  lane: LaneId;
  name: string;
  where: string;
  status: string;
  providerKey: string;
  cells: Record<BoardKey, string>;
}

export const BOARD_ROWS: readonly BoardRow[] = CONSOLE_LANES.map((lane) => {
  const providerKey = lane.providerId;
  return {
    lane: lane.lane,
    name: lane.name,
    where: laneWhere(lane.lane),
    status: laneStatus(lane.lane),
    providerKey,
    cells: {
      model: `${providerLabel(providerKey)}\n${lane.modelLabel}`,
      ranOn: lane.receipt.ranOn,
      left: lane.receipt.left,
      tokens: lane.lane === 'cloud' ? `${TOKEN_LINES}\n${CACHE_PERCENT} cached` : TOKEN_LINES,
      cost: lane.receipt.cost,
    },
  };
});

export const BOARD = {
  title: ROUTES.title,
  railTitle: 'The same question, answered three ways',
  prompt: CONSOLE_PROMPT,
  file: `${CONSOLE_FILE.name} · ${CONSOLE_FILE.pages} pages`,
  labels: RECEIPT_LABELS,
  note: 'Illustration. Token counts and times are examples.',
  links: ROUTES.columns.map((column) => ({ lane: column.lane, ...column.cta })),
  primary: HERO.primary,
  secondary: HERO.secondary,
} as const;

const CLOUD_LANE = CONSOLE_LANES.find((lane) => lane.lane === 'cloud') ?? CONSOLE_LANES[0];

const RECEIPT_NOTES: Record<ReceiptKey, string> = {
  route: `Which of the three routes answered: ${LANE_NAMES.local}, ${LANE_NAMES.byok.toLowerCase()} or ${LANE_NAMES.cloud}. Nothing substitutes behind your back.`,
  model:
    'The provider and the model that answered, by name. Ask for a model and that model answers; on Auto the router names its choice.',
  ranOn: 'Where the work ran: this machine, your account at your provider, or capacity we run.',
  left: 'What left the device. On Local, nothing. On the other two routes, your prompt and your files.',
  tokens: `Prompt and completion tokens, with the share the prompt cache served. ${CACHE_PERCENT} in this example.`,
  cost: 'Who bills the usage: no one on Local, your provider on your key, or your AGI plan, metered per turn.',
  surfaces: 'The surfaces this route is live on today, the same value the download page shows.',
};

export interface ReceiptRow {
  key: ReceiptKey;
  label: string;
  value: string;
  note: string;
  side: 'left' | 'right';
}

export const RECEIPT = {
  number: '02',
  title: 'What a receipt says',
  lead: ROUTES.lede,
  route: CLOUD_LANE?.lane ?? 'cloud',
  rows: (Object.keys(RECEIPT_LABELS) as ReceiptKey[]).map((key, index): ReceiptRow => ({
    key,
    label: RECEIPT_LABELS[key],
    value: CLOUD_LANE?.receipt[key] ?? '',
    note: RECEIPT_NOTES[key],
    side: index % 2 === 0 ? 'left' : 'right',
  })),
  caption: 'Illustration. The receipt printed under an AGI Cloud answer on the web.',
} as const;

const SURFACE_ID_BY_NAME: Record<SurfaceName, SurfaceId> = {
  Web: 'web',
  CLI: 'cli',
  Desktop: 'desktop',
  Mobile: 'mobile',
  Chrome: 'chrome',
  'VS Code': 'vscode',
};

export interface SurfaceRow {
  id: SurfaceId;
  name: string;
  kind: string;
  blurb: string;
  status: string;
  live: boolean;
  action: { label: string; href: string; primary: boolean };
}

export const SURFACE_ROWS: readonly SurfaceRow[] = SURFACES.map((surface) => {
  const id = SURFACE_ID_BY_NAME[surface.name];
  const live = isReleased(id);
  const action =
    id === 'web'
      ? { label: HERO.primary.label, href: WEB_ENTRY_HREF, primary: true }
      : { ...surfaceCta(id as InstallableSurfaceId), primary: false };
  return {
    id,
    name: surface.name,
    kind: surface.kind,
    blurb: surface.blurb.replace(`${surface.status}. `, ''),
    status: surface.status,
    live,
    action,
  };
});

export const SURFACES_HEAD = {
  number: '03',
  title: SURFACES_SECTION.title,
  lead: SURFACES_SECTION.lede,
} as const;

export const CAPABILITIES = {
  number: '04',
  title: 'An application suite, not a one-screen chatbot.',
  lead: 'One account for chat, research, artifacts, projects, memory and code, and every reply says where it ran.',
  items: [
    {
      id: 'chat',
      title: 'AI Chat',
      body: 'Fast and familiar, on every surface.',
      href: '/features/ai-chat',
    },
    {
      id: 'artifacts',
      title: 'Artifacts',
      body: 'Documents, code and previews. Versioned and shareable.',
      href: '/features/artifacts',
    },
    {
      id: 'projects',
      title: 'Projects',
      body: 'Chats, files and instructions, grouped.',
      href: '/features/projects',
    },
    {
      id: 'tools',
      title: 'Tools and connectors',
      body: 'MCP servers and OAuth apps, behind explicit permissions.',
      href: '/connectors/mcp-directory',
    },
    {
      id: 'memory',
      title: 'Memory',
      body: 'Saved facts you can read, edit and delete.',
      href: '/features/memory',
    },
    {
      id: 'research',
      title: 'Deep Research',
      body: 'Reports with citations you can check.',
      href: '/features/deep-research',
    },
  ],
} as const;

export type CapabilityId = (typeof CAPABILITIES.items)[number]['id'];

const CLI_SURFACE = SURFACES.find((surface) => surface.name === 'CLI');

export const DEVELOPERS = {
  number: '05',
  title: 'Serious about the terminal.',
  note: CLI_AVAILABILITY_NOTE,
  transcript: CLI_TRANSCRIPT,
  rows: [
    {
      lane: null,
      title: 'A Rust agent for the shell.',
      body: CLI_SURFACE?.blurb.replace('A Rust agent for the shell. ', '') ?? '',
    },
    {
      lane: 'local' as LaneId,
      title: 'Yours alone.',
      body: `Models on your hardware through ${CLI_LOCAL_RUNTIMES.label}. Works offline. Free.`,
    },
    {
      lane: 'byok' as LaneId,
      title: 'Your keys, your bill.',
      body: 'Bring provider keys in the CLI. Traffic goes directly to your provider.',
    },
  ],
} as const;

export const FACTS = [
  {
    value: `${CATALOG_SCOPES.catalogueEntries.value}`,
    label: CATALOG_SCOPES.catalogueEntries.label,
  },
  { value: `${CATALOG_SCOPES.byokProviders.value}`, label: CATALOG_SCOPES.byokProviders.label },
  {
    value: `${CATALOG_SCOPES.localRuntimes.value}`,
    label: `${CATALOG_SCOPES.localRuntimes.label} in the CLI`,
  },
  { value: `${MARKETING.surfaces.count}`, label: 'surfaces, one account' },
] as const;

export const CLOSE = {
  number: '06',
  title: 'Start on the web.',
  body: 'AGI Web needs no install and the free plan needs no card. Whichever surface you open, the answer says where it ran.',
  summary: surfaceAvailabilitySummary(),
  primary: HERO.primary,
  secondary: HERO.secondary,
} as const;
