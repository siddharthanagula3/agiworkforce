import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { readJsonBody } from '@/lib/read-json-body';
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
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const SKILL_INSTALL_NAME_MAX_LENGTH = 200;

const InstallBodySchema = z
  .object({
    name: z.string().trim().min(1).max(SKILL_INSTALL_NAME_MAX_LENGTH),
  })
  .strict();

async function handleListInstalls(request: NextRequest) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const enabledPluginIds = await listEnabledPluginIds(db, userId);
  const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  const installed = await resolveInstalledManagedSkillNames(db, userId, directory);
  return NextResponse.json({ installed });
}

async function handleInstallSkill(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;

  const parsed = InstallBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('A skill name is required', parsed.error.issues);
  }

  const { db, userId } = await getUserScopedDb(request);
  const enabledPluginIds = await listEnabledPluginIds(db, userId);
  const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  const skill = directory.find((candidate) => candidate.name === parsed.data.name);
  if (!skill) {
    throw createError.notFound(`Skill "${parsed.data.name}" not found`);
  }
  if (isPluginOwnedSkill(skill)) {
    throw createError.conflict(`"${skill.name}" is controlled by its plugin installation.`);
  }

  await setSkillInstallOverride(db, userId, skill.name, true);
  const installed = await resolveInstalledManagedSkillNames(db, userId, directory);
  return NextResponse.json({ installed });
}

export const GET = withCorsRoute(withErrorHandler(handleListInstalls));
export const POST = withCorsRoute(withErrorHandler(handleInstallSkill));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
