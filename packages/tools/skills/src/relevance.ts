import type { Skill } from './types';

export const DEFAULT_SKILL_RELEVANCE_MINIMUM_SCORE = 0.15;
export const DEFAULT_SKILL_RELEVANCE_LIMIT = 3;
const SKILL_NAME_MENTION_BOOST = 0.3;
/**
 * One shared word is coincidence, not topicality: "…for this release" overlaps
 * a changelog skill on `release` alone and means nothing by it. Requiring two
 * distinct matched tokens keeps coverage permissive about prompt length while
 * still refusing a single-word accident. Skills whose whole vocabulary is one
 * token can still match on it.
 */
const MIN_MATCHED_TOKENS = 2;
const COVERAGE_DENOMINATOR_CAP = 12;
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

/**
 * How much of the SKILL's vocabulary the prompt covers.
 *
 * This replaced Jaccard, which is symmetric and therefore put every prompt word
 * in the denominator: a longer, more specific request scored LOWER than a terse
 * one, and real questions landed under the threshold almost every time
 * ("which channel converted best?" against data-analysis scored 0.000).
 *
 * Relevance here is directional — the question is whether the prompt is about
 * what the skill covers, not whether the two texts are the same size. Dividing
 * by the skill's own token count answers that and leaves prompt length alone.
 */
function skillCoverage(promptTokens: ReadonlySet<string>, skillTokens: ReadonlySet<string>): number {
  if (skillTokens.size === 0) return 0;
  let matched = 0;
  for (const token of skillTokens) {
    if (promptTokens.has(token)) matched += 1;
  }
  // Cap the denominator, or a thorough description scores WORSE than a terse
  // one: an author who lists the words users actually type ("crashing",
  // "erroring", "intermittently") would dilute their own score with every term
  // added, which punishes exactly the behaviour the skill-authoring guidance
  // asks for. Past the cap, relevance grows with matched evidence instead.
  return matched / Math.min(skillTokens.size, COVERAGE_DENOMINATOR_CAP);
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

    const matched = [...promptTokens].filter((token) => skillTokens.has(token)).sort();
    const namedExplicitly = promptLower.includes(skill.name.toLowerCase());
    if (!namedExplicitly && matched.length < Math.min(MIN_MATCHED_TOKENS, skillTokens.size)) {
      continue;
    }

    let score = skillCoverage(promptTokens, skillTokens);
    if (namedExplicitly) score += SKILL_NAME_MENTION_BOOST;
    if (score <= minimumScore) continue;

    const matchedKeywords = matched.slice(0, MAX_MATCHED_KEYWORDS);

    matches.push({ skill, score, matchedKeywords });
  }

  matches.sort((left, right) =>
    right.score === left.score
      ? left.skill.name.localeCompare(right.skill.name)
      : right.score - left.score,
  );
  return matches.slice(0, limit);
}
