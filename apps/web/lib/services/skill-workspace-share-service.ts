import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { buildSkillMarkdown } from '@agiworkforce/skills/validation';

import { createError } from '@/lib/errors';
import { pluginKeyFrom } from '@/features/plugins/server/directory/archive';
import { CLAUDE_PLUGIN_SKILLS_DIRECTORY } from '@/features/plugins/server/directory/constants';
import { displayVersion } from '@/features/plugins/server/directory/entries';
import type { OwnedPluginInput } from '@/lib/services/plugin-owned-source-service';
import { findUserSkillByName, findUserSkillWithFiles } from '@/lib/services/user-skill-service';

const SKILL_FILE_NAME = 'SKILL.md';

export async function personalSkillAsWorkspacePlugin(
  db: DatabaseAdapter,
  userId: string,
  name: string,
): Promise<OwnedPluginInput> {
  const [record, withFiles] = await Promise.all([
    findUserSkillByName(db, userId, name),
    findUserSkillWithFiles(db, userId, name),
  ]);
  if (!record || !withFiles) throw createError.notFound('Skill not found');
  const key = pluginKeyFrom(record.name);
  if (!key)
    throw createError.validation('This skill’s name cannot be used for a workspace plugin.');
  const folder = `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}/${key}`;
  const inventory = await withFiles.access.listFiles(withFiles.skill);
  const files = [];
  for (const entry of inventory) {
    const read = await withFiles.access.readFile(withFiles.skill, entry.path);
    if (!read.ok) {
      throw createError.validation(`${entry.path} could not be read, so the skill was not shared.`);
    }
    files.push({ path: `${folder}/${read.path}`, content: read.content });
  }
  return {
    key,
    name: record.name,
    description: record.description,
    version: displayVersion(null, null),
    skills: [
      {
        name: record.name,
        path: `${folder}/${SKILL_FILE_NAME}`,
        content: buildSkillMarkdown({
          name: record.name,
          description: record.description,
          body: record.body,
        }),
        files,
      },
    ],
  };
}
