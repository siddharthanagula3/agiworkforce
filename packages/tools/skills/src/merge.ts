
import type { Skill, SkillSource } from './types';

const PRECEDENCE: Record<SkillSource, number> = {
  bundled: 0,
  'managed-local': 1,
  personal: 2,
  project: 3,
  workspace: 4,
  extra: 5,
};

function skillKey(skill: Skill): string {
  return skill.metadata.skillKey ?? skill.name;
}

export function mergeSkills(layers: Skill[][]): Skill[] {
  const byKey = new Map<string, Skill>();
  for (const layer of layers) {
    for (const skill of layer) {
      const key = skillKey(skill);
      const existing = byKey.get(key);
      if (!existing || PRECEDENCE[skill.source] >= PRECEDENCE[existing.source]) {
        byKey.set(key, skill);
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}
