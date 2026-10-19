import {
  PLUGINS_PATH,
  PLUGIN_INSTALLATIONS_PATH,
  PLUGIN_UPDATES_PATH,
  PluginDependentsRefusalSchema,
  PluginDirectoryDetailWireSchema,
  PluginDirectoryListWireSchema,
  PluginInstallWireSchema,
  PluginInstallationsWireSchema,
  PluginInstallationWireSchema,
  PluginScanWireSchema,
  PluginSettingsWireSchema,
  PluginUpdatesWireSchema,
  PluginVersionsWireSchema,
  pluginInstallationPath,
  pluginPath,
  type PluginDirectoryEntryWire,
  type PluginDirectoryListWire,
  type PluginDirectorySortKey,
  type PluginDirectorySourceFacet,
  type PluginInstallationWire,
  type PluginScanWire,
  type PluginSettingsWire,
  type PluginUpdateOfferWire,
  type PluginVersionsWire,
} from '@agiworkforce/cloud-contracts';
import { ApiHttpError, api, apiFetch } from '@/services/api';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';

export interface PluginDirectoryQuery {
  search?: string;
  category?: string;
  publisher?: string;
  source?: PluginDirectorySourceFacet;
  sort?: PluginDirectorySortKey;
  cursor?: string | null;
  limit?: number;
}

export class PluginDependentsError extends Error {
  constructor(
    message: string,
    readonly dependents: { id: string; name: string }[],
  ) {
    super(message);
    this.name = 'PluginDependentsError';
  }
}

export function pluginDirectoryHref(query: PluginDirectoryQuery): string {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set('search', search);
  if (query.category) params.set('category', query.category);
  if (query.publisher) params.set('publisher', query.publisher);
  if (query.source) params.set('source', query.source);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  const encoded = params.toString();
  return encoded ? `${PLUGINS_PATH}?${encoded}` : PLUGINS_PATH;
}

export async function fetchPluginDirectory(
  query: PluginDirectoryQuery,
  signal?: AbortSignal,
): Promise<PluginDirectoryListWire> {
  return PluginDirectoryListWireSchema.parse(
    await api.get<unknown>(pluginDirectoryHref(query), { signal }),
  );
}

export async function fetchPlugin(
  pluginId: string,
  signal?: AbortSignal,
): Promise<PluginDirectoryEntryWire> {
  return PluginDirectoryDetailWireSchema.parse(
    await api.get<unknown>(pluginPath(pluginId), { signal }),
  ).entry;
}

export async function fetchPluginInstallations(
  signal?: AbortSignal,
): Promise<PluginInstallationWire[]> {
  return PluginInstallationsWireSchema.parse(
    await api.get<unknown>(PLUGIN_INSTALLATIONS_PATH, { signal }),
  ).installations;
}

export async function installPlugin(pluginId: string) {
  return PluginInstallWireSchema.parse(
    await api.post<unknown>(PLUGIN_INSTALLATIONS_PATH, { pluginId }),
  );
}

async function refusal(response: Response): Promise<Error> {
  const text = await response.text();
  try {
    const body: unknown = JSON.parse(text);
    const dependents = PluginDependentsRefusalSchema.safeParse(body);
    if (dependents.success) {
      return new PluginDependentsError(
        dependents.data.error.message,
        dependents.data.error.dependents,
      );
    }
    const message = (body as { error?: { message?: unknown } }).error?.message;
    if (typeof message === 'string' && message.trim()) {
      return new ApiHttpError(message, response.status);
    }
  } catch {
    return new ApiHttpError(`The request failed (${response.status}).`, response.status);
  }
  return new ApiHttpError(`The request failed (${response.status}).`, response.status);
}

export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean,
  withDependents = false,
): Promise<PluginInstallationWire> {
  const response = await apiFetch(pluginInstallationPath(pluginId), {
    method: 'PATCH',
    body: JSON.stringify(withDependents ? { enabled, withDependents } : { enabled }),
  });
  if (!response.ok) throw await refusal(response);
  return PluginInstallationWireSchema.parse(
    ((await response.json()) as { installation: unknown }).installation,
  );
}

export async function uninstallPlugin(pluginId: string, withDependents = false): Promise<void> {
  const path = pluginInstallationPath(pluginId);
  const response = await apiFetch(withDependents ? `${path}?withDependents=true` : path, {
    method: 'DELETE',
  });
  if (!response.ok) throw await refusal(response);
}

export async function fetchPluginUpdates(signal?: AbortSignal): Promise<PluginUpdateOfferWire[]> {
  return PluginUpdatesWireSchema.parse(await api.get<unknown>(PLUGIN_UPDATES_PATH, { signal }))
    .updates;
}

export async function movePluginToVersion(
  pluginId: string,
  toVersion: string,
  acknowledgedPermissions: string[],
): Promise<void> {
  await api.post<unknown>(PLUGIN_UPDATES_PATH, {
    pluginId,
    toVersion,
    ...(acknowledgedPermissions.length > 0 ? { acknowledgedPermissions } : {}),
  });
}

export async function fetchPluginVersions(pluginId: string): Promise<PluginVersionsWire> {
  return PluginVersionsWireSchema.parse(await api.get<unknown>(pluginPath(pluginId, 'versions')));
}

export async function fetchPluginScan(pluginId: string): Promise<PluginScanWire['scan']> {
  return PluginScanWireSchema.parse(await api.get<unknown>(pluginPath(pluginId, 'scan'))).scan;
}

export async function fetchPluginSettings(pluginId: string): Promise<PluginSettingsWire> {
  return PluginSettingsWireSchema.parse(await api.get<unknown>(pluginPath(pluginId, 'settings')))
    .settings;
}

export async function updatePluginSettings(
  pluginId: string,
  patch: { enabledSkills?: string[]; customExamplePrompts?: string[] | null },
): Promise<PluginSettingsWire> {
  return PluginSettingsWireSchema.parse(
    await api.patch<unknown>(pluginPath(pluginId, 'settings'), patch),
  ).settings;
}

export function pluginActionError(error: unknown, fallback: string): string {
  if (error instanceof PluginDependentsError) return error.message;
  return cloudActionError(error, fallback);
}
