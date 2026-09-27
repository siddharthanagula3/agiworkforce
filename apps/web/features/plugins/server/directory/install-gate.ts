import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import type { WorkspaceFeature } from '@agiworkforce/types';

import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import type { UserScopedDb } from '@/lib/server/rls-db';
import { evaluatePluginPolicyForUser } from '@/lib/services/connector-policy-gate';
import { requireUserSkillAuthoring } from '@/lib/services/user-skill-authoring';
import { pluginNotPermittedResponse } from './install-responses';

const INSTALL_FEATURES: readonly WorkspaceFeature[] = ['plugins'];
const AUTHORED_SKILL_FEATURES: readonly WorkspaceFeature[] = ['plugins', 'skills'];

export interface PluginInstallRequest {
  pluginKeys: readonly string[];
  authorsSkills?: boolean;
}

export async function refusePluginInstall(
  request: NextRequest,
  scope: UserScopedDb,
  install: PluginInstallRequest,
): Promise<NextResponse | null> {
  if (install.authorsSkills) requireUserSkillAuthoring();

  const surface = resolveCloudChatSurface(request);
  for (const feature of install.authorsSkills ? AUTHORED_SKILL_FEATURES : INSTALL_FEATURES) {
    const refused = await buildWorkspaceFeatureGateResponse(
      scope.userId,
      request,
      feature,
      surface,
    );
    if (refused) return refused;
  }

  for (const pluginKey of install.pluginKeys) {
    const policy = await evaluatePluginPolicyForUser({
      db: scope.db,
      userId: scope.userId,
      organizationId: scope.organizationId,
      pluginKey,
      request,
    });
    if (!policy.allowed) return pluginNotPermittedResponse(policy.reason);
  }
  return null;
}
