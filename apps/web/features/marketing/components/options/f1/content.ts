import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import {
  CLI_TRANSCRIPT,
  CONSOLE_ANSWER,
  CONSOLE_FILE,
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  CONSOLE_URL,
  HERO,
  RECEIPT_LABELS,
  ROUTES,
  SURFACES,
  SURFACES_SECTION,
  WORK,
  type ConsoleLane,
  type ReceiptKey,
} from '@/features/marketing/components/landing/landing-content';
import type { LaneId } from '@/features/marketing/components/system/lanes';
import { RELEASES } from '@/lib/changelog-entries';
import { CLI_AVAILABILITY_NOTE, MARKETING, SURFACE_STATUS } from '@/lib/marketing-constants';
import {
  isReleased,
  surfaceAvailabilitySummary,
  surfaceCta,
  SURFACE_IDS,
  SURFACE_NAMES,
  type SurfaceId,
} from '@/lib/surface-status';

const laneById = (id: LaneId): ConsoleLane =>
  CONSOLE_LANES.find((lane) => lane.lane === id) ?? CONSOLE_LANES[0]!;

const CLOUD = laneById('cloud');
const LOCAL = laneById('local');
const BYOK = laneById('byok');

export const receiptSegments = (lane: ConsoleLane): readonly string[] => [
  lane.receipt.route,
  lane.receipt.model,
  lane.receipt.tokens,
  lane.receipt.cost,
];

export const shortReceipt = (lane: ConsoleLane): readonly string[] => [
  lane.receipt.route,
  lane.receipt.model,
  lane.receipt.cost,
];

export const CLAIM = HERO.title;
export const WEB_ENTRY = HERO.primary;
export const SECONDARY_ENTRY = HERO.secondary;
export const AVAILABILITY = surfaceAvailabilitySummary();
export const ILLUSTRATION_LABEL = 'Illustration';

export const TURN = {
  url: CONSOLE_URL,
  file: CONSOLE_FILE,
  prompt: CONSOLE_PROMPT,
  activity: CLOUD.activity,
  answer: CONSOLE_ANSWER,
  receipt: receiptSegments(CLOUD),
  placeholder: 'Ask a follow-up',
  picker: 'Auto',
} as const;

export const CLOUD_RECEIPT = shortReceipt(CLOUD);
export const LOCAL_RECEIPT = shortReceipt(LOCAL);
export const BYOK_RECEIPT = shortReceipt(BYOK);

export const SETTINGS_URL = 'agiworkforce.com/settings';

export type ChapterId = 'chat' | 'research' | 'artifacts' | 'memory' | 'approvals';

export interface Chapter {
  id: ChapterId;
  title: string;
  body: string;
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'chat',
    title: 'Chat',
    body: 'Ask for a model by name and that model answers. Leave it on Auto and the router takes the lowest-cost route whose terms allow it, then names its choice on the receipt.',
  },
  {
    id: 'research',
    title: WORK.items[0].title,
    body: WORK.items[0].body,
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    body: 'Documents, code and previews open beside the chat. Each one is versioned and shareable.',
  },
  {
    id: 'memory',
    title: 'Projects and memory',
    body: 'Chats, files and instructions, grouped. Every remembered fact is listed with where it came from. Edit it, delete it, or switch a whole source off.',
  },
  {
    id: 'approvals',
    title: WORK.items[1].title,
    body: WORK.items[1].body,
  },
];

export const RECENTS = [
  'Contract summary',
  'EU AI Act duties',
  'Release note draft',
  'Nightly build triage',
] as const;

export type Recent = (typeof RECENTS)[number];

export const RESEARCH = {
  prompt: 'Compare the EU AI Act duties for providers versus deployers.',
  activity: 'Searched the web · 5 sources',
  heading: 'Providers and deployers',
  columns: ['Duty', 'Provider', 'Deployer'],
  rows: [
    ['Risk management', 'Required', 'Not required'],
    ['Human oversight', 'Design for it', 'Operate it'],
    ['Logging', 'Enable it', 'Keep six months'],
  ],
  sourcesLabel: 'Sources',
  sources: ['eur-lex.europa.eu', 'digital-strategy.ec.europa.eu'],
} as const;

export const ARTIFACT = {
  title: 'Contract summary',
  version: 'Version 2',
  actions: ['Copy', 'Download'],
  sections: CONSOLE_ANSWER,
  prompt: CONSOLE_PROMPT,
} as const;

export const MEMORY = {
  project: 'Investor',
  projectMeta: '4 chats · 2 files · instructions',
  heading: 'Memory',
  lede: 'Facts the assistant remembers, with where each one came from.',
  facts: [
    ['Prefers Python over JavaScript for data work', 'Captured from chats'],
    ['The deck lives in the Investor project', 'Saved on the web app'],
    ['The dry run is Thursday at 4pm', 'Captured from chats'],
  ],
  sourcesHeading: 'Where memories come from',
  sources: [
    ['Automatically captured from chats', true],
    ['Saved on the web app', true],
  ],
  actions: ['Edit', 'Delete'],
} as const;

