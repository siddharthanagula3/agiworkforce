import {
  CONSOLE_LANES,
  HERO,
  RECEIPT_LABELS,
  type ReceiptKey,
} from '@/features/marketing/components/landing/landing-content';
import { LANE_NAMES, type LaneId } from '@/features/marketing/components/system/lanes';
import {
  CLI_AVAILABILITY_NOTE,
  isReleased,
  SURFACE_IDS,
  SURFACE_NAMES,
  SURFACE_STATUS,
  surfaceAvailabilitySummary,
  type SurfaceId,
} from '@/lib/surface-status';

const [claimHead, ...claimRest] = HERO.title.split('. ');

export const CLAIM_ONE = `${claimHead}.`;
export const CLAIM_TWO = claimRest.join('. ');
export const PRIMARY = HERO.primary;
export const SECONDARY = HERO.secondary;
export const AVAILABILITY = surfaceAvailabilitySummary();
export const CLI_TAG = `${SURFACE_NAMES.cli}, ${SURFACE_STATUS.cli.toLowerCase()}`;
export const ILLUSTRATION_NOTE = 'Illustration. Token counts are examples.';
export const RECEIPT_HEADING = 'Receipt';
export const SURFACES_HEADING = 'Six surfaces';
export const ROUTES_HEADING = 'Three routes';

const RECEIPT_KEYS: readonly ReceiptKey[] = ['route', 'model', 'tokens', 'cost'];

export type ReceiptRow = { label: string; value: string };

export type Lane = {
  id: LaneId;
  name: string;
  live: boolean;
  rows: readonly ReceiptRow[];
  note: string;
};

export const LANES: readonly Lane[] = CONSOLE_LANES.map((lane) => {
  const live = lane.lane === 'cloud' ? isReleased('web') : isReleased('cli');
  return {
    id: lane.lane,
    name: LANE_NAMES[lane.lane],
    live,
    rows: RECEIPT_KEYS.map((key) => ({ label: RECEIPT_LABELS[key], value: lane.receipt[key] })),
    note: live ? '' : CLI_AVAILABILITY_NOTE,
  };
});

export const DEFAULT_LANE: LaneId = 'cloud';

export type Surface = { id: SurfaceId; name: string; status: string; live: boolean };

export const SURFACES: readonly Surface[] = SURFACE_IDS.map((id) => ({
  id,
  name: SURFACE_NAMES[id],
  status: SURFACE_STATUS[id],
  live: isReleased(id),
}));
