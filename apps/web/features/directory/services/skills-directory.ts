import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';
import type {
  DirectoryDetailFile,
  DirectoryEntry,
  DirectoryFilterGroup,
  DirectorySection,
  DirectorySkillDetail,
  DirectorySourceChip,
} from '@agiworkforce/ui';

import {
  DIRECTORY_SOURCE_AGI,
  DIRECTORY_SOURCE_LABEL_AGI,
  DIRECTORY_SOURCE_LABEL_YOURS,
  DIRECTORY_SOURCE_YOURS,
  SKILLS_PATH,
  SKILL_CATALOG_PARAM,
  SKILL_INSTALLS_PATH,
  SKILL_LIFECYCLE_DRAFT_LABEL,
  SKILL_LIFECYCLE_GROUP_ID,
  SKILL_LIFECYCLE_GROUP_LABEL,
  SKILL_LIFECYCLE_INCLUDED_LABEL,
  SKILL_PUBLISHER_AGI,
  SKILL_PUBLISHER_MANAGED,
  SKILL_LICENSE_PREFIX,
  SKILL_PUBLISHER_YOU,
  SKILL_STATUS_GROUP_ID,
  SKILL_STATUS_GROUP_LABEL,
  SKILL_STATUS_INSTALLED,
  SKILL_STATUS_INSTALLED_LABEL,
  SKILL_STATUS_NOT_INSTALLED,
  SKILL_STATUS_NOT_INSTALLED_LABEL,
} from '../constants';
import { DirectoryRequestError } from './request-error';

const OWNED_SOURCES = new Set(['personal', 'project', 'workspace']);
const ENTRY_FILE = 'SKILL.md';
const LICENSE_PREFIX = 'license';

export function skillPublisher(source: string): string {
  if (OWNED_SOURCES.has(source)) return SKILL_PUBLISHER_YOU;
  if (source === 'managed-local') return SKILL_PUBLISHER_MANAGED;
  return SKILL_PUBLISHER_AGI;
}

function skillSourceId(source: string): string {
  return OWNED_SOURCES.has(source) ? DIRECTORY_SOURCE_YOURS : DIRECTORY_SOURCE_AGI;
}

export function isAuthoredSkill(skill: ManagedSkillSummary): boolean {
  return OWNED_SOURCES.has(skill.source);
}

export function toSkillEntry(
  skill: ManagedSkillSummary,
  installed: ReadonlySet<string>,
): DirectoryEntry {
  const isInstalled = isAuthoredSkill(skill) || installed.has(skill.name);
  return {
    id: skill.name,
    name: skill.name,
    slashName: true,
    publisher: skillPublisher(skill.source),
    description: skill.description,
    sourceId: skillSourceId(skill.source),
    installed: isInstalled,
    ...(skill.editable ? { editable: true } : {}),
    facets: {
      [SKILL_LIFECYCLE_GROUP_ID]: [skill.lifecycle],
      [SKILL_STATUS_GROUP_ID]: [isInstalled ? SKILL_STATUS_INSTALLED : SKILL_STATUS_NOT_INSTALLED],
    },
  };
}

function skillSources(): DirectorySourceChip[] {
  return [
    { id: DIRECTORY_SOURCE_AGI, label: DIRECTORY_SOURCE_LABEL_AGI },
    { id: DIRECTORY_SOURCE_YOURS, label: DIRECTORY_SOURCE_LABEL_YOURS },
  ];
}

function skillFilterGroups(
  skills: readonly ManagedSkillSummary[],
  entries: readonly DirectoryEntry[],
): DirectoryFilterGroup[] {
  const groups: DirectoryFilterGroup[] = [];
  if (new Set(skills.map((skill) => skill.lifecycle)).size > 1) {
    groups.push({
      id: SKILL_LIFECYCLE_GROUP_ID,
      label: SKILL_LIFECYCLE_GROUP_LABEL,
      options: [
        { value: 'included', label: SKILL_LIFECYCLE_INCLUDED_LABEL },
        { value: 'draft', label: SKILL_LIFECYCLE_DRAFT_LABEL },
      ],
    });
  }
  if (entries.length > 0) {
    groups.push({
      id: SKILL_STATUS_GROUP_ID,
      label: SKILL_STATUS_GROUP_LABEL,
      options: [
        { value: SKILL_STATUS_INSTALLED, label: SKILL_STATUS_INSTALLED_LABEL },
        { value: SKILL_STATUS_NOT_INSTALLED, label: SKILL_STATUS_NOT_INSTALLED_LABEL },
      ],
    });
  }
  return groups;
}

