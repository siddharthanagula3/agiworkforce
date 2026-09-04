import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export const COLLECTION_STAGES = [
  'current',
  'past_due_30',
  'past_due_60',
  'past_due_90',
  'read_only',
] as const;

export type CollectionStage = (typeof COLLECTION_STAGES)[number];

export interface CollectionState {
  stage: CollectionStage;
  daysPastDue: number;
  oldestOpenInvoiceDueAt: string | null;
  seatExpansionBlocked: boolean;
  newPaidUsageBlocked: boolean;
  readOnly: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;
const PAST_DUE_30_MAX_DAYS = 30;
const PAST_DUE_60_MAX_DAYS = 60;
const PAST_DUE_90_MAX_DAYS = 90;
const PG_UNDEFINED_TABLE = '42P01';

function stageForDaysPastDue(daysPastDue: number): CollectionStage {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= PAST_DUE_30_MAX_DAYS) return 'past_due_30';
  if (daysPastDue <= PAST_DUE_60_MAX_DAYS) return 'past_due_60';
  if (daysPastDue <= PAST_DUE_90_MAX_DAYS) return 'past_due_90';
  return 'read_only';
}

export function deriveCollectionState(
  nowMs: number,
  oldestOpenInvoiceDueAt: string | Date | null | undefined,
): CollectionState {
  const dueAtMs =
    oldestOpenInvoiceDueAt instanceof Date
      ? oldestOpenInvoiceDueAt.getTime()
      : oldestOpenInvoiceDueAt
        ? Date.parse(oldestOpenInvoiceDueAt)
        : Number.NaN;
  const daysPastDue = Number.isFinite(dueAtMs)
    ? Math.max(0, Math.floor((nowMs - dueAtMs) / MS_PER_DAY))
    : 0;
  const stage = stageForDaysPastDue(daysPastDue);
  const blocked = stage === 'past_due_90' || stage === 'read_only';
  return {
    stage,
    daysPastDue,
    oldestOpenInvoiceDueAt: Number.isFinite(dueAtMs) ? new Date(dueAtMs).toISOString() : null,
    seatExpansionBlocked: blocked,
    newPaidUsageBlocked: blocked,
    readOnly: stage === 'read_only',
  };
}

export const CURRENT_COLLECTION_STATE: CollectionState = deriveCollectionState(0, null);

function isMissingContractSchema(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PG_UNDEFINED_TABLE
  );
}

export async function readOrganizationCollectionState(
  db: Pick<DatabaseAdapter, 'query'>,
  organizationId: string,
  nowMs: number = Date.now(),
): Promise<CollectionState> {
  try {
    const [row] = await db.query<{ oldest_open_invoice_due_at: string | null }>(
      `select oldest_open_invoice_due_at
         from public.organization_billing_contracts
        where organization_id = $1
          and ended_at is null
        limit 1`,
      [organizationId],
    );
    return deriveCollectionState(nowMs, row?.oldest_open_invoice_due_at ?? null);
  } catch (error) {
    if (isMissingContractSchema(error)) return CURRENT_COLLECTION_STATE;
    throw error;
  }
}
