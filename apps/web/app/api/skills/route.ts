/**
 * Skills API · list skills loaded via `@agiworkforce/skills`.
 *
 * Routes:
 *   GET /api/skills          · list metadata only (progressive disclosure).
 *   GET /api/skills/[name]   · fetch the body for a named skill.
 *
 * Skills source: a layered scan of configured skill directories on the
 * gateway host. Host paths are never returned to the browser.
 *
 * Progressive disclosure: this endpoint never returns body content for
 * the index. The body is fetched lazily by the consumer UI from the
 * dynamic-segment endpoint. This matches Anthropic's reference pattern of
 * keeping the system-prompt skill list small.
 */

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
      })),
    }),
  );
}

export const GET = withCorsRoute(withErrorHandler(handleListSkills));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
