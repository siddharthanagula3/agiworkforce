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
import {
  getManagedSkillCatalog,
  SkillCatalogUnavailableError,
} from '@/lib/services/skill-catalog-service';

export const runtime = 'nodejs';

async function handleListSkills(request: NextRequest) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  await getClerkAuthUser(request);
  let skills;
  try {
    skills = await getManagedSkillCatalog();
  } catch (error) {
    if (error instanceof SkillCatalogUnavailableError) {
      throw createError.internal('Failed to load skills');
    }
    throw error;
  }
  return NextResponse.json({
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      source: s.source,
    })),
  });
}

export const GET = withErrorHandler(handleListSkills);
