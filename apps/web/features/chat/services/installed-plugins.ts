'use client';

import {
  fetchPluginDirectoryEntry,
  fetchPluginInstallState,
} from '@/features/directory/services/plugins-directory';

export interface InstalledPlugin {
  id: string;
  name: string;
  skills: string[];
}

export async function loadInstalledPlugins(): Promise<InstalledPlugin[]> {
  try {
    const installs = await fetchPluginInstallState();
    const ids = [
      ...[...installs.builtinIds].filter(([, enabled]) => enabled).map(([id]) => id),
      ...[...installs.byPluginKey.values()]
        .filter((installation) => installation.enabled)
        .map((installation) => installation.pluginKey),
    ];
    const entries = await Promise.all(
      ids.map((id) => fetchPluginDirectoryEntry(id).catch(() => null)),
    );
    return entries.flatMap((entry) =>
      entry ? [{ id: entry.id, name: entry.name, skills: entry.declaredSkills }] : [],
    );
  } catch {
    return [];
  }
}
