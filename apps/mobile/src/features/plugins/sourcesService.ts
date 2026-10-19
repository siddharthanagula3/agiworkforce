import {
  MEMBER_ORGANIZATION_PLUGINS_PATH,
  PLUGIN_MARKETPLACES_PATH,
  PLUGIN_MARKETPLACE_ENTRIES_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
  PLUGIN_SUBMISSIONS_PATH,
  pluginSubmissionPath,
  type MemberOrganizationPluginPatch,
  type MemberOrganizationPluginsResponse,
  type PluginMarketplaceEntry,
  type PluginMarketplaceInstallation,
  type PluginMarketplaceSourceSummary,
  type PluginSubmissionSummary,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

function listOf<T>(value: unknown, key: string): T[] {
  const list = (value as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(list)) throw new Error('Plugins returned an invalid response.');
  return list as T[];
}

export async function fetchWorkspacePlugins(
  signal?: AbortSignal,
): Promise<MemberOrganizationPluginsResponse> {
  const body = await api.get<MemberOrganizationPluginsResponse>(MEMBER_ORGANIZATION_PLUGINS_PATH, {
    signal,
  });
  if (!body || !Array.isArray(body.plugins)) {
    throw new Error('Plugins returned an invalid response.');
  }
  return body;
}

export async function updateWorkspacePlugin(
  pluginId: string,
  patch: MemberOrganizationPluginPatch,
): Promise<void> {
  await api.patch<unknown>(
    `${MEMBER_ORGANIZATION_PLUGINS_PATH}/${encodeURIComponent(pluginId)}`,
    patch,
  );
}

export async function fetchMarketplaces(
  signal?: AbortSignal,
): Promise<PluginMarketplaceSourceSummary[]> {
  return listOf(await api.get<unknown>(PLUGIN_MARKETPLACES_PATH, { signal }), 'sources');
}

export async function addMarketplace(repositoryUrl: string, ref: string): Promise<void> {
  const trimmedRef = ref.trim();
  await api.post<unknown>(PLUGIN_MARKETPLACES_PATH, {
    repositoryUrl: repositoryUrl.trim(),
    ...(trimmedRef ? { ref: trimmedRef } : {}),
  });
}

export async function refreshMarketplace(sourceId: string): Promise<void> {
  await api.post<unknown>(
    `${PLUGIN_MARKETPLACES_PATH}/${encodeURIComponent(sourceId)}/refresh`,
    {},
  );
}

export async function removeMarketplace(sourceId: string): Promise<void> {
  await api.delete<unknown>(`${PLUGIN_MARKETPLACES_PATH}/${encodeURIComponent(sourceId)}`);
}

export async function fetchMarketplaceEntries(
  signal?: AbortSignal,
): Promise<PluginMarketplaceEntry[]> {
  return listOf(await api.get<unknown>(PLUGIN_MARKETPLACE_ENTRIES_PATH, { signal }), 'entries');
}

export async function fetchMarketplaceInstallations(
  signal?: AbortSignal,
): Promise<PluginMarketplaceInstallation[]> {
  return listOf(
    await api.get<unknown>(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH, { signal }),
    'installations',
  );
}

export async function installMarketplaceEntry(entryId: string): Promise<void> {
  await api.post<unknown>(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH, { entryId });
}

export async function removeMarketplaceInstallation(installationId: string): Promise<void> {
  await api.delete<unknown>(
    `${PLUGIN_MARKETPLACE_INSTALLATIONS_PATH}/${encodeURIComponent(installationId)}`,
  );
}

export async function fetchPluginSubmissions(
  signal?: AbortSignal,
): Promise<PluginSubmissionSummary[]> {
  return listOf(await api.get<unknown>(PLUGIN_SUBMISSIONS_PATH, { signal }), 'submissions');
}

export async function submitMarketplaceEntry(entryId: string): Promise<void> {
  await api.post<unknown>(PLUGIN_SUBMISSIONS_PATH, { entryId });
}

export async function withdrawPluginSubmission(submissionId: string): Promise<void> {
  await api.delete<unknown>(pluginSubmissionPath(submissionId));
}

export const SUBMISSION_STATUS_LABELS: Record<PluginSubmissionSummary['status'], string> = {
  pending: 'In review',
  approved: 'Listed',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
  suspended: 'Suspended',
};

export const WORKSPACE_PREFERENCE_LABELS: Record<string, string> = {
  required: 'Required by your workspace',
  installed_by_default: 'Installed by default',
  available: 'Available to install',
};
