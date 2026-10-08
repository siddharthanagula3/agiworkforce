import { matchSkillsForPrompt, skillCatalogEntryLength, type Skill } from '@agiworkforce/skills';

import { isPluginOwnedSkill } from '@/lib/services/skill-catalog-service';

/**
 * Characters of catalog entries the always-listed skills may spend on a turn,
 * about 2,000 tokens. A skill past it is not dropped; it competes in the
 * relevance match with the built-in catalog instead.
 */
export const ALWAYS_LISTED_SKILL_CHARACTER_BUDGET = 8_000;

const PERSONAL_SKILL_SOURCE = 'personal' satisfies Skill['source'];

function alwaysListedRank(skill: Skill): number | null {
  if (skill.source === PERSONAL_SKILL_SOURCE) return 0;
  if (isPluginOwnedSkill(skill)) return 1;
  return null;
}

export function selectOfferedSkills(catalog: readonly Skill[], prompt: string): Skill[] {
  const candidates = catalog
    .map((skill, index) => ({ skill, index, rank: alwaysListedRank(skill) }))
    .filter((entry): entry is { skill: Skill; index: number; rank: number } => entry.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index);

  const listed = new Set<Skill>();
  let remaining = ALWAYS_LISTED_SKILL_CHARACTER_BUDGET;
  for (const { skill } of candidates) {
    const cost = skillCatalogEntryLength(skill);
    if (cost > remaining) continue;
    listed.add(skill);
    remaining -= cost;
  }

  const matched = matchSkillsForPrompt(
    catalog.filter((skill) => !listed.has(skill)),
    prompt,
  ).map((match) => match.skill);
  return [...listed, ...matched];
}
