/**
 * Skill precedence resolver.
 *
 * Mirrors OpenClaw's resolution order (highest wins):
 *
 *   `extra` > `workspace` > `project` > `personal` > `managed-local` > `bundled`
 *
 * When two layers expose a skill with the same `name` (or `metadata.skillKey`),
 * the higher-precedence one wins; the lower-precedence one is dropped.
 *
 * Pure function — pass arrays of skills (already loaded by the loader).
 */

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

/**
 * Merge multiple skill arrays by precedence. Later wins on key collision.
 * Returns a flat de-duplicated array sorted by name (stable for prompt output).
 */
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
