import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  getManagedSkillDirectoryForPlugins,
  listManagedSkillFiles,
} from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';

export const runtime = 'nodejs';

const SKILL_NAME_MAX_LENGTH = 200;

function requireSkillName(name: string | undefined): string {
  if (!name || name.length > SKILL_NAME_MAX_LENGTH) {
    throw createError.validation(`skill name is required (1–${SKILL_NAME_MAX_LENGTH} chars)`);
  }
  return name;
}

async function handleListFiles(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const name = requireSkillName((await context.params).name);

  const enabledPluginIds = await listEnabledPluginIds(db, userId);
  const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  const skill = directory.find((candidate) => candidate.name === name);
  if (!skill) {
    throw createError.notFound(`Skill "${name}" not found`);
  }

  const files = await listManagedSkillFiles(skill);
  if (files === null) {
    throw createError.notFound(`Skill "${name}" not found`);
  }
  return NextResponse.json({ files });
}

export const GET = withCorsRoute(withErrorHandler(handleListFiles));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
