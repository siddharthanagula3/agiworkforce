import {
  MANAGED_SKILL_LIFECYCLES,
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';
import type {
  DirectoryDetailFile,
  DirectoryEntry,
  DirectoryFilterGroup,
  DirectoryManageRow,
  DirectoryManageSection,
  DirectoryPluginConnectorSetting,
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
  SKILL_ORIGIN_BUNDLED,
  SKILL_ORIGIN_MANAGED,
  SKILL_ORIGIN_PERSONAL,
  SKILL_ORIGIN_UNKNOWN_PLUGIN,
  SKILL_GROUP_AGI,
  SKILL_GROUP_CREATED,
  SKILL_GROUP_PLUGINS,
  SKILL_GROUP_WORKSPACE,
  SKILL_MANAGE_GROUPS,
  SKILL_PUBLISHER_AGI,
  SKILL_PUBLISHER_MANAGED,
  SKILL_PUBLISHER_PLUGIN,
  SKILL_LICENSE_PREFIX,
  SKILL_PUBLISHER_YOU,
  SKILL_STATUS_GROUP_ID,
  SKILL_STATUS_GROUP_LABEL,
  SKILL_STATUS_INSTALLED,
  SKILL_STATUS_INSTALLED_LABEL,
  SKILL_STATUS_NOT_INSTALLED,
  SKILL_STATUS_NOT_INSTALLED_LABEL,
  skillAuthoredPluginOrigin,
  skillCatalogPluginOrigin,
  skillPluginPublisher,
  skillRepositoryPluginOrigin,
  skillUploadedPluginOrigin,
  skillWorkspacePluginOrigin,
} from '../constants';
import { DirectoryRequestError } from './request-error';

const OWNED_SOURCES = new Set(['personal', 'project', 'workspace']);
const PLUGIN_SOURCE = 'extra';
const MANAGED_LOCAL_SOURCE = 'managed-local';
const SKILL_AUTHOR_YOU = 'You';
const SKILL_AUTHOR_AGI = 'AGI';
const SKILL_AUTHOR_PLUGIN = 'Plugin';

export function skillAuthor(source: string): string {
  if (OWNED_SOURCES.has(source)) return SKILL_AUTHOR_YOU;
  if (source === PLUGIN_SOURCE) return SKILL_AUTHOR_PLUGIN;
  if (source === MANAGED_LOCAL_SOURCE) return SKILL_PUBLISHER_MANAGED;
  return SKILL_AUTHOR_AGI;
}

const ENTRY_FILE = 'SKILL.md';
const LICENSE_PREFIX = 'license';

export function skillPublisher(source: string): string {
  if (OWNED_SOURCES.has(source)) return SKILL_PUBLISHER_YOU;
  if (source === MANAGED_LOCAL_SOURCE) return SKILL_PUBLISHER_MANAGED;
  if (source === PLUGIN_SOURCE) return SKILL_PUBLISHER_PLUGIN;
  return SKILL_PUBLISHER_AGI;
}

export function skillPublisherFor(skill: ManagedSkillSummary): string {
  const origin = skill.origin;
  if (skill.source === PLUGIN_SOURCE && origin) {
    if (origin.kind === 'upload' || origin.kind === 'authored') return SKILL_PUBLISHER_YOU;
    if (origin.pluginName) return skillPluginPublisher(origin.pluginName);
  }
  return skillPublisher(skill.source);
}

function pluginOrigin(skill: ManagedSkillSummary): string | null {
  const origin = skill.origin;
  const pluginName = origin?.pluginName;
  if (!origin || !pluginName) return null;
  switch (origin.kind) {
    case 'catalog':
      return skillCatalogPluginOrigin(pluginName);
    case 'repository':
      return skillRepositoryPluginOrigin(pluginName, origin.marketplace);
    case 'upload':
      return skillUploadedPluginOrigin(pluginName);
    case 'authored':
      return skillAuthoredPluginOrigin(pluginName);
    case 'workspace':
      return skillWorkspacePluginOrigin(pluginName);
    default:
      return null;
  }
}

export function skillProvenance(skill: ManagedSkillSummary): string {
  const fromPlugin = pluginOrigin(skill);
  if (fromPlugin) return fromPlugin;
  if (skill.origin?.kind === 'personal' || OWNED_SOURCES.has(skill.source)) {
    return SKILL_ORIGIN_PERSONAL;
  }
  if (skill.source === PLUGIN_SOURCE) return SKILL_ORIGIN_UNKNOWN_PLUGIN;
  if (skill.source === MANAGED_LOCAL_SOURCE) return SKILL_ORIGIN_MANAGED;
  return SKILL_ORIGIN_BUNDLED;
}

function skillSourceId(source: string): string {
  return OWNED_SOURCES.has(source) ? DIRECTORY_SOURCE_YOURS : DIRECTORY_SOURCE_AGI;
}

export function isAuthoredSkill(skill: ManagedSkillSummary): boolean {
  return OWNED_SOURCES.has(skill.source);
}

const DRAFT_LIFECYCLE = MANAGED_SKILL_LIFECYCLES[1];

export function isDraftSkill(skill: ManagedSkillSummary): boolean {
  return skill.lifecycle === DRAFT_LIFECYCLE;
}

export function toSkillEntry(
  skill: ManagedSkillSummary,
  installed: ReadonlySet<string>,
): DirectoryEntry {
  const draft = isDraftSkill(skill);
  const isInstalled = !draft && (isAuthoredSkill(skill) || installed.has(skill.name));
  return {
    id: skill.name,
    name: skill.name,
    slashName: true,
    publisher: skillPublisherFor(skill),
    description: skill.description,
    sourceId: skillSourceId(skill.source),
    installed: isInstalled,
    ...(draft ? { installable: false, statusLabel: SKILL_LIFECYCLE_DRAFT_LABEL } : {}),
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
        { value: MANAGED_SKILL_LIFECYCLES[0], label: SKILL_LIFECYCLE_INCLUDED_LABEL },
        { value: DRAFT_LIFECYCLE, label: SKILL_LIFECYCLE_DRAFT_LABEL },
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

export function skillManageGroup(skill: ManagedSkillSummary): string {
  const origin = skill.origin;
  if (origin?.kind === 'workspace' || skill.source === MANAGED_LOCAL_SOURCE) {
    return SKILL_GROUP_WORKSPACE;
  }
  if (isAuthoredSkill(skill) || origin?.kind === 'authored') return SKILL_GROUP_CREATED;
  if (skill.source === PLUGIN_SOURCE || origin?.pluginName) return SKILL_GROUP_PLUGINS;
  return SKILL_GROUP_AGI;
}

/**
 * Every included skill the account has, grouped the way it reached the
 * account. Built-in skills stay listed when turned off, so their switch can
 * turn them back on; a skill from a plugin or the workspace is switched on its
 * plugin instead, and one the account wrote has no switch to turn.
 */
export function toSkillManageRows(
  skills: readonly ManagedSkillSummary[],
  installed: ReadonlySet<string>,
): DirectoryManageRow[] {
  return skills
    .filter((skill) => !isDraftSkill(skill))
    .map((skill) => {
      const groupId = skillManageGroup(skill);
      return {
        id: skill.name,
        name: skill.name,
        slashName: true,
        author: skill.origin?.pluginName ?? skillAuthor(skill.source),
        groupId,
        ...(groupId === SKILL_GROUP_AGI ? { enabled: installed.has(skill.name) } : {}),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function toSkillManageSection(
  skills: readonly ManagedSkillSummary[],
  installed: ReadonlySet<string>,
): Pick<DirectoryManageSection, 'rows' | 'groups'> {
  return { rows: toSkillManageRows(skills, installed), groups: SKILL_MANAGE_GROUPS };
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

export function skillDescriptionsByName(
  catalog: readonly ManagedSkillSummary[],
): ReadonlyMap<string, string> {
  return new Map(
    catalog
      .filter((skill) => skill.description.length > 0)
      .map((skill) => [skill.name, skill.description]),
  );
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

export async function deleteAuthoredSkill(name: string, csrfToken: string): Promise<void> {
  const response = await fetch(`${SKILLS_PATH}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) {
    throw new DirectoryRequestError(response.status, `skill delete failed: ${response.status}`);
  }
}

export async function removeSkill(skill: ManagedSkillSummary, csrfToken: string): Promise<void> {
  return isAuthoredSkill(skill)
    ? deleteAuthoredSkill(skill.name, csrfToken)
    : uninstallSkill(skill.name, csrfToken);
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

export interface SkillConnectorLookup {
  connected: ReadonlySet<string>;
  connectorName?: (connectorId: string) => string | undefined;
}

function requiredConnectorSettings(
  skill: ManagedSkillSummary,
  lookup: SkillConnectorLookup | undefined,
): DirectoryPluginConnectorSetting[] {
  const connected = new Set([...(lookup?.connected ?? [])].map((id) => id.toLowerCase()));
  return (skill.requiredConnectors ?? []).map((id) => ({
    id,
    name: lookup?.connectorName?.(id) ?? id,
    connected: connected.has(id.toLowerCase()),
  }));
}

export async function fetchSkillDetail(
  id: string,
  skills: readonly ManagedSkillSummary[],
  installed: ReadonlySet<string>,
  connectors?: SkillConnectorLookup,
): Promise<DirectorySkillDetail | null> {
  const summary = skills.find((skill) => skill.name === id);
  if (!summary) return null;

  const listed = await fetchSkillFileList(id);
  const files: DirectoryDetailFile[] = listed.length > 0 ? listed : [{ path: ENTRY_FILE }];
  const entry = files.find((file) => file.path === ENTRY_FILE);
  if (entry) entry.content = await fetchSkillBody(id);

  const licenseFile = files.find((file) => file.path.toLowerCase().startsWith(LICENSE_PREFIX));

  const requiredConnectors = requiredConnectorSettings(summary, connectors);

  return {
    kind: 'skill',
    id: summary.name,
    name: summary.name,
    publisher: skillPublisherFor(summary),
    description: summary.description,
    provenance: skillProvenance(summary),
    ...(summary.origin?.addedAt ? { addedAt: summary.origin.addedAt } : {}),
    ...(summary.version ? { version: summary.version } : {}),
    ...(summary.requiredTools?.length ? { requiredTools: summary.requiredTools } : {}),
    ...(requiredConnectors.length > 0 ? { requiredConnectors } : {}),
    ...(licenseFile ? { license: `${SKILL_LICENSE_PREFIX} ${licenseFile.path}` } : {}),
    files,
    readFile: (path: string) => fetchSkillFileContent(id, path),
    installed: isAuthoredSkill(summary) || installed.has(summary.name),
    ...(summary.editable ? { editable: true } : {}),
  };
}
