import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { resolveEffectiveWorkspaceControls } from '@/lib/services/organization-policy-gate';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';

export async function workspaceAllowsPlugins(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  const effective = await resolveEffectiveWorkspaceControls(db, userId);
  return effective?.controls.featureAccess.plugins !== false;
}

export async function listPermittedPluginIds(
  db: DatabaseAdapter,
  userId: string,
): Promise<Set<string>> {
  return (await workspaceAllowsPlugins(db, userId))
    ? listEnabledPluginIds(db, userId)
    : new Set<string>();
}
