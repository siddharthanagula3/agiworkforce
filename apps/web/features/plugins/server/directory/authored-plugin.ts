import 'server-only';

import { z } from 'zod';
import { buildSkillMarkdown, validateSkillDraft } from '@agiworkforce/skills';
import { PluginMarketplaceDependencySchema } from '@agiworkforce/cloud-contracts';

import { SkillDraftBodySchema } from '@/app/api/skills/skill-draft-schema';
import type { OwnedPluginSkill } from '@/lib/services/plugin-owned-source-service';
import {
  CLAUDE_PLUGIN_SKILLS_DIRECTORY,
  CLAUDE_SKILL_FILE_NAME,
  PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL,
  PLUGIN_UPLOAD_MAX_PATH_CHARS,
} from './constants';

export const AUTHORED_PLUGIN_INVALID_CODE = 'PLUGIN_DRAFT_INVALID';
export const AUTHORED_PLUGIN_INVALID_MESSAGE =
  'Give the plugin a name, a description and at least one skill.';
const DUPLICATE_SKILL_MESSAGE = 'Each skill in a plugin needs its own name.';

const AuthoredSkillSchema = SkillDraftBodySchema.extend({
  path: z.string().trim().min(1).max(PLUGIN_UPLOAD_MAX_PATH_CHARS).optional(),
});

export const AuthoredPluginBodySchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    skills: z.array(AuthoredSkillSchema).min(1).max(PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL),
    dependencies: z.array(PluginMarketplaceDependencySchema).optional(),
  })
  .strict();

export const AuthoredPluginEditBodySchema = AuthoredPluginBodySchema.omit({ dependencies: true });

export type AuthoredPluginBody = z.infer<typeof AuthoredPluginBodySchema>;

export function authoredSkillPath(skillName: string): string {
  return `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}/${skillName}/${CLAUDE_SKILL_FILE_NAME}`;
}

export function authoredSkillIssues(skills: AuthoredPluginBody['skills']): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const skill of skills) {
    const validation = validateSkillDraft(skill);
    if (!validation.ok) {
      issues.push(...validation.errors);
      continue;
    }
    if (seen.has(skill.name)) {
      issues.push(DUPLICATE_SKILL_MESSAGE);
      continue;
    }
    seen.add(skill.name);
  }
  return issues;
}

export function authoredSkillFiles(skills: AuthoredPluginBody['skills']): OwnedPluginSkill[] {
  return skills.map((skill) => ({
    name: skill.name,
    path: authoredSkillPath(skill.name),
    content: buildSkillMarkdown(skill),
  }));
}
