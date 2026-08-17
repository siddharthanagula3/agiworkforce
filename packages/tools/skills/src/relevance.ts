import type { Skill } from './types';

export const DEFAULT_SKILL_RELEVANCE_MINIMUM_SCORE = 0.15;
export const DEFAULT_SKILL_RELEVANCE_LIMIT = 3;
const SKILL_NAME_MENTION_BOOST = 0.3;
const MAX_MATCHED_KEYWORDS = 5;

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'it',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'not',
  'with',
  'from',
  'by',
  'as',
  'this',
  'that',
  'be',
  'are',
  'was',
  'were',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'i',
  'me',
  'my',
  'you',
  'your',
  'we',
  'our',
  'they',
  'them',
  'their',
  'he',
  'she',
  'his',
  'her',
  'its',
  'what',
  'which',
  'who',
  'how',
  'when',
  'where',
  'why',
  'so',
  'if',
  'then',
  'just',
  'also',
  'about',
  'up',
  'out',
  'no',
  'yes',
]);

const SEPARATORS = /[\s!-/:-@[-`{-~]+/;

export interface SkillRelevanceMatch {
  skill: Skill;
  score: number;
  matchedKeywords: string[];
}

export interface MatchSkillsForPromptOptions {
  minimumScore?: number;
  limit?: number;
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of text.toLowerCase().split(SEPARATORS)) {
    if (word.length > 1 && !STOPWORDS.has(word)) tokens.add(word);
  }
  return tokens;
}

function jaccardSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function matchSkillsForPrompt(
  skills: readonly Skill[],
  prompt: string,
  options: MatchSkillsForPromptOptions = {},
): SkillRelevanceMatch[] {
  const promptTokens = tokenize(prompt);
  if (promptTokens.size === 0) return [];

  const minimumScore = options.minimumScore ?? DEFAULT_SKILL_RELEVANCE_MINIMUM_SCORE;
  const limit = options.limit ?? DEFAULT_SKILL_RELEVANCE_LIMIT;
  if (limit <= 0) return [];

  const promptLower = prompt.toLowerCase();
  const seen = new Set<string>();
  const matches: SkillRelevanceMatch[] = [];

  for (const skill of skills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);

    const skillTokens = tokenize(`${skill.name} ${skill.description}`);
    if (skillTokens.size === 0) continue;

    let score = jaccardSimilarity(promptTokens, skillTokens);
    if (promptLower.includes(skill.name.toLowerCase())) score += SKILL_NAME_MENTION_BOOST;
    if (score <= minimumScore) continue;

    const matchedKeywords = [...promptTokens]
      .filter((token) => skillTokens.has(token))
      .sort()
      .slice(0, MAX_MATCHED_KEYWORDS);

    matches.push({ skill, score, matchedKeywords });
  }

  matches.sort((left, right) =>
    right.score === left.score
      ? left.skill.name.localeCompare(right.skill.name)
      : right.score - left.score,
  );
  return matches.slice(0, limit);
}
