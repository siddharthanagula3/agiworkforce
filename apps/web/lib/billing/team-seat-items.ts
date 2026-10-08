import {
  MAX_PURCHASABLE_SEATS,
  teamSeatTypeOfPlan,
  type TeamSeatQuantities,
  type TeamSeatType,
} from '@agiworkforce/types';
import { getPricePointForPriceId } from '@/lib/pricing';

export interface SeatLineItem {
  price?: string | { id?: string | null } | null;
  quantity?: number | null;
}

function priceIdOf(item: SeatLineItem): string | null {
  if (typeof item.price === 'string') return item.price;
  return item.price?.id ?? null;
}

function seatQuantityOf(item: SeatLineItem): number {
  const quantity = item.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) return 0;
  return Math.min(quantity, MAX_PURCHASABLE_SEATS);
}

export function seatTypeOfLineItem(item: SeatLineItem): TeamSeatType | null {
  const priceId = priceIdOf(item);
  const point = priceId ? getPricePointForPriceId(priceId.trim()) : null;
  return point ? teamSeatTypeOfPlan(point.plan) : null;
}

/**
 * Null when no line bills a registered Team seat Price, which is how an
 * Enterprise or individual subscription reads: those keep their own seat rule.
 */
export function resolveSeatQuantities(
  items: readonly SeatLineItem[] | null | undefined,
): TeamSeatQuantities | null {
  let matched = false;
  const quantities: TeamSeatQuantities = { standard: 0, premium: 0 };
  for (const item of items ?? []) {
    const seatType = seatTypeOfLineItem(item);
    if (!seatType) continue;
    matched = true;
    quantities[seatType] += seatQuantityOf(item);
  }
  return matched ? quantities : null;
}

/**
 * Stripe returns subscription items in no promised order, so a team that mixes
 * seat types is represented by its Standard seat line wherever one price is
 * recorded for the subscription.
 */
export function primarySeatLineItem<T extends SeatLineItem>(
  items: readonly T[] | null | undefined,
): T | null {
  const list = items ?? [];
  return list.find((item) => seatTypeOfLineItem(item) !== 'premium') ?? list[0] ?? null;
}

export function seatLineItemOfType<T extends SeatLineItem>(
  items: readonly T[] | null | undefined,
  seatType: TeamSeatType,
): T | null {
  return (items ?? []).find((item) => seatTypeOfLineItem(item) === seatType) ?? null;
}
