import { PROVIDERS_IN_ORDER } from '@agiworkforce/types';
import { hasProviderMark } from '@agiworkforce/ui';
import {
  CLOSE,
  CONSOLE_FILE,
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  HERO,
  MODELS_SECTION,
  PRICING,
  ROUTES,
  SURFACES,
  SURFACES_SECTION,
  WORK,
  providerLabel,
  type ConsoleLane,
} from '@/features/marketing/components/landing/landing-content';
import { LANE_IDS, LANE_NAMES, type LaneId } from '@/features/marketing/components/system/lanes';
import { CLI_AVAILABILITY_NOTE, SURFACE_STATUS } from '@/lib/marketing-constants';
import {
  SURFACE_IDS,
  SURFACE_NAMES,
  isReleased,
  surfaceAvailabilitySummary,
  surfaceCta,
  type SurfaceId,
} from '@/lib/surface-status';

const CHIP_WORDS = 5;
const CHIP_WORDS_SHORT = 3;
const WHERE_ROW = 0;
const LEAVES_ROW = 1;

export const HEADLINE = 'Choose the route before work leaves your device.';
export const PRIMARY = HERO.primary;
export const SECONDARY = HERO.secondary;
export const PROMPT = CONSOLE_PROMPT;
export const ATTACHMENT = `${CONSOLE_FILE.name}`;
export const ATTACHMENT_PAGES = `${CONSOLE_FILE.pages} pages`;
const chipWords = (count: number): string =>
  `${CONSOLE_PROMPT.split(' ').slice(0, count).join(' ')}…`;
export const CHIP_TEXT = chipWords(CHIP_WORDS);
export const CHIP_TEXT_SHORT = chipWords(CHIP_WORDS_SHORT);
export const ILLUSTRATION = 'Illustration';
export const BOARD_NOTE = 'Illustration. Token counts are examples.';

const laneById = Object.fromEntries(CONSOLE_LANES.map((lane) => [lane.lane, lane])) as Record<
  LaneId,
  ConsoleLane
>;

export type SpecRow = { label: string; value: string };

export type BoardLane = {
  id: LaneId;
  name: string;
  status: string;
  receipt: readonly string[];
  rows: readonly SpecRow[];
};

const laneStatus = (lane: LaneId): string =>
  lane === 'cloud'
    ? `The route AGI Web uses`
    : `In the ${SURFACE_NAMES.cli}, ${SURFACE_STATUS.cli.toLowerCase()}`;

export const BOARD_LANES: readonly BoardLane[] = LANE_IDS.map((id, index) => {
  const lane = laneById[id];
  return {
    id,
    name: LANE_NAMES[id],
    status: laneStatus(id),
    receipt: [lane.receipt.model, lane.receipt.tokens, lane.receipt.cost],
    rows: [
      { label: ROUTES.rows[WHERE_ROW].label, value: ROUTES.rows[WHERE_ROW].values[index] ?? '' },
      { label: ROUTES.rows[LEAVES_ROW].label, value: ROUTES.rows[LEAVES_ROW].values[index] ?? '' },
    ],
  };
});

const firstSentence = (text: string): string => `${text.split('. ')[0]}.`;

export const MODELS = {
  title: MODELS_SECTION.title,
  lead: firstSentence(MODELS_SECTION.lede),
  points: MODELS_SECTION.points,
  autoNote: 'A model picked for the task, your plan and cost',
} as const;

const modelByProvider = new Map<string, string>();
for (const lane of CONSOLE_LANES) {
  if (lane.lane !== 'local') modelByProvider.set(lane.providerId, lane.modelLabel);
}

export type PickerRow = { id: string; label: string; model: string | null };

export const PICKER_ROWS: readonly PickerRow[] = PROVIDERS_IN_ORDER.filter((id) =>
  hasProviderMark(id),
).map((id) => ({ id, label: providerLabel(id), model: modelByProvider.get(id) ?? null }));

export type SurfaceCard = {
  id: SurfaceId;
  name: string;
  kind: string;
  status: string;
  live: boolean;
  action: { label: string; href: string };
};

const kindByName = new Map<string, string>(SURFACES.map((surface) => [surface.name, surface.kind]));

export const SURFACE_CARDS: readonly SurfaceCard[] = SURFACE_IDS.map((id) => ({
  id,
  name: SURFACE_NAMES[id],
  kind: kindByName.get(SURFACE_NAMES[id]) ?? '',
  status: SURFACE_STATUS[id],
  live: isReleased(id),
  action: id === 'web' ? HERO.primary : surfaceCta(id),
}));

export const SURFACES_HEAD = SURFACES_SECTION;

export const VERIFY = {
  title: WORK.title,
  lead: WORK.lede,
  items: WORK.items.map((item) => ({ title: item.title, body: item.body })),
} as const;

export const RESEARCH_SCENE = {
  status: 'Research complete',
  meta: '1 search · 9 sources · 0:16',
  steps: [
    'EU AI Act 2026 GPAI obligations timeline',
    'EU AI Act general purpose AI models compliance 2026',
    'EU AI Act systemic risk GPAI requirements effective date 2026',
    'Write the cited report',
  ],
  done: 'Done',
  heading: 'Executive summary',
  excerpt:
    'In 2026, the regulatory landscape of the EU Artificial Intelligence Act shifted from establishing rules for General-Purpose AI (GPAI) to active enforcement, operational governance, and mandatory downstream transparency',
  citations: ['4', '8'],
} as const;

export const APPROVALS_SCENE = {
  title: 'Tool approvals',
  options: [
    {
      name: 'Ask before every action',
      body: 'Every connector, plugin, and tool action waits for your approval, including actions that only read data.',
      selected: true,
    },
    {
      name: 'Run read-only actions without asking',
      body: 'Actions that only read data inside AGI run on their own. Anything that writes, deletes, runs code, or can move data outside AGI still asks first, and a blocked tool stays blocked.',
      selected: false,
    },
  ],
} as const;

export const MEMORY_SCENE = {
  title: 'Where memories come from',
  body: 'Suppress a source to keep its memories out of every answer. They stay saved and stay listed.',
  sources: [
    'Automatically captured from chats',
    'Saved on the web app',
    'Saved on Desktop',
    'Saved on mobile',
  ],
  suppress: 'Suppress',
} as const;

export const PRICING_BOARD = {
  title: PRICING.title,
  lead: PRICING.lede,
  lanes: PRICING.lanes,
  tiers: PRICING.tiers,
  actions: {
    local: ROUTES.columns[0].cta,
    byok: ROUTES.columns[1].cta,
    cloud: ROUTES.columns[2].cta,
  } satisfies Record<LaneId, { label: string; href: string }>,
  plansLabel: `${LANE_NAMES.cloud} plans`,
  cta: PRICING.cta,
} as const;

export const CLOSE_PLATE = {
  title: CLOSE.title,
  body: [
    'AGI Web needs no install.',
    CLI_AVAILABILITY_NOTE,
    'Whichever you open, the answer says where it ran.',
  ]
    .filter(Boolean)
    .join(' '),
  summary: surfaceAvailabilitySummary(),
} as const;
