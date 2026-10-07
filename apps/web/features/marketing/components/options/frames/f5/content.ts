import {
  CONSOLE_ANSWER,
  CONSOLE_LANES,
  CONSOLE_PROMPT,
  HERO,
  RECEIPT_LABELS,
  ROUTES,
  type ReceiptKey,
} from '@/features/marketing/components/landing/landing-content';
import { LANE_NAMES, type LaneId } from '@/features/marketing/components/system/lanes';
import {
  isReleased,
  SURFACE_NAMES,
  SURFACE_STATUS,
  surfaceAvailabilitySummary,
} from '@/lib/surface-status';

export const CLAIM = ROUTES.title;
export const PROMPT = CONSOLE_PROMPT;
export const PRIMARY = HERO.primary;
export const SECONDARY = HERO.secondary;
export const AVAILABILITY = surfaceAvailabilitySummary();
export const CLI_TAG = `In the ${SURFACE_NAMES.cli}, ${SURFACE_STATUS.cli.toLowerCase()}`;
export const ANSWER_HEADING = CONSOLE_ANSWER[1].heading;
export const ANSWER_LINE = CONSOLE_ANSWER[1].items[0].join(': ');
export const ILLUSTRATION_NOTE = 'Illustration. Token counts are examples.';

export type BeatId = 'ask' | 'route' | 'answer' | 'receipt';

export const BEATS: readonly { id: BeatId; index: string; label: string }[] = [
  { id: 'ask', index: '01', label: 'Ask' },
  { id: 'route', index: '02', label: 'Route' },
  { id: 'answer', index: '03', label: 'Answer' },
  { id: 'receipt', index: '04', label: 'Receipt' },
];

export type Lane = { id: LaneId; name: string; live: boolean };

export const LANES: readonly Lane[] = CONSOLE_LANES.map((lane) => ({
  id: lane.lane,
  name: LANE_NAMES[lane.lane],
  live: lane.lane === 'cloud' ? isReleased('web') : isReleased('cli'),
}));

const RECEIPT_KEYS: readonly ReceiptKey[] = ['route', 'model', 'left', 'tokens', 'cost'];
const cloudLane = CONSOLE_LANES.find((lane) => lane.lane === 'cloud') ?? CONSOLE_LANES[0];

export const RECEIPT_ROWS: readonly { label: string; value: string }[] = RECEIPT_KEYS.map(
  (key) => ({ label: RECEIPT_LABELS[key], value: cloudLane?.receipt[key] ?? '' }),
);
