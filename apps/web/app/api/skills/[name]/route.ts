/**
 * Skills body endpoint — fetches the markdown body for one named skill.
 * Companion to `/api/skills` (which returns metadata only).
 *
 * Progressive disclosure: this is the lazy-load step. The consumer UI
 * shows "Loading skill body…" while this request is in flight.
 */

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';

import { lookupSkillBody } from '../route';

export const runtime = 'nodejs';

async function handleGetBody(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { name } = await context.params;
  if (!name || name.length > 200) {
    throw createError.validation('skill name is required (1–200 chars)');
  }
  const body = await lookupSkillBody(name);
  if (body === null) {
    throw createError.notFound(`Skill "${name}" not found`);
  }
  return NextResponse.json({ body });
}

export const GET = withErrorHandler(handleGetBody);
