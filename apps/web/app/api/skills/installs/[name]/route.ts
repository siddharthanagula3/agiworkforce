import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  getManagedSkillDirectoryForPlugins,
  isPluginOwnedSkill,
} from '@/lib/services/skill-catalog-service';
import {
  resolveInstalledManagedSkillNames,
  setSkillInstallOverride,
} from '@/lib/services/skill-install-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const SKILL_INSTALL_NAME_MAX_LENGTH = 200;

function requireSkillName(name: string | undefined): string {
  if (!name || name.length > SKILL_INSTALL_NAME_MAX_LENGTH) {
    throw createError.validation(
      `skill name is required (1–${SKILL_INSTALL_NAME_MAX_LENGTH} chars)`,
    );
  }
  return name;
}

async function handleUninstallSkill(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;

  const name = requireSkillName((await context.params).name);
  const { db, userId } = await getUserScopedDb(request);
  const enabledPluginIds = await listEnabledPluginIds(db, userId);
  const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  const skill = directory.find((candidate) => candidate.name === name);
  if (!skill) {
    throw createError.notFound(`Skill "${name}" not found`);
  }
  if (isPluginOwnedSkill(skill)) {
    throw createError.conflict(`"${skill.name}" is controlled by its plugin installation.`);
  }

  await setSkillInstallOverride(db, userId, skill.name, false);
  const installed = await resolveInstalledManagedSkillNames(db, userId, directory);
  return NextResponse.json({ installed });
}

export const DELETE = withCorsRoute(withErrorHandler(handleUninstallSkill));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
