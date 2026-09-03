import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { readJsonBody } from '@/lib/read-json-body';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { ManagedSkillsResponseSchema } from '@agiworkforce/cloud-contracts';
import { SkillDraftBodySchema } from './skill-draft-schema';
import {
  findManagedDirectorySkillByName,
  getManagedSkillDirectoryForPlugins,
  SkillCatalogUnavailableError,
} from '@/lib/services/skill-catalog-service';
import {
  createUserSkill,
  listUserSkills,
  toUserSkillSummary,
} from '@/lib/services/user-skill-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';

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
  const userSkills = await listUserSkills(getNeonDb(), userId);
  return NextResponse.json(
    ManagedSkillsResponseSchema.parse({
      skills: [
        ...skills.map((s) => ({
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
        ...userSkills.map(toUserSkillSummary),
      ],
    }),
  );
}

async function handleCreateSkill(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;

  const { db, userId } = await getUserScopedDb(request);
  const parsed = SkillDraftBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid skill draft', parsed.error.issues);
  }

  const existingManaged = await findManagedDirectorySkillByName(parsed.data.name);
  if (existingManaged) {
    throw createError.conflict(`"${parsed.data.name}" is already a built-in skill name.`);
  }

  const created = await createUserSkill(db, userId, parsed.data);
  return NextResponse.json({ skill: toUserSkillSummary(created) }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleListSkills));
export const POST = withCorsRoute(withErrorHandler(handleCreateSkill));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
