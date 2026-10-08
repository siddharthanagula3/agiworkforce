import { normalizeText } from '../retrieval/tokenize';

export const OUT_OF_SCOPE_CATEGORIES = [
  'pasted_code',
  'code',
  'homework',
  'writing',
  'translation',
  'rewriting',
  'general_knowledge',
  'role_play',
] as const;

export type OutOfScopeCategory = (typeof OUT_OF_SCOPE_CATEGORIES)[number];

interface ScopeRule {
  category: OutOfScopeCategory;
  pattern: RegExp;
  unless?: RegExp;
}

const LANGUAGES =
  '(?:python|javascript|js|typescript|java|c\\+\\+|rust|golang|ruby|php|swift|kotlin|sql|bash|powershell|html|css|react|matlab|haskell|scala|perl)';

const CODE_WORD = '(?<!agi )code(?! (?:tool|execution|interpreter|sandbox|mode))';

const CODE_ARTIFACT = `(?:${CODE_WORD}|script|function|algorithm|regex|regular expression|sql query|snippet|website|web ?page|landing page|web app|unit tests?|(?:react|vue|angular|svelte) component|linked list|binary (?:search|tree)|bubble sort|quick ?sort|merge sort|fizzbuzz|fibonacci|api endpoint|html|css)`;

const CODE_TO_AUTHOR = `(?:${CODE_ARTIFACT}|program|class|method|query|game|scraper|calculator)`;

const CODE_TO_REPAIR = `(?:${CODE_WORD}|script|function|program|method|query|regex|snippet|loop|algorithm)`;

const AUTHOR_VERBS = '(?:write|implement|code|program|develop)';

const PRODUCE_VERBS = '(?:generate|create|make|build)';

const SHORT_NOUN_PHRASE = '(?: me| us)?(?: [a-z0-9+]+){0,2}';

const PRODUCT_TERMS =
  /\b(?:agi|agiworkforce|sandbox|code tool|code execution|skills?|plugins?|connectors?|workspace|account|cli|extension|desktop app)\b/;

const SUPPORT_CONTEXT =
  /\b(?:agi|agiworkforce|account|login|log in|logging in|sign in|signing in|sign up|password|subscription|plan|workspace|settings?|sandbox|connectors?|api key|byok|desktop|extension|cli|app|usage|quota|skills?|plugins?|memory|projects?|chat|conversation|issue|error|tool)\b/;

const FEATURE_TALK =
  /\b(?:not working|missing|greyed|grayed|disabled|button|command|menu|option|settings?|feature|fails|failed|failing|error)\b/;

const LEAD_IN =
  /^(?:hey|hi|hello|ok|okay|so|now|then|and|also|just|please|pls|kindly|can you|could you|would you|will you|can u|i need you to|i want you to|i d like you to|i would like you to|help me to|help me|go ahead and|let s|lets)\s+/;

const REQUEST_RULES: readonly ScopeRule[] = Object.freeze([
  {
    category: 'code',
    pattern: new RegExp(`^${AUTHOR_VERBS}\\b.{0,60}\\b${CODE_TO_AUTHOR}\\b`),
  },
  {
    category: 'code',
    pattern: new RegExp(`^${PRODUCE_VERBS}${SHORT_NOUN_PHRASE} ${CODE_ARTIFACT}\\b`),
    unless: PRODUCT_TERMS,
  },
  {
    category: 'code',
    pattern: new RegExp(
      `^(?:give|show|send|get) (?:me|us)(?: [a-z0-9+]+){0,2} (?:${CODE_WORD}|script|function|regex|regular expression|sql query|snippet|algorithm)\\b`,
    ),
    unless: PRODUCT_TERMS,
  },
  {
    category: 'code',
    pattern: new RegExp(
      `^(?:${AUTHOR_VERBS}|${PRODUCE_VERBS})\\b.{0,80}\\b(?:in|using|with) ${LANGUAGES}(?![a-z0-9+])`,
    ),
  },
  {
    category: 'code',
    pattern: new RegExp(
      `^(?:fix|debug|refactor|optimi[sz]e|rewrite|convert|port|review|explain|complete|finish) (?:this|that|my|the|these|following|below|some|a|an)\\b.{0,40}\\b${CODE_TO_REPAIR}\\b`,
    ),
    unless: PRODUCT_TERMS,
  },
  { category: 'homework', pattern: /^solve\b/, unless: SUPPORT_CONTEXT },
  {
    category: 'writing',
    pattern:
      /^(?:write|compose|draft)\b.{0,40}\b(?:essay|poem|haiku|sonnet|limerick|story|song|lyrics|joke|speech|blog post|blog|letter|resume|cv|email|e mail|tweet|caption|slogan|novel|screenplay|rap|business plan|linkedin post|product description|thesis|love letter|birthday message|wedding toast|fan ?fiction)\b/,
  },
  {
    category: 'writing',
    pattern: new RegExp(
      `^${PRODUCE_VERBS}${SHORT_NOUN_PHRASE} (?:essay|poem|haiku|sonnet|limerick|story|song|lyrics|joke|blog post|cover letter|resume|cv|tweet|slogan|novel|screenplay|rap|business plan|linkedin post|thesis|love letter|fan ?fiction)\\b`,
    ),
  },
  {
    category: 'writing',
    pattern:
      /^(?:tell|give) (?:me|us) (?:a|an|another|some) (?:[a-z]+ )?(?:joke|story|poem|riddle|fun fact)\b/,
  },
  { category: 'translation', pattern: /^translate\b/ },
  {
    category: 'rewriting',
    pattern: /^(?:summari[sz]e|paraphrase|proofread|rephrase|reword|tl dr|tldr|condense)\b/,
  },
  {
    category: 'rewriting',
    pattern:
      /^(?:rewrite|edit|improve|correct|check|shorten)\b.{0,30}\b(?:this|the following|my) (?:essay|paragraph|sentence|grammar|cover letter|resume)\b/,
  },
  { category: 'role_play', pattern: /^act (?:as|like) (?:a|an|my|the|if you)\b/ },
]);

