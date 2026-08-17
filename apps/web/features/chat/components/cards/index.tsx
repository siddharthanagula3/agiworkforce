'use client';

import { RecipeCard } from './RecipeCard';
import { ComparisonCard } from './ComparisonCard';
import { StepsCard } from './StepsCard';
import { CalculationCard } from './CalculationCard';

export type CardType = 'recipe' | 'comparison' | 'calculation' | 'steps' | null;

export function detectCardType(content: string): CardType {
  if (!content || content.length < 40) return null;

  const lower = content.toLowerCase();

  const hasIngredients = /#+\s*ingredients/i.test(content) || /\*\*ingredients\*\*/i.test(content);
  const hasInstructions =
    /#+\s*(instructions|directions|steps|method|preparation)/i.test(content) ||
    /\*\*(instructions|directions|steps|method|preparation)\*\*/i.test(content);
  const hasRecipeSignals =
    (lower.includes('prep time') || lower.includes('cook time') || lower.includes('servings')) &&
    hasIngredients;
  if (hasIngredients && hasInstructions) return 'recipe';
  if (hasRecipeSignals) return 'recipe';

  const calcPatterns = [
    /(?:^|\n)\s*(?:result|answer|total|sum|difference|product|quotient)\s*[:=]\s*[-\d.,]+/im,
    /\$\$[\s\S]+?=[\s\S]+?\$\$/m, // LaTeX block equations with =
    /`[^`]*[+\-*/^]+[^`]*=\s*[-\d.,]+[^`]*`/m, // inline code with math
    /\\\[[\s\S]+?=[\s\S]+?\\\]/m, // LaTeX display math
  ];
  const hasCalcHeader = /#+\s*(calculation|result|formula|equation|math)/i.test(content);
  const hasCalcPattern = calcPatterns.some((p) => p.test(content));
  if (hasCalcHeader && hasCalcPattern) return 'calculation';
  const latexBlocks = content.match(/\$\$[\s\S]+?\$\$/g);
  if (latexBlocks && latexBlocks.length >= 2 && hasCalcPattern) return 'calculation';

  const hasVsHeading = /#+\s*.+\s+vs\.?\s+.+/i.test(content);
  const hasComparisonTable = /\|.*\|.*\|/.test(content) && lower.includes('vs');
  const prosConsCount = (
    lower.match(/\b(pros?|cons?|advantages?|disadvantages?|strengths?|weaknesses?)\b/g) || []
  ).length;
  if (hasVsHeading) return 'comparison';
  if (hasComparisonTable) return 'comparison';
  if (prosConsCount >= 3 && (lower.includes(' vs ') || lower.includes(' versus ')))
    return 'comparison';

  const stepHeaders = content.match(/(?:^|\n)\s*(?:#+\s*)?(?:step\s+\d+|^\d+\.\s+\*\*)/gim);
  const hasStepKeyword = /#+\s*(guide|how to|tutorial|walkthrough|step-by-step)/i.test(content);
  if (stepHeaders && stepHeaders.length >= 3) return 'steps';
  if (hasStepKeyword && stepHeaders && stepHeaders.length >= 2) return 'steps';

  return null;
}

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
