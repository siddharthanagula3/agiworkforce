import { basename, dirname, resolve, sep } from 'node:path';

import type { Skill } from './types';

export const PRODUCT_SKILL_AUDIENCE = 'product';
export const DEVELOPER_SKILL_AUDIENCE = 'developer';

export type SkillAudience = typeof PRODUCT_SKILL_AUDIENCE | typeof DEVELOPER_SKILL_AUDIENCE;

export const SKILL_AUDIENCES: readonly SkillAudience[] = [
  PRODUCT_SKILL_AUDIENCE,
  DEVELOPER_SKILL_AUDIENCE,
];

export const SKILL_MANIFEST_FILE_NAME = 'skills-lock.json';

const SKILL_PACKAGE_FILE_NAME = 'SKILL.md';
const MARKDOWN_EXTENSION = /\.md$/i;
const MANIFEST_SKILLS_KEY = 'skills';
const MANIFEST_AUDIENCE_KEY = 'audience';

export type SkillAudienceManifest = ReadonlyMap<string, SkillAudience>;

function isSkillAudience(value: unknown): value is SkillAudience {
  return SKILL_AUDIENCES.includes(value as SkillAudience);
}

function manifestEntries(parsed: unknown): Array<[string, unknown]> {
  if (!parsed || typeof parsed !== 'object') return [];
  const skills = (parsed as Record<string, unknown>)[MANIFEST_SKILLS_KEY];
  if (!skills || typeof skills !== 'object') return [];
  return Object.entries(skills as Record<string, unknown>);
}

export function parseSkillAudienceManifest(raw: string): SkillAudienceManifest {
  const audiences = new Map<string, SkillAudience>();
  for (const [id, entry] of manifestEntries(JSON.parse(raw))) {
    if (!entry || typeof entry !== 'object') continue;
    const declared = (entry as Record<string, unknown>)[MANIFEST_AUDIENCE_KEY];
    if (isSkillAudience(declared)) audiences.set(id, declared);
  }
  return audiences;
}

export function skillManifestId(skill: Skill): string {
  const fileName = basename(skill.filePath);
  return fileName.toLowerCase() === SKILL_PACKAGE_FILE_NAME.toLowerCase()
    ? basename(dirname(skill.filePath))
    : fileName.replace(MARKDOWN_EXTENSION, '');
}

export function skillAudience(skill: Skill, manifest: SkillAudienceManifest): SkillAudience {
  return manifest.get(skillManifestId(skill)) ?? DEVELOPER_SKILL_AUDIENCE;
}

function isInsideRoot(root: string, filePath: string): boolean {
  return resolve(filePath).startsWith(`${resolve(root)}${sep}`);
}

export function filterSkillsForProductAudience(
  skills: readonly Skill[],
  manifest: SkillAudienceManifest,
  manifestRoot: string,
): Skill[] {
  return skills.filter(
    (skill) =>
      !isInsideRoot(manifestRoot, skill.filePath) ||
      skillAudience(skill, manifest) === PRODUCT_SKILL_AUDIENCE,
  );
}
