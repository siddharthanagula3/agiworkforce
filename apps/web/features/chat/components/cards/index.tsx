/**
 * Card Type Registry and Detector
 *
 * Detects structured content patterns in assistant messages and renders
 * purpose-built format cards (recipe, comparison, steps, calculation)
 * instead of plain markdown. Inspired by claude.ai's rich message cards.
 */

'use client';

import { RecipeCard } from './RecipeCard';
import { ComparisonCard } from './ComparisonCard';
import { StepsCard } from './StepsCard';
import { CalculationCard } from './CalculationCard';

export type CardType = 'recipe' | 'comparison' | 'calculation' | 'steps' | null;

/**
 * Detect whether a message contains structured content that should render
 * as a rich card rather than plain markdown.
 *
 * Detection is intentionally conservative -- we only match when the content
 * has strong structural signals (headers, lists, specific keywords in
 * combination) to avoid false positives on casual mentions.
 */
export function detectCardType(content: string): CardType {
  if (!content || content.length < 40) return null;

  const lower = content.toLowerCase();

  // --- Recipe detection ---
  // Must have ingredients AND (steps/instructions/directions)
  const hasIngredients = /#+\s*ingredients/i.test(content) || /\*\*ingredients\*\*/i.test(content);
  const hasInstructions =
    /#+\s*(instructions|directions|steps|method|preparation)/i.test(content) ||
    /\*\*(instructions|directions|steps|method|preparation)\*\*/i.test(content);
  const hasRecipeSignals =
    (lower.includes('prep time') || lower.includes('cook time') || lower.includes('servings')) &&
    hasIngredients;
  if (hasIngredients && hasInstructions) return 'recipe';
  if (hasRecipeSignals) return 'recipe';

  // --- Calculation detection ---
  // Look for math expressions with results, or explicit "= <number>" patterns
  const calcPatterns = [
    /(?:^|\n)\s*(?:result|answer|total|sum|difference|product|quotient)\s*[:=]\s*[-\d.,]+/im,
    /\$\$[\s\S]+?=[\s\S]+?\$\$/m, // LaTeX block equations with =
    /`[^`]*[+\-*/^]+[^`]*=\s*[-\d.,]+[^`]*`/m, // inline code with math
    /\\\[[\s\S]+?=[\s\S]+?\\\]/m, // LaTeX display math
  ];
  const hasCalcHeader = /#+\s*(calculation|result|formula|equation|math)/i.test(content);
  const hasCalcPattern = calcPatterns.some((p) => p.test(content));
  if (hasCalcHeader && hasCalcPattern) return 'calculation';
  // Strong signal: multiple LaTeX blocks
  const latexBlocks = content.match(/\$\$[\s\S]+?\$\$/g);
  if (latexBlocks && latexBlocks.length >= 2 && hasCalcPattern) return 'calculation';

  // --- Comparison detection ---
  // Must have "vs" in a heading or multiple pro/con sections
  const hasVsHeading = /#+\s*.+\s+vs\.?\s+.+/i.test(content);
  const hasComparisonTable = /\|.*\|.*\|/.test(content) && lower.includes('vs');
  const prosConsCount = (
    lower.match(/\b(pros?|cons?|advantages?|disadvantages?|strengths?|weaknesses?)\b/g) || []
  ).length;
  if (hasVsHeading) return 'comparison';
  if (hasComparisonTable) return 'comparison';
  if (prosConsCount >= 3 && (lower.includes(' vs ') || lower.includes(' versus ')))
    return 'comparison';

  // --- Steps detection ---
  // Numbered step headers or "Step N:" patterns (at least 3)
  const stepHeaders = content.match(/(?:^|\n)\s*(?:#+\s*)?(?:step\s+\d+|^\d+\.\s+\*\*)/gim);
  const hasStepKeyword = /#+\s*(guide|how to|tutorial|walkthrough|step-by-step)/i.test(content);
  if (stepHeaders && stepHeaders.length >= 3) return 'steps';
  if (hasStepKeyword && stepHeaders && stepHeaders.length >= 2) return 'steps';

  return null;
}

interface MessageCardRendererProps {
  content: string;
  cardType: CardType;
}

/**
 * Renders the appropriate card component for the detected card type.
 * Returns null if cardType is null (caller should fall back to markdown).
 */
export function MessageCardRenderer({ content, cardType }: MessageCardRendererProps) {
  switch (cardType) {
    case 'recipe':
      return <RecipeCard content={content} />;
    case 'comparison':
      return <ComparisonCard content={content} />;
    case 'steps':
      return <StepsCard content={content} />;
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
