import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { Skill } from '@agiworkforce/skills';

import { createError } from '@/lib/errors';
import { filterSkillsByInstallOverrides } from './skill-catalog-service';
import { serializeUserSettings } from './user-settings-payload';

export const SKILL_SETTINGS_NAMESPACE = 'skills';
const SKILL_INSTALLS_KEY = 'installs';

interface UserSettingsRow {
  settings: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractInstallOverrides(settings: Record<string, unknown>): Map<string, boolean> {
  const overrides = new Map<string, boolean>();
  const namespace = settings[SKILL_SETTINGS_NAMESPACE];
  if (!isRecord(namespace)) return overrides;
  const installs = namespace[SKILL_INSTALLS_KEY];
  if (!isRecord(installs)) return overrides;
  for (const [name, value] of Object.entries(installs)) {
    if (typeof value === 'boolean') overrides.set(name, value);
  }
  return overrides;
}

async function readUserSettings(
  db: DatabaseAdapter,
  userId: string,
): Promise<Record<string, unknown>> {
  const rows = await db.query<UserSettingsRow>(
    'select settings from public.user_settings where user_id = $1 limit 1',
    [userId],
  );
  return rows[0]?.settings ?? {};
}

export async function getSkillInstallOverrides(
  db: DatabaseAdapter,
  userId: string,
): Promise<ReadonlyMap<string, boolean>> {
  return extractInstallOverrides(await readUserSettings(db, userId));
}

async function readLockedUserSettings(
  db: DatabaseAdapter,
  userId: string,
): Promise<UserSettingsRow | null> {
  const [row] = await db.query<UserSettingsRow>(
    'select settings from public.user_settings where user_id = $1 for update',
    [userId],
  );
  return row ?? null;
}

function settingsWithInstallOverride(
  settings: Record<string, unknown>,
  skillName: string,
  installed: boolean,
): Record<string, unknown> {
  const namespace = isRecord(settings[SKILL_SETTINGS_NAMESPACE])
    ? (settings[SKILL_SETTINGS_NAMESPACE] as Record<string, unknown>)
    : {};
  const installs = isRecord(namespace[SKILL_INSTALLS_KEY])
    ? (namespace[SKILL_INSTALLS_KEY] as Record<string, unknown>)
    : {};
  return {
    ...settings,
    [SKILL_SETTINGS_NAMESPACE]: {
      ...namespace,
      [SKILL_INSTALLS_KEY]: { ...installs, [skillName]: installed },
    },
  };
}

function storedInstallOverrides(row: UserSettingsRow | undefined): ReadonlyMap<string, boolean> {
  if (!row || !isRecord(row.settings)) {
    throw createError.internal('Settings were not returned after saving');
  }
  return extractInstallOverrides(row.settings);
}

export async function setSkillInstallOverride(
  db: DatabaseAdapter,
  userId: string,
  skillName: string,
  installed: boolean,
): Promise<ReadonlyMap<string, boolean>> {
  return db.transaction(async (tx) => {
    let current = await readLockedUserSettings(tx, userId);
    if (!current) {
      const initial = settingsWithInstallOverride({}, skillName, installed);
      const [inserted] = await tx.query<UserSettingsRow>(
        `insert into public.user_settings (user_id, settings, updated_at)
         values ($1, $2::jsonb, timezone('utc'::text, now()))
         on conflict (user_id) do nothing
         returning settings`,
        [userId, serializeUserSettings(initial)],
      );
      if (inserted) return storedInstallOverrides(inserted);
      current = await readLockedUserSettings(tx, userId);
      if (!current) throw createError.internal('Settings row could not be locked');
    }

    const nextSettings = settingsWithInstallOverride(current.settings ?? {}, skillName, installed);
    const [row] = await tx.query<UserSettingsRow>(
      `update public.user_settings
       set settings = $2::jsonb, updated_at = timezone('utc'::text, now())
       where user_id = $1
       returning settings`,
      [userId, serializeUserSettings(nextSettings)],
    );
    return storedInstallOverrides(row);
  });
}

export async function resolveInstalledManagedSkills(
  db: DatabaseAdapter,
  userId: string,
  catalog: readonly Skill[],
): Promise<Skill[]> {
  const overrides = await getSkillInstallOverrides(db, userId);
  return filterSkillsByInstallOverrides(catalog, overrides);
}

export async function resolveInstalledManagedSkillNames(
  db: DatabaseAdapter,
  userId: string,
  catalog: readonly Skill[],
): Promise<string[]> {
  return (await resolveInstalledManagedSkills(db, userId, catalog)).map((skill) => skill.name);
}
