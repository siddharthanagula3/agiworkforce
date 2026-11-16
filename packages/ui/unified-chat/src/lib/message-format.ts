import type { KnownInteractiveCardKind } from '@agiworkforce/types';

export type CardType = 'recipe' | 'comparison' | 'calculation' | 'steps' | null;

const FENCE_OPENING = /^[ \t>]*(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSING = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/;
const CONTAINER_PREFIX = /^[ \t>]*/;
const MATH_FENCE_LANGUAGES: ReadonlySet<string> = new Set(['math', 'latex-display']);

/**
 * The answer with every fenced code block removed, a fence that is never
 * closed running to the end. A math fence is kept as a `$$` block. A backtick
 * line whose info string holds a backtick is not a fence (CommonMark).
 */
export function withoutCodeFences(content: string): string {
  const kept: string[] = [];
  let open: { char: string; length: number; mathBody: string[] | null } | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (open === null) {
      const match = FENCE_OPENING.exec(line);
      const fence = match?.[1];
      const info = match?.[2] ?? '';
      if (!fence || (fence.charAt(0) === '`' && info.includes('`'))) {
        kept.push(line);
        continue;
      }
      const language = (info.trim().split(/\s+/)[0] ?? '').toLowerCase();
      open = {
        char: fence.charAt(0),
        length: fence.length,
        mathBody: MATH_FENCE_LANGUAGES.has(language) ? [] : null,
      };
      continue;
    }
    const fence = FENCE_CLOSING.exec(line)?.[1];
    if (fence && fence.charAt(0) === open.char && fence.length >= open.length) {
      if (open.mathBody !== null && open.mathBody.some((body) => body.trim() !== '')) {
        kept.push('$$', ...open.mathBody, '$$');
      }
      open = null;
    } else if (open.mathBody !== null) {
      open.mathBody.push(line.replace(CONTAINER_PREFIX, ''));
    }
  }
  return kept.join('\n');
}

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
    /\$\$[\s\S]+?=[\s\S]+?\$\$/m,
    /`[^`]*[+\-*/^]+[^`]*=\s*[-\d.,]+[^`]*`/m,
    /\\\[[\s\S]+?=[\s\S]+?\\\]/m,
  ];
  const prose = withoutCodeFences(content);
  const hasCalcHeader = /#+\s*(calculation|result|formula|equation|math)/i.test(prose);
  const hasCalcPattern = calcPatterns.some((p) => p.test(prose));
  if (hasCalcHeader && hasCalcPattern) return 'calculation';
  const latexBlocks = prose.match(/\$\$[\s\S]+?\$\$/g);
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

  const explicitSteps = content.match(/(?:^|\n)\s*(?:#{1,4}\s*)?step\s+\d+\b/gi);
  const orderedLeadIns = content.match(/(?:^|\n)\s*\d+\.\s+\*\*[^*\n]+\*\*/g);
  const hasProcedureHeading =
    /#+\s*(guide|how to|tutorial|walkthrough|step-by-step|troubleshooting)/i.test(content);
  if (explicitSteps && explicitSteps.length >= 3) return 'steps';
  if (
    hasProcedureHeading &&
    ((explicitSteps && explicitSteps.length >= 2) || (orderedLeadIns && orderedLeadIns.length >= 3))
  ) {
    return 'steps';
  }

  return null;
}

const PRODUCT_COMPARISON_CARD_KIND: KnownInteractiveCardKind = 'product-comparison.v1';

export function answerFormatCardType(
  content: string,
  interactiveCardKinds: readonly string[] = [],
): CardType {
  const detected = detectCardType(content);
  return detected === 'comparison' && interactiveCardKinds.includes(PRODUCT_COMPARISON_CARD_KIND)
    ? null
    : detected;
}
