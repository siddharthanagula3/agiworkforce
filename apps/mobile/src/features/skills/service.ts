import { FEATURES } from '@/lib/v1FeatureFlags';
import { ApiHttpError, api } from '@/services/api';
import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSource,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';

export type { ManagedSkillSource, ManagedSkillSummary } from '@agiworkforce/cloud-contracts';

const SKILLS_PATH = '/api/skills';
const SKILL_CATALOG_PATH = `${SKILLS_PATH}?catalog=all`;
const SKILL_INSTALLS_PATH = `${SKILLS_PATH}/installs`;
const AUTHORED_SOURCES: ReadonlySet<ManagedSkillSource> = new Set([
  'personal',
  'project',
  'workspace',
]);
const PLUGIN_SOURCE: ManagedSkillSource = 'extra';
const SKILL_INSTALL_FAILED_COPY = 'Could not install this skill. Try again.';
const SKILL_UNINSTALL_FAILED_COPY = 'Could not remove this skill. Try again.';

export function parseManagedSkillsResponse(value: unknown): ManagedSkillSummary[] {
  const parsed = ManagedSkillsResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Skills returned an invalid response.');
  }
  return parsed.data.skills;
}

export function parseInstalledSkillNames(value: unknown): Set<string> {
  const installed = (value as { installed?: unknown } | null)?.installed;
  if (!Array.isArray(installed) || !installed.every((name) => typeof name === 'string')) {
    throw new Error('Skills returned an invalid response.');
  }
  return new Set(installed);
}

function assertSkillsAvailable(): void {
  if (!FEATURES.skills) {
    throw new Error('Skills are not available on Mobile.');
  }
}

export async function fetchManagedSkills(signal?: AbortSignal): Promise<ManagedSkillSummary[]> {
  assertSkillsAvailable();
  const response = await api.get<unknown>(SKILLS_PATH, { signal });
  return parseManagedSkillsResponse(response);
}

export async function fetchSkillCatalog(signal?: AbortSignal): Promise<ManagedSkillSummary[]> {
  assertSkillsAvailable();
  const response = await api.get<unknown>(SKILL_CATALOG_PATH, { signal });
  return parseManagedSkillsResponse(response);
}

export async function fetchInstalledSkillNames(signal?: AbortSignal): Promise<Set<string>> {
  assertSkillsAvailable();
  const response = await api.get<unknown>(SKILL_INSTALLS_PATH, { signal });
  return parseInstalledSkillNames(response);
}

export async function installSkill(name: string): Promise<Set<string>> {
  assertSkillsAvailable();
  const response = await api.post<unknown>(SKILL_INSTALLS_PATH, { name });
  return parseInstalledSkillNames(response);
}

export async function uninstallSkill(name: string): Promise<Set<string>> {
  assertSkillsAvailable();
  const response = await api.delete<unknown>(`${SKILL_INSTALLS_PATH}/${encodeURIComponent(name)}`);
  return parseInstalledSkillNames(response);
}

export function isAuthoredSkill(skill: ManagedSkillSummary): boolean {
  return AUTHORED_SOURCES.has(skill.source);
}

export function isPluginOwnedSkill(skill: ManagedSkillSummary): boolean {
  return skill.source === PLUGIN_SOURCE || Boolean(skill.origin?.pluginId);
}

export function isSkillInstalled(
  skill: ManagedSkillSummary,
  installed: ReadonlySet<string>,
): boolean {
  return skill.lifecycle === 'included' && (isAuthoredSkill(skill) || installed.has(skill.name));
}

export function skillActionFailureMessage(error: unknown, installing: boolean): string {
  if (error instanceof ApiHttpError && error.status < 500 && error.message.trim()) {
    return error.message;
  }
  return installing ? SKILL_INSTALL_FAILED_COPY : SKILL_UNINSTALL_FAILED_COPY;
}

export interface SkillDraftInput {
  name: string;
  description: string;
  body: string;
}

export async function fetchCanAuthorSkills(signal?: AbortSignal): Promise<boolean> {
  assertSkillsAvailable();
  const response = await api.get<{ canAuthorSkills?: unknown }>(SKILLS_PATH, { signal });
  return response?.canAuthorSkills === true;
}

export async function createPersonalSkill(draft: SkillDraftInput): Promise<void> {
  assertSkillsAvailable();
  await api.post<unknown>(SKILLS_PATH, {
    name: draft.name.trim(),
    description: draft.description.trim(),
    body: draft.body.trim(),
  });
}
