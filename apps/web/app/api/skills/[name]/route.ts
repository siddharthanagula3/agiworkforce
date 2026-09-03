import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { readJsonBody } from '@/lib/read-json-body';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { SkillDraftBodySchema } from '../skill-draft-schema';
import {
  findManagedDirectorySkillByName,
  getManagedSkillCatalogForPlugins,
} from '@/lib/services/skill-catalog-service';
import {
  deleteUserSkill,
  findUserSkillByName,
  toUserSkillSummary,
  updateUserSkill,
} from '@/lib/services/user-skill-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const SKILL_NAME_MAX_LENGTH = 200;

function requireSkillName(name: string | undefined): string {
  if (!name || name.length > SKILL_NAME_MAX_LENGTH) {
    throw createError.validation(`skill name is required (1–${SKILL_NAME_MAX_LENGTH} chars)`);
  }
  return name;
}

async function handleGetBody(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { userId } = await getClerkAuthUser(request);
  const name = requireSkillName((await context.params).name);

  const enabledPluginIds = await listEnabledPluginIds(getNeonDb(), userId);
  const managed = (await getManagedSkillCatalogForPlugins(enabledPluginIds)).find(
    (candidate) => candidate.name === name,
  );
  if (managed) {
    return NextResponse.json({ body: managed.body });
  }

  const own = await findUserSkillByName(getNeonDb(), userId, name);
  if (!own) {
    throw createError.notFound(`Skill "${name}" not found`);
  }
  return NextResponse.json({ body: own.body });
}

async function handleUpdateSkill(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;

  const { db, userId } = await getUserScopedDb(request);
  const currentName = requireSkillName((await context.params).name);

  const parsed = SkillDraftBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid skill draft', parsed.error.issues);
  }

  if (parsed.data.name !== currentName) {
    const existingManaged = await findManagedDirectorySkillByName(parsed.data.name);
    if (existingManaged) {
      throw createError.conflict(`"${parsed.data.name}" is already a built-in skill name.`);
    }
  }

  const updated = await updateUserSkill(db, userId, currentName, parsed.data);
  if (!updated) {
    throw createError.notFound(`Skill "${currentName}" not found`);
  }
  return NextResponse.json({ skill: toUserSkillSummary(updated) });
}

async function handleDeleteSkill(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;

  const { db, userId } = await getUserScopedDb(request);
  const name = requireSkillName((await context.params).name);

  const deleted = await deleteUserSkill(db, userId, name);
  if (!deleted) {
    throw createError.notFound(`Skill "${name}" not found`);
  }
  return new NextResponse(null, { status: 204 });
}

export const GET = withCorsRoute(withErrorHandler(handleGetBody));
export const PUT = withCorsRoute(withErrorHandler(handleUpdateSkill));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteSkill));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