export function toSkillSection(
  skills: readonly ManagedSkillSummary[],
  installed: ReadonlySet<string>,
): DirectorySection {
  const entries = skills.map((skill) => toSkillEntry(skill, installed));
  return {
    entries,
    installable: true,
    sources: skillSources(),
    filterGroups: skillFilterGroups(skills, entries),
    sortOptions: ['name'],
  };
}

export async function fetchSkillCatalog(): Promise<ManagedSkillSummary[]> {
  const response = await fetch(`${SKILLS_PATH}?${SKILL_CATALOG_PARAM}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`skill catalog failed: ${response.status}`);
  const parsed = ManagedSkillsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Invalid skills response');
  return parsed.data.skills;
}

export async function fetchInstalledSkillNames(): Promise<Set<string>> {
  const response = await fetch(SKILL_INSTALLS_PATH, { cache: 'no-store' });
  if (!response.ok) return new Set();
  const body = (await response.json()) as { installed?: string[] };
  return new Set(body.installed ?? []);
}

export async function installSkill(name: string, csrfToken: string): Promise<void> {
  const response = await fetch(SKILL_INSTALLS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new DirectoryRequestError(response.status, `skill install failed: ${response.status}`);
  }
}

export async function uninstallSkill(name: string, csrfToken: string): Promise<void> {
  const response = await fetch(`${SKILL_INSTALLS_PATH}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) {
    throw new DirectoryRequestError(response.status, `skill uninstall failed: ${response.status}`);
  }
}

function filesPath(name: string): string {
  return `${SKILLS_PATH}/${encodeURIComponent(name)}/files`;
}

export async function fetchSkillFileList(name: string): Promise<DirectoryDetailFile[]> {
  const response = await fetch(filesPath(name), { cache: 'no-store' });
  if (!response.ok) return [];
  const body = (await response.json()) as { files?: { path: string }[] };
  return (body.files ?? []).map((file) => ({ path: file.path }));
}

export async function fetchSkillFileContent(name: string, path: string): Promise<string> {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const response = await fetch(`${filesPath(name)}/${encoded}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`skill file failed: ${response.status}`);
  const body = (await response.json()) as { file?: { content?: string } };
  return body.file?.content ?? '';
}

async function fetchSkillBody(name: string): Promise<string> {
  const response = await fetch(`${SKILLS_PATH}/${encodeURIComponent(name)}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`skill detail failed: ${response.status}`);
  const body = (await response.json()) as { body?: string };
  return body.body ?? '';
}

export async function fetchSkillDetail(
  id: string,
  skills: readonly ManagedSkillSummary[],
  installed: ReadonlySet<string>,
): Promise<DirectorySkillDetail | null> {
  const summary = skills.find((skill) => skill.name === id);
  if (!summary) return null;

  const listed = await fetchSkillFileList(id);
  const files: DirectoryDetailFile[] = listed.length > 0 ? listed : [{ path: ENTRY_FILE }];
  const entry = files.find((file) => file.path === ENTRY_FILE);
  if (entry) entry.content = await fetchSkillBody(id);

  const licenseFile = files.find((file) => file.path.toLowerCase().startsWith(LICENSE_PREFIX));

  return {
    kind: 'skill',
    id: summary.name,
    name: summary.name,
    publisher: skillPublisher(summary.source),
    description: summary.description,
    ...(licenseFile ? { license: `${SKILL_LICENSE_PREFIX} ${licenseFile.path}` } : {}),
    files,
    readFile: (path: string) => fetchSkillFileContent(id, path),
    installed: isAuthoredSkill(summary) || installed.has(summary.name),
    ...(summary.editable ? { editable: true } : {}),
  };
}
