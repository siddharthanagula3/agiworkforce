import { modelsCatalogJson, PROVIDERS_IN_ORDER } from '@agiworkforce/types';
import { hasProviderMark } from '@agiworkforce/ui';
import {
  CONSOLE_LANES,
  HERO,
  MODELS_SECTION,
  modelName,
  providerLabel,
  RECEIPT_LABELS,
} from '@/features/marketing/components/landing/landing-content';
import { LANE_NAMES } from '@/features/marketing/components/system/lanes';
import { CLI_LOCAL_RUNTIME_IDS } from '@/lib/marketing-constants';
import { surfaceAvailabilitySummary } from '@/lib/surface-status';

const MAX_PROVIDER_STOPS = 11;
const AUTO_LABEL = 'Auto';
const LOCAL_RUNTIME_IDS: readonly string[] = CLI_LOCAL_RUNTIME_IDS;
const catalogProviders = modelsCatalogJson.providers as unknown as Record<
  string,
  { defaultModel?: string }
>;

export interface ReceiptRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly lane?: 'cloud';
}

export interface DialStop {
  readonly id: string;
  readonly label: string;
  readonly providerKey: string | null;
  readonly rows: readonly ReceiptRow[];
}

function cloudLane() {
  const lane = CONSOLE_LANES.find((candidate) => candidate.lane === 'cloud');
  if (!lane) throw new Error('landing content has no cloud lane');
  return lane;
}

const cloud = cloudLane();

const AUTO_STOP: DialStop = {
  id: 'auto',
  label: AUTO_LABEL,
  providerKey: null,
  rows: [
    {
      key: 'route',
      label: RECEIPT_LABELS.route,
      value: `${AUTO_LABEL} · ${cloud.receipt.route}`,
      lane: 'cloud',
    },
    { key: 'model', label: RECEIPT_LABELS.model, value: cloud.receipt.model },
    { key: 'tokens', label: RECEIPT_LABELS.tokens, value: cloud.receipt.tokens },
    { key: 'cost', label: RECEIPT_LABELS.cost, value: cloud.receipt.cost },
  ],
};

const EXACT_POINT = MODELS_SECTION.points[0];

function providerStop(id: string): DialStop {
  const defaultModel = catalogProviders[id]?.defaultModel ?? '';
  const model = defaultModel
    ? `${providerLabel(id)} · ${modelName(defaultModel)}`
    : providerLabel(id);
  return {
    id,
    label: providerLabel(id),
    providerKey: id,
    rows: [
      { key: 'route', label: RECEIPT_LABELS.route, value: LANE_NAMES.cloud, lane: 'cloud' },
      { key: 'model', label: RECEIPT_LABELS.model, value: model },
      { key: 'exact', label: EXACT_POINT.title, value: EXACT_POINT.body },
    ],
  };
}

const providerIds = PROVIDERS_IN_ORDER.filter(
  (id) => hasProviderMark(id) && !LOCAL_RUNTIME_IDS.includes(id),
).slice(0, MAX_PROVIDER_STOPS);

export const STOPS: readonly DialStop[] = [AUTO_STOP, ...providerIds.map(providerStop)];

export const CLAIM = MODELS_SECTION.title;
export const CLAIM_LINES = CLAIM.split('. ').map((line, index, all) =>
  index < all.length - 1 ? `${line}.` : line,
);
export const READOUT_NOTE = 'Illustration. Token counts are examples.';
export const READOUT_TITLE = 'What the reply says';
export const PRIMARY = HERO.primary;
export const SECONDARY = HERO.secondary;
export const AVAILABILITY = surfaceAvailabilitySummary();
export const DIAL_LABEL = 'Model selector';
