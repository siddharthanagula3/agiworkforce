/**
 * The arithmetic of a negotiated commitment, in whole minor units.
 * Every figure an enterprise invoice carries is computed here, once.
 */

import { MICROUSD_PER_CENT } from '../rate-card';

export const COMMERCIAL_MODELS = [
  'seat_only',
  'seat_plus_usage',
  'prepaid_consumption',
  'postpaid_usage',
  'committed_spend',
  'hybrid',
] as const;

export type CommercialModel = (typeof COMMERCIAL_MODELS)[number];

export interface CommitmentShape {
  readonly committedSeats: number;
  readonly committedUsageBlockCents: number;
  readonly includedUsageCentsPerPeriod: number;
  readonly minimumAnnualSpendCents: number;
  readonly meteredUsage: boolean;
}

export interface CommitmentComponents {
  readonly seats: boolean;
  readonly prepaid: boolean;
  readonly metered: boolean;
  readonly minimum: boolean;
}

export function commitmentComponents(shape: CommitmentShape): CommitmentComponents {
  return {
    seats: shape.committedSeats > 0,
    prepaid: shape.committedUsageBlockCents > 0,
    metered: shape.meteredUsage || shape.includedUsageCentsPerPeriod > 0,
    minimum: shape.minimumAnnualSpendCents > 0,
  };
}

/**
 * Which commercial model a set of negotiated terms expresses, or null when the
 * terms commit to nothing and so cannot be billed.
 */
export function resolveCommercialModel(shape: CommitmentShape): CommercialModel | null {
  const { seats, prepaid, metered, minimum } = commitmentComponents(shape);
  if (!seats && !prepaid && !metered && !minimum) return null;
  if (seats && !prepaid && !metered && !minimum) return 'seat_only';
  if (seats && metered && !prepaid && !minimum) return 'seat_plus_usage';
  if (!seats && prepaid && !minimum) return 'prepaid_consumption';
  if (!seats && metered && !prepaid && !minimum) return 'postpaid_usage';
  if (!seats && minimum && !prepaid) return 'committed_spend';
  return 'hybrid';
}

function assertWholeCents(label: string, value: number): number {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} is money and must be whole minor units, received ${value}.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} is outside the range money can be counted in.`);
  }
  return value;
}

function assertNonNegativeCents(label: string, value: number): number {
  if (assertWholeCents(label, value) < 0) {
    throw new RangeError(`${label} cannot be negative.`);
  }
  return value;
}

function assertWholeCount(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} is a whole count of zero or more, received ${value}.`);
  }
  return value;
}

/**
 * Integer proration. Half a minor unit rounds away from zero, so two halves of
 * one period add back to the whole rather than losing a cent to the floor.
 */
export function prorateCents(
  amountCents: number,
  unitsElapsedOrRemaining: number,
  unitsInPeriod: number,
): number {
  assertWholeCents('A prorated amount', amountCents);
  assertWholeCount('A proration numerator', unitsElapsedOrRemaining);
  assertWholeCount('A proration denominator', unitsInPeriod);
  if (unitsInPeriod === 0) {
    throw new RangeError('A billing period with no days in it cannot be prorated.');
  }
  if (unitsElapsedOrRemaining > unitsInPeriod) {
    throw new RangeError('A proration cannot cover more of a period than the period holds.');
  }
  const sign = amountCents < 0 ? -1 : 1;
  const magnitude = Math.abs(amountCents) * unitsElapsedOrRemaining;
  return sign * Math.floor((magnitude + Math.floor(unitsInPeriod / 2)) / unitsInPeriod);
}

export interface SeatPosition {
  readonly committedSeats: number;
  readonly assignedSeats: number;
  readonly seatUnitPriceCents: number;
  readonly daysRemainingInTerm: number;
  readonly daysInTerm: number;
}

export interface SeatTrueUp {
  /** Seats assigned above the commitment, which are the ones that cost more. */
  readonly billableSeats: number;
  readonly chargeCents: number;
  /** Seats the commitment covers that nobody is using; they stay billed. */
  readonly unusedCommittedSeats: number;
  readonly creditCents: number;
}

/**
 * A seat add is charged for the remainder of the term; a seat removal returns
 * nothing, because the commitment is the floor the customer signed for.
 */
export function seatTrueUp(position: SeatPosition): SeatTrueUp {
  assertWholeCount('A seat commitment', position.committedSeats);
  assertWholeCount('An assigned seat count', position.assignedSeats);
  assertNonNegativeCents('A negotiated seat rate', position.seatUnitPriceCents);
  const billableSeats = Math.max(0, position.assignedSeats - position.committedSeats);
  const unusedCommittedSeats = Math.max(0, position.committedSeats - position.assignedSeats);
  return {
    billableSeats,
    chargeCents: prorateCents(
      billableSeats * position.seatUnitPriceCents,
      position.daysRemainingInTerm,
      position.daysInTerm,
    ),
    unusedCommittedSeats,
    creditCents: 0,
  };
}

export interface PrepaidDrawdown {
  readonly appliedCents: number;
  readonly remainingBalanceCents: number;
  readonly uncoveredCents: number;
}

/**
 * Consumption against a prepaid block. The block is a commitment balance, not a
 * credit grant, and it never goes below zero: what it cannot cover is invoiced.
 */
