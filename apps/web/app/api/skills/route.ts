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
  invalidateManagedSkillCatalogCache,
  SkillCatalogUnavailableError,
} from '@/lib/services/skill-catalog-service';
import { resolveInstalledManagedSkills } from '@/lib/services/skill-install-service';
import {
  createUserSkill,
  listUserSkills,
  toUserSkillSummary,
} from '@/lib/services/user-skill-service';
import { userSkillAuthoringEnabled } from '@/lib/services/user-skill-authoring';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { listInstalledDirectorySkills } from '@/features/plugins/server/directory/installed-skills';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const CATALOG_PARAM = 'catalog';
const CATALOG_ALL = 'all';

async function handleListSkills(request: NextRequest) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { userId } = await getClerkAuthUser(request);
  const wholeCatalog = new URL(request.url).searchParams.get(CATALOG_PARAM) === CATALOG_ALL;
  let skills;
  try {
    const enabledPluginIds = await listEnabledPluginIds(getNeonDb(), userId);
    const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
    skills = wholeCatalog
      ? directory
      : await resolveInstalledManagedSkills(getNeonDb(), userId, directory);
  } catch (error) {
    if (error instanceof SkillCatalogUnavailableError) {
      throw createError.internal('Failed to load skills');
    }
    throw error;
  }
  const canAuthorSkills = userSkillAuthoringEnabled();
  const userSkills = canAuthorSkills ? await listUserSkills(getNeonDb(), userId) : [];
  const directorySkills = await listInstalledDirectorySkills(getNeonDb(), userId);
  let body;
  try {
    body = ManagedSkillsResponseSchema.parse({
      skills: [
        ...[...skills, ...directorySkills].map((s) => ({
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
        ...userSkills,
      ],
    });
  } catch (error) {
    invalidateManagedSkillCatalogCache();
    throw error;
  }
  return NextResponse.json({ ...body, canAuthorSkills });
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
