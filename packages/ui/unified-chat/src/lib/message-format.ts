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

const LINE_TERMINATORS: ReadonlySet<string> = new Set(['\n', '\r', '\u2028', '\u2029']);
const WHITESPACE = /\s/;
const ARITHMETIC_OPERATORS: ReadonlySet<string> = new Set(['+', '-', '*', '/', '^']);
const NUMBER_CHARACTER = /[-\d.,]/;

function hasEquationBetween(text: string, open: string, close: string): boolean {
  const start = text.indexOf(open);
  if (start < 0) return false;
  const equals = text.indexOf('=', start + open.length + 1);
  return equals >= 0 && text.indexOf(close, equals + 2) >= 0;
}

function spanHasArithmeticResult(span: string): boolean {
  let operatorSeen = false;
  for (let index = 0; index < span.length; index += 1) {
    const char = span.charAt(index);
    if (char === '=' && operatorSeen) {
      let next = index + 1;
      while (next < span.length && WHITESPACE.test(span.charAt(next))) next += 1;
      if (next < span.length && NUMBER_CHARACTER.test(span.charAt(next))) return true;
    }
    if (ARITHMETIC_OPERATORS.has(char)) operatorSeen = true;
  }
  return false;
}

function hasInlineCodeArithmetic(text: string): boolean {
  const spans = text.split('`');
  return spans.slice(1, -1).some(spanHasArithmeticResult);
}

// Each whitespace run may cross lines.
function hasVsHeadingText(content: string): boolean {
  let lastNonTerminator = content.length - 1;
  while (lastNonTerminator >= 0 && LINE_TERMINATORS.has(content.charAt(lastNonTerminator))) {
    lastNonTerminator -= 1;
  }
  let hashOnLine = false;
  let hashCarriedToLine = false;
  let previousChar = '';
  let previousIsAfterHash = false;
  let firstHorizontalSpace = -1;
  for (let index = 0; index < content.length; index += 1) {
    const char = content.charAt(index);
    if (WHITESPACE.test(char)) {
      if (LINE_TERMINATORS.has(char)) {
        hashOnLine = false;
        hashCarriedToLine = previousChar === '#';
      } else if (firstHorizontalSpace < 0) {
        firstHorizontalSpace = index;
      }
      continue;
    }
    if (
      (char === 'v' || char === 'V') &&
      (content.charAt(index + 1) === 's' || content.charAt(index + 1) === 'S') &&
      WHITESPACE.test(content.charAt(index - 1)) &&
      (previousIsAfterHash ||
        (previousChar === '#' && firstHorizontalSpace >= 0 && firstHorizontalSpace <= index - 2))
    ) {
      const spaceAt = content.charAt(index + 2) === '.' ? index + 3 : index + 2;
      if (WHITESPACE.test(content.charAt(spaceAt)) && lastNonTerminator > spaceAt) return true;
    }
    previousIsAfterHash = hashOnLine || hashCarriedToLine;
    previousChar = char;
    firstHorizontalSpace = -1;
    if (char === '#') hashOnLine = true;
  }
  return false;
}

export function detectCardType(content: string): CardType {
  if (!content || content.length < 40) return null;

  const lower = content.toLowerCase();

  const hasIngredients = /#\s*ingredients/i.test(content) || /\*\*ingredients\*\*/i.test(content);
  const hasInstructions =
    /#\s*(instructions|directions|steps|method|preparation)/i.test(content) ||
    /\*\*(instructions|directions|steps|method|preparation)\*\*/i.test(content);
  const hasRecipeSignals =
    (lower.includes('prep time') || lower.includes('cook time') || lower.includes('servings')) &&
    hasIngredients;
  if (hasIngredients && hasInstructions) return 'recipe';
  if (hasRecipeSignals) return 'recipe';

  const prose = withoutCodeFences(content);
  const hasCalcHeader = /#\s*(calculation|result|formula|equation|math)/i.test(prose);
  const hasCalcPattern =
    /(?:^|\n)[^\S\n\r\u2028\u2029]*(?:result|answer|total|sum|difference|product|quotient)\s*[:=]\s*[-\d.,]+/im.test(
      prose,
    ) ||
    hasEquationBetween(prose, '$$', '$$') ||
    hasInlineCodeArithmetic(prose) ||
    hasEquationBetween(prose, '\\[', '\\]');
  if (hasCalcHeader && hasCalcPattern) return 'calculation';
  const latexBlocks = prose.match(/\$\$[\s\S]+?\$\$/g);
  if (latexBlocks && latexBlocks.length >= 2 && hasCalcPattern) return 'calculation';

  const hasVsHeading = hasVsHeadingText(content);
  const hasComparisonTable = /\|.*\|.*\|/.test(content) && lower.includes('vs');
  const prosConsCount = (
    lower.match(/\b(pros?|cons?|advantages?|disadvantages?|strengths?|weaknesses?)\b/g) || []
  ).length;
  if (hasVsHeading) return 'comparison';
  if (hasComparisonTable) return 'comparison';
  if (prosConsCount >= 3 && (lower.includes(' vs ') || lower.includes(' versus ')))
    return 'comparison';

  const explicitSteps = content.match(/(?:^|\n)[^\S\n]*(?:#{1,4}\s*)?step\s+\d+\b/gi);
  const orderedLeadIns = content.match(/(?:^|\n)[^\S\n]*\d+\.\s+\*\*[^*\n]+\*\*/g);
  const hasProcedureHeading =
    /#\s*(guide|how to|tutorial|walkthrough|step-by-step|troubleshooting)/i.test(content);
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