export function drawdownPrepaidCents(input: {
  readonly balanceCents: number;
  readonly usageCents: number;
}): PrepaidDrawdown {
  const balance = assertNonNegativeCents('A prepaid commitment balance', input.balanceCents);
  const usage = assertNonNegativeCents('Metered usage', input.usageCents);
  const applied = Math.min(balance, usage);
  return {
    appliedCents: applied,
    remainingBalanceCents: balance - applied,
    uncoveredCents: usage - applied,
  };
}

/** Usage billed in arrears, after whatever the period includes is used up. */
export function postpaidUsageDueCents(input: {
  readonly meteredCents: number;
  readonly includedCents: number;
}): number {
  const metered = assertNonNegativeCents('Metered usage', input.meteredCents);
  const included = assertNonNegativeCents('Included usage', input.includedCents);
  return Math.max(0, metered - included);
}

/** What a minimum commitment still owes when the term ends short of it. */
export function minimumCommitmentShortfallCents(input: {
  readonly minimumCents: number;
  readonly recognizedCents: number;
}): number {
  const minimum = assertNonNegativeCents('A minimum commitment', input.minimumCents);
  const recognized = assertNonNegativeCents('Recognized spend', input.recognizedCents);
  return Math.max(0, minimum - recognized);
}

export const COMMITMENT_LINE_KINDS = [
  'seat_commitment',
  'seat_true_up',
  'prepaid_drawdown',
  'usage_overage',
  'commitment_shortfall',
] as const;

export type CommitmentLineKind = (typeof COMMITMENT_LINE_KINDS)[number];

export interface CommitmentLine {
  readonly kind: CommitmentLineKind;
  readonly amountCents: number;
  readonly quantity: number;
}

export interface PeriodChargeInput {
  readonly shape: CommitmentShape;
  readonly seats: SeatPosition;
  readonly meteredUsageCents: number;
  readonly prepaidBalanceCents: number;
  readonly recognizedTermSpendCents: number;
  readonly isFinalPeriodOfTerm: boolean;
}

/**
 * One period of an enterprise invoice, line by line. A shortfall is its own
 * line so nobody has to find it inside a rounded total.
 */
export function periodCommitmentLines(input: PeriodChargeInput): CommitmentLine[] {
  const model = resolveCommercialModel(input.shape);
  if (model === null) {
    throw new RangeError('These terms commit to nothing, so no period can be billed from them.');
  }
  const lines: CommitmentLine[] = [];

  if (input.shape.committedSeats > 0) {
    lines.push({
      kind: 'seat_commitment',
      amountCents: input.seats.committedSeats * input.seats.seatUnitPriceCents,
      quantity: input.seats.committedSeats,
    });
    const trueUp = seatTrueUp(input.seats);
    if (trueUp.billableSeats > 0) {
      lines.push({
        kind: 'seat_true_up',
        amountCents: trueUp.chargeCents,
        quantity: trueUp.billableSeats,
      });
    }
  }

  const drawdown = drawdownPrepaidCents({
    balanceCents: input.prepaidBalanceCents,
    usageCents: input.meteredUsageCents,
  });
  if (drawdown.appliedCents > 0) {
    lines.push({ kind: 'prepaid_drawdown', amountCents: 0, quantity: drawdown.appliedCents });
  }

  const overage = postpaidUsageDueCents({
    meteredCents: drawdown.uncoveredCents,
    includedCents: input.shape.includedUsageCentsPerPeriod,
  });
  if (overage > 0) {
    lines.push({ kind: 'usage_overage', amountCents: overage, quantity: overage });
  }

  if (input.isFinalPeriodOfTerm && input.shape.minimumAnnualSpendCents > 0) {
    const shortfall = minimumCommitmentShortfallCents({
      minimumCents: input.shape.minimumAnnualSpendCents,
      recognizedCents: input.recognizedTermSpendCents,
    });
    if (shortfall > 0) {
      lines.push({ kind: 'commitment_shortfall', amountCents: shortfall, quantity: 1 });
    }
  }

  return lines;
}

export function commitmentLinesTotalCents(lines: readonly CommitmentLine[]): number {
  let total = 0;
  for (const line of lines) total += assertWholeCents('An invoice line', line.amountCents);
  return total;
}

export interface AmendmentProration {
  readonly previousTermRefundCents: number;
  readonly amendedTermChargeCents: number;
  readonly netCents: number;
}

/**
 * A mid-term amendment charges the new terms for the days that remain and
 * returns the unused part of what the superseded terms already billed.
 */
export function amendmentProration(input: {
  readonly previousPeriodAmountCents: number;
  readonly amendedPeriodAmountCents: number;
  readonly daysRemainingInPeriod: number;
  readonly daysInPeriod: number;
}): AmendmentProration {
  const refund = prorateCents(
    assertNonNegativeCents('A superseded period amount', input.previousPeriodAmountCents),
    input.daysRemainingInPeriod,
    input.daysInPeriod,
  );
  const charge = prorateCents(
    assertNonNegativeCents('An amended period amount', input.amendedPeriodAmountCents),
    input.daysRemainingInPeriod,
    input.daysInPeriod,
  );
  return {
    previousTermRefundCents: refund,
    amendedTermChargeCents: charge,
    netCents: charge - refund,
  };
}

/** Contract money in the unit the usage ledger settles in. */
export function contractCentsToMicroUsd(cents: number): number {
  return assertWholeCents('Contract money', cents) * MICROUSD_PER_CENT;
}
