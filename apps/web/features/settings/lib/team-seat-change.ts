import {
  TEAM_SEAT_TYPE_LABELS,
  getPlanPriceCents,
  managedUsageMultiplier,
  teamSeatPlanTier,
  type BillingInterval,
  type TeamSeatType,
} from '@agiworkforce/types';
import { formatRecurringMoney } from '@/features/billing/lib/billing-format';

export interface SeatChangeQuestion {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface SeatChangeContext {
  memberName: string;
  from: TeamSeatType;
  to: TeamSeatType;
  interval: BillingInterval;
  unassignedPremiumSeats: number;
  premiumPaidThrough: string | null;
}

export function seatPriceLabel(seatType: TeamSeatType, interval: BillingInterval): string {
  const cents = getPlanPriceCents(teamSeatPlanTier(seatType), interval);
  return cents === null ? '' : formatRecurringMoney(cents, 'usd', interval);
}

function premiumUsageClause(memberName: string): string {
  const multiple = managedUsageMultiplier(
    teamSeatPlanTier('premium'),
    teamSeatPlanTier('standard'),
  );
  return multiple === null
    ? `${memberName} gets the Premium usage allowance straight away.`
    : `${memberName} gets ${multiple}x the usage of a Standard seat straight away.`;
}

export function seatChangeQuestion(context: SeatChangeContext): SeatChangeQuestion {
  const { memberName, from, to, interval } = context;
  const standard = seatPriceLabel('standard', interval);
  const premium = seatPriceLabel('premium', interval);
  const labels = {
    title: `Move ${memberName} to a ${TEAM_SEAT_TYPE_LABELS[to]} seat?`,
    confirmLabel: `Move to ${TEAM_SEAT_TYPE_LABELS[to]}`,
    cancelLabel: `Keep ${TEAM_SEAT_TYPE_LABELS[from]} seat`,
  };

  if (to === 'standard') {
    return {
      ...labels,
      description: `From the next renewal this seat is billed ${standard} instead of ${premium}. The current billing period is not refunded, so ${memberName} keeps Premium usage until it ends.`,
    };
  }

  if (context.unassignedPremiumSeats > 0) {
    return {
      ...labels,
      description: `This workspace already pays for ${context.unassignedPremiumSeats} Premium ${context.unassignedPremiumSeats === 1 ? 'seat that is' : 'seats that are'} not assigned, so nothing more is charged. ${premiumUsageClause(memberName)}`,
    };
  }

  if (context.premiumPaidThrough) {
    return {
      ...labels,
      description: `This seat was Premium earlier in this billing period, which is already paid for, so nothing is charged today. From the next renewal it is billed ${premium} instead of ${standard}.`,
    };
  }

  return {
    ...labels,
    description: `This seat changes from ${standard} to ${premium}. The difference for the rest of the current billing period is charged to the workspace payment method now, and every renewal bills the Premium price. ${premiumUsageClause(memberName)}`,
  };
}
