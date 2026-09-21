import {
  COMMITMENT_LINE_KINDS,
  commitmentLinesTotalCents,
  commitmentShapeOf,
  periodCommitmentLines,
  type CommercialContractView,
  type CommitmentLine,
  type CommitmentLineKind,
  type SeatPosition,
} from '@agiworkforce/types';

/**
 * One settled unit of enterprise usage as the financial ledger holds it. The
 * amount is what the customer was charged, never an analytics estimate, and
 * `settledAt` is separate from `occurredAt` so usage that arrives after its
 * own period can be recognised as late rather than silently dated forward.
 */
export interface SettledUsageUnit {
  sourceRef: string;
  occurredAt: string;
  settledAt: string;
  amountCents: number;
}

export interface EnterpriseBillingPeriod {
  /** Inclusive first instant of the period, as an ISO timestamp. */
  start: string;
  /** Exclusive last instant of the period, as an ISO timestamp. */
  end: string;
}

export const ENTERPRISE_INVOICE_LINE_KINDS = [
  ...COMMITMENT_LINE_KINDS,
  'late_usage_catch_up',
] as const;

export type EnterpriseInvoiceLineKind = (typeof ENTERPRISE_INVOICE_LINE_KINDS)[number];

export interface EnterpriseInvoiceLine {
  kind: EnterpriseInvoiceLineKind;
  description: string;
  amountCents: number;
  quantity: number;
}

export interface EnterpriseUsagePartition {
  /** Usage that both happened in this period and settled before the cut-off. */
  inPeriodCents: number;
  /** Usage of an earlier, already invoiced period that only settled now. */
  lateCents: number;
  /** Usage that settled after the cut-off; it belongs to the next invoice. */
  deferredCents: number;
  /** Usage of a period that has not been invoiced yet. */
  futureCents: number;
}

export interface EnterpriseInvoiceRun {
  lines: EnterpriseInvoiceLine[];
  totalCents: number;
  usage: EnterpriseUsagePartition;
  /** Units carried into this invoice because their own period was finalized. */
  lateSourceRefs: string[];
}

const LINE_DESCRIPTIONS: Readonly<Record<EnterpriseInvoiceLineKind, string>> = {
  seat_commitment: 'Committed seats',
  seat_true_up: 'Seats assigned above the commitment',
  prepaid_drawdown: 'Applied against the prepaid commitment',
  usage_overage: 'Usage above the included amount',
  commitment_shortfall: 'Minimum commitment shortfall',
  late_usage_catch_up: 'Usage of an earlier period, settled after it was invoiced',
};

export interface EnterpriseInvoiceRunInput {
  contract: CommercialContractView;
  period: EnterpriseBillingPeriod;
  seats: SeatPosition;
  usage: readonly SettledUsageUnit[];
  prepaidBalanceCents: number;
  recognizedTermSpendCents: number;
  isFinalPeriodOfTerm: boolean;
  /**
   * The instant this period's invoice is finalized. Usage settled at or after
   * it cannot be on this document, because a finalized invoice is never
   * rewritten.
   */
  settlementCutOff: string;
}

/**
 * Splits settled usage into what this invoice may carry. Usage whose own
 * period was already invoiced is late, not missing: it is carried forward onto
 * the next document rather than rewriting one the customer already holds.
 */
export function partitionSettledUsage(
  usage: readonly SettledUsageUnit[],
  period: EnterpriseBillingPeriod,
  settlementCutOff: string,
): { partition: EnterpriseUsagePartition; lateSourceRefs: string[] } {
  const partition: EnterpriseUsagePartition = {
    inPeriodCents: 0,
    lateCents: 0,
    deferredCents: 0,
    futureCents: 0,
  };
  const lateSourceRefs: string[] = [];

  for (const unit of usage) {
    if (!Number.isInteger(unit.amountCents) || unit.amountCents < 0) {
      throw new RangeError(`Settled usage ${unit.sourceRef} is not a whole number of cents.`);
    }
    if (unit.settledAt >= settlementCutOff) {
      partition.deferredCents += unit.amountCents;
      continue;
    }
    if (unit.occurredAt >= period.end) {
      partition.futureCents += unit.amountCents;
      continue;
    }
    if (unit.occurredAt < period.start) {
      partition.lateCents += unit.amountCents;
      lateSourceRefs.push(unit.sourceRef);
      continue;
    }
    partition.inPeriodCents += unit.amountCents;
  }

  return { partition, lateSourceRefs };
}

function describe(line: CommitmentLine): EnterpriseInvoiceLine {
  const kind: CommitmentLineKind = line.kind;
  return {
    kind,
    description: LINE_DESCRIPTIONS[kind],
    amountCents: line.amountCents,
    quantity: line.quantity,
  };
}

/**
 * One enterprise invoice, built from the settled ledger and the commitment the
 * contract carries. Seats, prepaid drawdown, overage above what the period
 * includes and a term shortfall all come from the signed agreement's
 * arithmetic; nothing here decides a price.
 */
export function buildEnterpriseInvoiceRun(input: EnterpriseInvoiceRunInput): EnterpriseInvoiceRun {
  const { partition, lateSourceRefs } = partitionSettledUsage(
    input.usage,
    input.period,
    input.settlementCutOff,
  );

  const commitmentLines = periodCommitmentLines({
    shape: commitmentShapeOf(input.contract.commercials),
    seats: input.seats,
    meteredUsageCents: partition.inPeriodCents,
    prepaidBalanceCents: input.prepaidBalanceCents,
    recognizedTermSpendCents: input.recognizedTermSpendCents,
    isFinalPeriodOfTerm: input.isFinalPeriodOfTerm,
  });

  const lines = commitmentLines.map(describe);
  if (partition.lateCents > 0) {
    lines.push({
      kind: 'late_usage_catch_up',
      description: LINE_DESCRIPTIONS.late_usage_catch_up,
      amountCents: partition.lateCents,
      quantity: lateSourceRefs.length,
    });
  }

  return {
    lines,
    totalCents: commitmentLinesTotalCents(commitmentLines) + partition.lateCents,
    usage: partition,
    lateSourceRefs,
  };
}

export interface StripeInvoiceLine {
  description: string;
  /** The whole charge this line carries, not a unit rate. */
  amountCents: number;
  /** What the charge counts: seats, late units, or one of whatever it is. */
  quantity: number;
  periodStart: number;
  periodEnd: number;
}

const MILLISECONDS_PER_SECOND = 1_000;

function unixSeconds(iso: string): number {
  const milliseconds = Date.parse(iso);
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError(`A billing period boundary has to be a timestamp: ${iso}`);
  }
  return Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
}

/**
 * The invoice run as the lines an issuer hands a provider. A line worth
 * nothing is dropped: a prepaid drawdown is a fact about the balance, not a
 * charge, and a zero-amount line on the document only confuses accounts
 * payable.
 */
export function invoiceRunToStripeLines(
  run: EnterpriseInvoiceRun,
  period: EnterpriseBillingPeriod,
): StripeInvoiceLine[] {
  const periodStart = unixSeconds(period.start);
  const periodEnd = unixSeconds(period.end);
  return run.lines
    .filter((line) => line.amountCents > 0)
    .map((line) => ({
      description: line.description,
      amountCents: line.amountCents,
      quantity: line.quantity > 0 && line.quantity !== line.amountCents ? line.quantity : 1,
      periodStart,
      periodEnd,
    }));
}
