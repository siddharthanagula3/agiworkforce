import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withAdmittedRateLimitHeaders } from '@/lib/rate-limit-headers';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  findSelectableSkillWithFiles,
  readManagedSkillFileBytes,
  type SkillFileEntry,
} from '@/lib/services/skill-catalog-service';
import { hashSkillContent } from '@agiworkforce/skills';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { workspaceAllowsPlugins } from '@/lib/services/workspace-plugin-access';
import { requireSkillName } from '../../skill-name-param';

export const runtime = 'nodejs';

const SKILL_ENTRY_FILE = 'SKILL.md';

async function handleListFiles(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const rateLimit = await withRateLimit(request, 'skills-catalog-read');
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
  // The hash is the ETag a download of the same file carries, so a client that
  // already holds those bytes can skip the download.
  const contentHashOf = async (file: SkillFileEntry): Promise<string | undefined> => {
    if (found.managed) {
      const read = await readManagedSkillFileBytes(found.skill, file.path);
      return read.ok ? read.file.contentHash : undefined;
    }
    const read = await found.access.readFile(found.skill, file.path);
    return read.ok ? hashSkillContent(Buffer.from(read.content, 'utf8')) : undefined;
  };
  const hashed = await Promise.all(
    bundled.map(async (file) => {
      const contentHash = await contentHashOf(file);
      return contentHash === undefined ? file : { ...file, contentHash };
    }),
  );
  const files = [
    { path: SKILL_ENTRY_FILE, size: Buffer.byteLength(found.skill.body, 'utf8') },
    ...hashed,
  ].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return NextResponse.json({ files });
}

export const GET = withCorsRoute(withAdmittedRateLimitHeaders(withErrorHandler(handleListFiles)));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
