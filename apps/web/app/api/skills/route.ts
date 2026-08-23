
import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { ManagedSkillsResponseSchema } from '@agiworkforce/cloud-contracts';
import {
  getManagedSkillDirectoryForPlugins,
  SkillCatalogUnavailableError,
} from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { getNeonDb } from '@/lib/server/neon-db';

export const runtime = 'nodejs';

async function handleListSkills(request: NextRequest) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { userId } = await getClerkAuthUser(request);
  let skills;
  try {
    const enabledPluginIds = await listEnabledPluginIds(getNeonDb(), userId);
    skills = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
  } catch (error) {
    if (error instanceof SkillCatalogUnavailableError) {
      throw createError.internal('Failed to load skills');
    }
    throw error;
  }
  return NextResponse.json(
    ManagedSkillsResponseSchema.parse({
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        source: s.source,
        lifecycle: s.frontmatter['draft'] === true ? 'draft' : 'included',
        downloadable: s.source === 'bundled' && s.frontmatter['draft'] !== true,
        // Straight from the bundle's frontmatter. Omitted when the skill has
        // none, so the column can say "unknown" instead of showing a version
        // this route made up.
        ...(typeof s.frontmatter['version'] === 'string' && s.frontmatter['version'].trim()
          ? { version: s.frontmatter['version'].trim() }
          : {}),
      })),
    }),
  );
}

export const GET = withCorsRoute(withErrorHandler(handleListSkills));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