const ANYWHERE_RULES: readonly ScopeRule[] = Object.freeze([
  {
    category: 'code',
    pattern: new RegExp(
      `\\bhow (?:do|can|would|should|to)\\b(?: (?:i|you|we|one))? (?:write|implement|code|reverse|sort|parse|iterate|loop|declare|define|center|centre|concatenate|merge|split|read|open|create|make|convert|print)\\b.{0,60}\\b(?:in|using|with) ${LANGUAGES}(?![a-z0-9+])`,
    ),
    unless: PRODUCT_TERMS,
  },
  {
    category: 'code',
    pattern: new RegExp(
      `\\b${LANGUAGES} (?:one liner|script|snippet|function|query) (?:to|that|for|which)\\b`,
    ),
    unless: PRODUCT_TERMS,
  },
  {
    category: 'homework',
    pattern:
      /\b(?:homework|math problem|maths problem|word problem|leetcode|hackerrank|codewars|project euler)\b/,
  },
  {
    category: 'homework',
    pattern:
      /\b\d+(?: degrees?)? (?:fahrenheit|celsius|kilomet(?:er|re)s?|miles|pounds|kilograms?|inches|centimet(?:er|re)s?) (?:to|in|into) (?:fahrenheit|celsius|kilomet(?:er|re)s?|miles|pounds|kilograms?|inches|centimet(?:er|re)s?)\b/,
  },
  {
    category: 'homework',
    pattern:
      /\b(?:derivative|integral|antiderivative|square root|factorial|prime factors?) of\b|\bsolve for [a-z]\b/,
  },
  {
    category: 'translation',
    pattern: /\bhow (?:do|would|can) (?:you|i|we) say\b.{1,80}\bin [a-z]+/,
  },
  {
    category: 'general_knowledge',
    pattern:
      /\b(?:capital|president|prime minister|population|currency|national anthem) of\b|\bweather (?:in|for|today|tomorrow|forecast)\b|\bwho (?:invented|discovered|wrote|painted|composed|directed|won the)\b/,
    unless: SUPPORT_CONTEXT,
  },
  {
    category: 'general_knowledge',
    pattern: /\brecipe for\b|\bhow (?:do i|to|do you|can i) (?:cook|bake|boil|fry|grill|roast)\b/,
    unless: SUPPORT_CONTEXT,
  },
  {
    category: 'general_knowledge',
    pattern:
      /\bshould i (?:break up|quit my job|invest in|text (?:him|her)|ask (?:him|her) out|marry)\b|\b(?:relationship|dating) advice\b|\b(?:workout|exercise|diet|meal) (?:plan|routine)\b|\bhoroscope\b|\bmeaning of life\b/,
  },
  {
    category: 'role_play',
    pattern: /\bpretend (?:to be|you are|you re|that you)\b|\brole ?play(?:ing)?\b/,
  },
]);

