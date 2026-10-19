import { API_URL } from '@/lib/constants';
import { guardedFetch } from '@/lib/egressGuard';
import { platformRequestHeaders } from '@/src/platform/platformHeaders';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { ApiHttpError, api, apiFetch } from '@/services/api';
import { getAuthHeaders } from '@/services/authSession';
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

export function pluginOwnedNote(skill: ManagedSkillSummary): string {
  const pluginName = skill.origin?.pluginName;
  return pluginName
    ? `Included with the ${pluginName} plugin. Controlled by its plugin installation.`
    : 'Controlled by its plugin installation.';
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

export interface SkillFileEntry {
  path: string;
  size: number;
}

export const SKILL_ENTRY_FILE = 'SKILL.md';

function skillPath(name: string, leaf = ''): string {
  return `${SKILLS_PATH}/${encodeURIComponent(name)}${leaf ? `/${leaf}` : ''}`;
}

export function skillFilePath(name: string, path: string): string {
  return skillPath(name, `files/${path.split('/').map(encodeURIComponent).join('/')}`);
}

export async function fetchSkillBody(name: string, signal?: AbortSignal): Promise<string> {
  assertSkillsAvailable();
  const response = await api.get<{ body?: unknown }>(skillPath(name), { signal });
  if (typeof response?.body !== 'string') throw new Error('Skills returned an invalid response.');
  return response.body;
}

export async function fetchSkillFiles(
  name: string,
  signal?: AbortSignal,
): Promise<SkillFileEntry[]> {
  assertSkillsAvailable();
  const response = await api.get<{ files?: unknown }>(skillPath(name, 'files'), { signal });
  const files = response?.files;
  if (
    !Array.isArray(files) ||
    !files.every(
      (file): file is SkillFileEntry =>
        typeof file === 'object' &&
        file !== null &&
        typeof (file as SkillFileEntry).path === 'string' &&
        typeof (file as SkillFileEntry).size === 'number',
    )
  ) {
    throw new Error('Skills returned an invalid response.');
  }
  return files;
}

export async function fetchSkillFileText(name: string, path: string): Promise<string> {
  assertSkillsAvailable();
  const response = await apiFetch(skillFilePath(name, path), { method: 'GET' });
  if (!response.ok) throw new ApiHttpError(`Could not open ${path}.`, response.status);
  return response.text();
}

export async function updatePersonalSkill(name: string, draft: SkillDraftInput): Promise<void> {
  assertSkillsAvailable();
  await api.put<unknown>(skillPath(name), {
    name: draft.name.trim(),
    description: draft.description.trim(),
    body: draft.body.trim(),
  });
}

export async function deletePersonalSkill(name: string): Promise<void> {
  assertSkillsAvailable();
  const response = await apiFetch(skillPath(name), { method: 'DELETE' });
  if (!response.ok) throw new ApiHttpError(`Could not delete ${name}.`, response.status);
}

export interface SkillUploadAsset {
  uri: string;
  name: string;
  mimeType: string;
}

export async function importSkillFile(asset: SkillUploadAsset): Promise<void> {
  assertSkillsAvailable();
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType,
  } as unknown as Blob);
  const response = await guardedFetch(`${API_URL}${SKILLS_PATH}`, {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
      ...(await getAuthHeaders()),
    },
    body: form,
  });
  if (response.ok) return;
  const text = await response.text();
  let message = 'Could not import this skill.';
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string };
    if (typeof parsed.error === 'string') message = parsed.error;
    else if (typeof parsed.error?.message === 'string') message = parsed.error.message;
  } catch {
    message = 'Could not import this skill.';
  }
  throw new ApiHttpError(message, response.status);
}

export function isTextSkillFile(path: string): boolean {
  return /\.(md|markdown|txt|json|ya?ml|toml|csv|tsv|py|js|ts|sh|rb|go|rs|html|css|xml|sql)$/i.test(
    path,
  );
}