export const APPROVAL = {
  prompt: 'Stream the first response instead of waiting.',
  reads: ['Edited src/chat/send.ts · +2 −2'],
  file: 'src/chat/send.ts',
  diff: [
    ['del', 'const res = await fetchAll()'],
    ['del', 'render(res)'],
    ['add', 'const res = await fetchFirst()'],
    ['add', 'render(res, { stream: true })'],
  ],
  ask: 'AGI wants to run a shell command',
  command: 'git commit -m "fix: stream first response"',
  buttons: ['Allow once', 'Always allow', 'Deny'],
} as const;

export const RECEIPT_ROWS: readonly ReceiptKey[] = ['ranOn', 'left', 'model', 'tokens', 'cost'];

export interface RoutePanel {
  lane: LaneId;
  title: string;
  cta: { label: string; href: string };
  providerId: string;
  inCli: boolean;
  receipt: Record<ReceiptKey, string>;
}

export const ROUTE_PANELS: readonly RoutePanel[] = ROUTES.columns.map((column) => {
  const lane = laneById(column.lane);
  return {
    lane: column.lane,
    title: column.title,
    cta: column.cta,
    providerId: lane.providerId,
    inCli: column.lane !== 'cloud',
    receipt: lane.receipt,
  };
});

export const ROUTES_HEAD = { title: ROUTES.title, lede: ROUTES.lede } as const;
export const IN_CLI_LABEL = 'In the CLI';
export const CLI_NOTE = CLI_AVAILABILITY_NOTE;
export const ILLUSTRATION_NOTE = 'Illustration. Token counts are examples.';
export const LABELS = RECEIPT_LABELS;

export interface SurfaceTab {
  id: SurfaceId;
  name: string;
  status: string;
  live: boolean;
  kind: string;
  blurb: string;
  action: { label: string; href: string };
}

export const SURFACE_TABS: readonly SurfaceTab[] = SURFACE_IDS.map((id) => {
  const name = SURFACE_NAMES[id];
  const surface = SURFACES.find((item) => item.name === name) ?? SURFACES[0];
  return {
    id,
    name,
    status: SURFACE_STATUS[id],
    live: isReleased(id),
    kind: surface.kind,
    blurb: surface.blurb,
    action: id === 'web' ? HERO.primary : surfaceCta(id),
  };
});

export const SURFACES_TITLE = SURFACES_SECTION.title;

export const DESKTOP_SCENE = {
  title: 'AGI',
  folders: ['~/Projects/investor'],
  foldersLabel: 'Approved folders',
  computerUse: 'Computer use',
  prompt: 'Summarise the three open PRs and draft the release note.',
  tools: ['github · list pull requests · 3 results', 'Read 3 diffs · 412 lines'],
  answer:
    'Three PRs are ready: routing health scopes, the model catalogue, and the pre-push worktree hook. The draft is below; writing it to the changelog needs your approval.',
  approvalHead: 'Approval · write file',
  approvalBody: 'CHANGELOG.md · 14 lines added',
  buttons: ['Allow once', 'Always', 'Deny'],
} as const;

export const TERMINAL_SCENE = {
  title: 'agi · zsh',
  lines: CLI_TRANSCRIPT,
} as const;

export const PHONE_SCENE = {
  time: '11:10',
  name: 'AGI',
  modes: ['Local', 'Cloud'],
  prompt: 'What did we decide for the launch demo?',
  tool: 'Memory · 2 facts',
  answer:
    'From your memory: the dry run is Thursday at 4pm and the deck lives in the Investor project. Want a reminder?',
  placeholder: 'Message AGI',
} as const;

export const EDITOR_SCENE = {
  title: 'send.ts · AGI in VS Code',
  lines: [
    ['6', 'export const send = async () => {'],
    ['7', '  const res = await fetchFirst()'],
    ['8', '  render(res, { stream: true })'],
    ['9', '  return res.status'],
    ['10', '}'],
  ],
  changed: ['7', '8'],
  mention: '@agi',
  prompt: 'stream the first response',
  answer: 'Swapped fetchAll for fetchFirst and passed stream: true to render.',
  buttons: ['Apply +2 −2', 'Reject'],
} as const;

export const CHROME_SCENE = {
  tab: 'Q3 strategy · Google Docs',
  url: 'docs.google.com/document/d/1xQ3…',
  docTitle: 'Q3 strategy document',
  panelName: 'AGI',
  context: 'Q3 strategy document',
  contextMeta: '4,200 words selected',
  prompt: 'Summarise the key risks from this doc',
  answer: 'Three risks stand out in the selected section:',
  risks: [
    ['Market timing', '¶ 4'],
    ['One cloud provider for everything', '¶ 9'],
    ['EU regulatory uncertainty', '¶ 12'],
  ],
  placeholder: 'Ask about this page',
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

const LATEST_COUNT = 3;

export const LATEST = RELEASES.slice(0, LATEST_COUNT).map((release) => ({
  date: release.date,
  headline: release.headline,
  summary: release.body[0] ?? '',
}));

export const LATEST_TITLE = 'What shipped';
export const CHANGELOG_LINK = { label: 'Full changelog', href: '/changelog' } as const;

export const START = {
  title: 'Start on the web.',
  body: 'AGI Web needs no install and the free plan needs no card. Every answer says where it ran.',
} as const;
