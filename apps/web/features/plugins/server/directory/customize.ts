import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SKILL_DRAFT_DESCRIPTION_MAX_LENGTH,
  SKILL_DRAFT_NAME_MAX_LENGTH,
  buildSkillMarkdown,
  validateSkillDraft,
  type SkillDraft,
  type SkillWithFileAccess,
} from '@agiworkforce/skills';

import { setWebPluginEnabled } from '@/lib/services/plugin-installation-service';
import { setMarketplaceInstallationEnabled } from '@/lib/services/plugin-marketplace-installation-service';
import { getMarketplaceEntryForUser } from '@/lib/services/plugin-marketplace-service';
import {
  findOwnedPluginEntryByKey,
  storeOwnedPluginSource,
  type OwnedPluginSkill,
} from '@/lib/services/plugin-owned-source-service';
import { getPluginRegistryEntry } from '@/lib/services/plugin-registry-service';
import { listManagedPluginSkillsWithFiles } from '@/lib/services/skill-catalog-service';
import { pluginKeyFrom } from './archive';
import {
  CLAUDE_PLUGIN_SKILLS_DIRECTORY,
  CLAUDE_SKILL_FILE_NAME,
  PLUGIN_DIRECTORY_FALLBACK_VERSION,
  SKILL_COMPANION_MAX_FILES,
} from './constants';
import { listInstalledPluginSkillsWithFiles } from './installed-skills';
import { findPluginDirectoryRecord } from './memory-cache';

const SOURCE_KIND_AUTHORED = 'authored';
const CUSTOM_KEY_SUFFIX = '-custom';
const CUSTOM_SOURCE_SUFFIX = ' (custom)';
const UNSAFE_SKILL_NAME = /[^a-z0-9-]+/g;
const SKILL_NAME_EDGES = /^-+|-+$/g;
const WHITESPACE_RUN = /\s+/g;
const NO_SKILLS_MESSAGE = 'This plugin has no skills that can be copied.';

export type CustomizeTarget = { entryId: string } | { pluginId: string };

export type CustomizeResult =
  | { status: 'created' | 'existing'; entryId: string; name: string }
  | { status: 'missing' }
  | { status: 'invalid'; message: string };

interface CustomizableOriginal {
  key: string;
  name: string;
  description: string;
  skills: SkillWithFileAccess[];
  turnOff: () => Promise<unknown>;
}

async function marketplaceInstallationId(
  db: DatabaseAdapter,
  userId: string,
  match: { entryId: string } | { pluginKey: string },
): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    'entryId' in match
      ? `select installation.id
           from public.plugin_marketplace_installations installation
          where installation.user_id = $1 and installation.entry_id = $2`
      : `select installation.id
           from public.plugin_marketplace_installations installation
           join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
          where installation.user_id = $1 and entries.plugin_key = $2`,
    [userId, 'entryId' in match ? match.entryId : match.pluginKey],
  );
  return rows[0]?.id ?? null;
}

async function turnOffMarketplaceInstallation(
  db: DatabaseAdapter,
  userId: string,
  match: { entryId: string } | { pluginKey: string },
): Promise<void> {
  const installationId = await marketplaceInstallationId(db, userId, match);
  if (installationId) await setMarketplaceInstallationEnabled(db, userId, installationId, false);
}

async function resolveOriginal(
  db: DatabaseAdapter,
  userId: string,
  target: CustomizeTarget,
): Promise<CustomizableOriginal | null> {
  if ('entryId' in target) {
    const entry = await getMarketplaceEntryForUser(db, userId, target.entryId);
    if (!entry) return null;
    return {
      key: entry.pluginKey,
      name: entry.name,
      description: entry.description,
      skills: await listInstalledPluginSkillsWithFiles(db, userId, { entryId: entry.id }),
      turnOff: () => turnOffMarketplaceInstallation(db, userId, { entryId: entry.id }),
    };
  }
  const registry = await getPluginRegistryEntry(db, target.pluginId);
  if (registry) {
    return {
      key: registry.entry.id,
      name: registry.entry.name,
      description: registry.entry.description,
      skills: await listManagedPluginSkillsWithFiles(registry.entry.id),
      turnOff: () => setWebPluginEnabled(db, userId, registry.entry.id, false),
    };
  }
  const record = await findPluginDirectoryRecord(target.pluginId);
  if (!record) return null;
  return {
    key: record.id,
    name: record.name,
    description: record.description,
    skills: await listInstalledPluginSkillsWithFiles(db, userId, { pluginKey: record.id }),
    turnOff: () => turnOffMarketplaceInstallation(db, userId, { pluginKey: record.id }),
  };
}

function editableDraft({ skill }: SkillWithFileAccess): SkillDraft {
  const name = skill.name
    .trim()
    .toLowerCase()
    .replace(UNSAFE_SKILL_NAME, '-')
    .replace(SKILL_NAME_EDGES, '')
    .slice(0, SKILL_DRAFT_NAME_MAX_LENGTH);
  const description = skill.description
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .slice(0, SKILL_DRAFT_DESCRIPTION_MAX_LENGTH);
  return { name, description: description || name, body: skill.body };
}

async function copiedSkill(
  original: SkillWithFileAccess,
  draft: SkillDraft,
): Promise<OwnedPluginSkill> {
  const folder = `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}/${draft.name}`;
  const listed = await original.access.listFiles(original.skill);
  const files: Array<{ path: string; content: string }> = [];
  for (const file of listed.slice(0, SKILL_COMPANION_MAX_FILES)) {
    const read = await original.access.readFile(original.skill, file.path);
    if (read.ok) files.push({ path: `${folder}/${read.path}`, content: read.content });
  }
  return {
    name: draft.name,
    path: `${folder}/${CLAUDE_SKILL_FILE_NAME}`,
    content: buildSkillMarkdown(draft),
    files,
  };
}

export async function customizePlugin(
  db: DatabaseAdapter,
  userId: string,
  target: CustomizeTarget,
): Promise<CustomizeResult> {
  const original = await resolveOriginal(db, userId, target);
  if (!original) return { status: 'missing' };
  if (original.skills.length === 0) return { status: 'invalid', message: NO_SKILLS_MESSAGE };
  const key = pluginKeyFrom(`${original.key}${CUSTOM_KEY_SUFFIX}`);
  if (!key) return { status: 'missing' };

  const existing = await findOwnedPluginEntryByKey(db, userId, SOURCE_KIND_AUTHORED, key);
  if (existing) return { status: 'existing', entryId: existing, name: original.name };

  const skills: OwnedPluginSkill[] = [];
  const seen = new Set<string>();
  for (const candidate of original.skills) {
    const draft = editableDraft(candidate);
    const validation = validateSkillDraft(draft);
    if (!validation.ok) {
      return {
        status: 'invalid',
        message: `The ${candidate.skill.name} skill cannot be copied: ${validation.errors.join(' ')}`,
      };
    }
    if (seen.has(draft.name)) continue;
    seen.add(draft.name);
    skills.push(await copiedSkill(candidate, draft));
  }

  const [stored] = await storeOwnedPluginSource(db, userId, {
    kind: SOURCE_KIND_AUTHORED,
    sourceName: `${original.name}${CUSTOM_SOURCE_SUFFIX}`,
    plugins: [
      {
        key,
        name: original.name,
        description: original.description || original.name,
        version: PLUGIN_DIRECTORY_FALLBACK_VERSION,
        skills,
      },
    ],
  });
  if (!stored) return { status: 'missing' };
  await original.turnOff();
  return { status: 'created', entryId: stored.entryId, name: original.name };
}
