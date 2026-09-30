import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { findSelectableSkillWithFiles } from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { workspaceAllowsPlugins } from '@/lib/services/workspace-plugin-access';

export const runtime = 'nodejs';

const SKILL_NAME_MAX_LENGTH = 200;
const SKILL_ENTRY_FILE = 'SKILL.md';

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

  const pluginsAllowed = await workspaceAllowsPlugins(db, userId);

  const found = await findSelectableSkillWithFiles({
    db,
    userId,
    name,
    loadEnabledPluginIds: () =>
      pluginsAllowed ? listEnabledPluginIds(db, userId) : Promise.resolve(new Set<string>()),
    pluginsAllowed,
  });
  if (!found) {
    throw createError.notFound(`Skill "${name}" not found`);
  }

  const bundled = await found.access.listFiles(found.skill);
  const files = [
    { path: SKILL_ENTRY_FILE, size: Buffer.byteLength(found.skill.body, 'utf8') },
    ...bundled,
  ].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return NextResponse.json({ files });
}

export const GET = withCorsRoute(withErrorHandler(handleListFiles));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
