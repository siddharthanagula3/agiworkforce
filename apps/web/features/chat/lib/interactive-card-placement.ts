import { interactiveCardRendersBeforeProse, type InteractiveCard } from '@agiworkforce/types';

export function cardLeadsProse(
  card: Pick<InteractiveCard, 'cardId' | 'kind'>,
  textOffsets: Readonly<Record<string, number>> | undefined,
): boolean {
  const offset = textOffsets?.[card.cardId];
  return offset === undefined ? interactiveCardRendersBeforeProse(card.kind) : offset === 0;
}