const ARITHMETIC =
  /\b(?:what(?:'s| is)|whats|calculate|compute|evaluate|simplify|how much is)\s+(?!24\s*\/\s*7\b)\(?-?\d[\d,.]*\s*(?:[-+*/x×÷^]|plus|minus|times|divided by|multiplied by|to the power of|mod|(?:%|percent) of)\s*\(?-?\d/;

const FENCED_BLOCK = /(?:```|~~~)([^\n`~]*)\n?([\s\S]*?)(?:```|~~~)/g;

const FENCE_LANGUAGE_TAG =
  /^(?:python|py|javascript|js|jsx|typescript|ts|tsx|java|c|cpp|c\+\+|csharp|cs|go|golang|rust|ruby|rb|php|swift|kotlin|sql|html|css|scala|perl|lua|dart)$/;

const CODE_LINE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^(?:def|class)\s+\w+.*:\s*$/,
  /^import\s+[\w.{}*, ]+(?:\s+from\s+\S+)?;?$/,
  /^from\s+[\w.]+\s+import\b/,
  /^(?:export\s+)?(?:async\s+)?function\b.*\{\s*$/,
  /^(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::\s*[\w<>[\], |]+)?\s*=/,
  /^(?:for|while|if|else if|elif|switch)\b.*\(.*(?:\{|:)\s*$/,
  /^(?:print|printf|println|echo|console\.\w+|System\.out\.println)\s*\(/,
  /^return\b.+/,
  /^#include\s*[<"]/,
  /^(?:public|private|protected)\s+(?:static\s+)?[\w<>[\]]+\s+\w+\s*\(/,
  /^(?:fn|func)\s+\w+\s*\(/,
  /^(?:select\b.+\bfrom\b|insert\s+into\b|update\b.+\bset\b|create\s+table\b)/i,
  /^<\/?[a-z][\w-]*(?:\s[^>]*)?>/i,
  /^.*[=(].*;\s*$/,
]);

const MIN_CODE_LINES = 3;
const MIN_FENCED_CODE_LINES = 2;
const MIN_CODE_SHARE = 0.5;

function codeLineCount(lines: readonly string[]): number {
  let count = 0;
  for (const line of lines) {
    if (CODE_LINE_PATTERNS.some((pattern) => pattern.test(line))) count += 1;
  }
  return count;
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isMostlyCode(raw: string): boolean {
  const text = raw.trim();
  if (text.length === 0) return false;

  let fencedChars = 0;
  let fencedLooksLikeCode = false;
  for (const block of text.matchAll(FENCED_BLOCK)) {
    fencedChars += block[0].length;
    const tag = (block[1] ?? '').trim();
    const body = nonEmptyLines(block[2] ?? '');
    if (FENCE_LANGUAGE_TAG.test(tag) || codeLineCount(body) >= MIN_FENCED_CODE_LINES) {
      fencedLooksLikeCode = true;
    }
  }
  if (fencedLooksLikeCode && fencedChars / text.length >= MIN_CODE_SHARE) return true;

  const lines = nonEmptyLines(text);
  if (lines.length < MIN_CODE_LINES) return false;
  const codeLines = codeLineCount(lines);
  return codeLines >= MIN_CODE_LINES && codeLines / lines.length >= MIN_CODE_SHARE;
}

function prepare(text: string): string {
  return text
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadIn(clause: string): string {
  let request = clause;
  for (;;) {
    const stripped = request.replace(LEAD_IN, '');
    if (stripped === request) return request;
    request = stripped;
  }
}

function firstMatch(rules: readonly ScopeRule[], subject: string): OutOfScopeCategory | null {
  for (const rule of rules) {
    if (!rule.pattern.test(subject)) continue;
    if (rule.unless?.test(subject)) continue;
    return rule.category;
  }
  return null;
}

/**
 * Names the kind of general task a message is plainly asking for, or null.
 *
 * Deliberately narrow: a miss costs nothing, because the relevance floor and
 * the post-answer checks still refuse an unrelated request, while a false match
 * turns a real customer away with no human offered.
 */
export function classifyOutOfScope(text: string): OutOfScopeCategory | null {
  if (!text || text.trim().length === 0) return null;
  const normalized = normalizeText(text);

  if (isMostlyCode(normalized)) return 'pasted_code';

  const clauses = normalized
    .split(/[.!?;:\n]+/)
    .map(prepare)
    .filter((clause) => clause.length > 0);

  for (const clause of clauses) {
    if (FEATURE_TALK.test(clause)) continue;
    const category = firstMatch(REQUEST_RULES, stripLeadIn(clause));
    if (category) return category;
  }

  if (ARITHMETIC.test(normalized)) return 'homework';

  return firstMatch(ANYWHERE_RULES, prepare(normalized));
}

export const OUT_OF_SCOPE_COPY =
  "I can only help with AGI Workforce: your account, plans, features, and fixing problems with the product. I can't help with other tasks here.";
