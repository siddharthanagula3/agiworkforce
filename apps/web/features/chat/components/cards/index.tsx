'use client';

import { RecipeCard } from './RecipeCard';
import { ComparisonCard } from './ComparisonCard';
import { StepsCard } from './StepsCard';
import { CalculationCard } from './CalculationCard';
import type { CardType } from '@agiworkforce/unified-chat/message-format';

interface MessageCardRendererProps {
  content: string;
  cardType: CardType;
  messageId?: string;
}

export function MessageCardRenderer({ content, cardType, messageId }: MessageCardRendererProps) {
  switch (cardType) {
    case 'recipe':
      return <RecipeCard content={content} />;
    case 'comparison':
      return <ComparisonCard content={content} />;
    case 'steps':
      return <StepsCard content={content} {...(messageId ? { messageId } : {})} />;
    case 'calculation':
      return <CalculationCard content={content} />;
    default:
      return null;
  }
}

export { RecipeCard } from './RecipeCard';
export { ComparisonCard } from './ComparisonCard';
export { StepsCard } from './StepsCard';
export { CalculationCard } from './CalculationCard';
