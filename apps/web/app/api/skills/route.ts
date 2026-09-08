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
import { parseSkillDraftFromMarkdown } from '@agiworkforce/skills';
import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import {
  PluginArchiveError,
  readSingleSkillFromArchive,
} from '@/features/plugins/server/directory/archive';
import {
  PLUGIN_UPLOAD_FILE_FIELD,
  SKILL_UPLOAD_NOT_UTF8_MESSAGE,
  SKILL_UPLOAD_UNREADABLE_MESSAGE,
} from '@/features/plugins/server/directory/constants';
import {
  dedupeByFirstClaimedName,
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
const MULTIPART_CONTENT_TYPE = 'multipart/form-data';
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function isZipArchive(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

async function readUploadedSkillDraft(request: NextRequest) {
  let form: FormData;
  try {
    form = (await request.formData()) as unknown as FormData;
  } catch (error) {
    if (error instanceof PayloadCeilingExceededError) throw error;
    throw createError.validation(SKILL_UPLOAD_UNREADABLE_MESSAGE);
  }
  const file = form.get(PLUGIN_UPLOAD_FILE_FIELD);
  if (!file || typeof file === 'string') {
    throw createError.validation(SKILL_UPLOAD_UNREADABLE_MESSAGE);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  let source: string;
  if (isZipArchive(bytes)) {
    try {
      source = (await readSingleSkillFromArchive(bytes)).content;
    } catch (error) {
      if (error instanceof PluginArchiveError) throw createError.validation(error.message);
      throw error;
    }
  } else {
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw createError.validation(SKILL_UPLOAD_NOT_UTF8_MESSAGE);
    }
  }

  const parsed = parseSkillDraftFromMarkdown(source);
  if (!parsed.ok) throw createError.validation(parsed.errors.join(' '));
  return parsed.draft;
}

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
      skills: dedupeByFirstClaimedName([
        ...dedupeByFirstClaimedName([...skills, ...directorySkills]).map((s) => ({
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
          ...(s.metadata.requires?.tools?.length
            ? { requiredTools: s.metadata.requires.tools }
            : {}),
        })),
        ...userSkills,
      ]),
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
  const uploaded = (request.headers.get('content-type') ?? '').includes(MULTIPART_CONTENT_TYPE);

  let draft;
  if (uploaded) {
    draft = await readUploadedSkillDraft(request);
  } else {
    const parsed = SkillDraftBodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      throw createError.validation('Invalid skill draft', parsed.error.issues);
    }
    draft = parsed.data;
  }

  const existingManaged = await findManagedDirectorySkillByName(draft.name);
  if (existingManaged) {
    throw createError.conflict(`"${draft.name}" is already a built-in skill name.`);
  }

  const created = await createUserSkill(db, userId, draft);
  return NextResponse.json({ skill: toUserSkillSummary(created) }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleListSkills));
export const POST = withCorsRoute(withErrorHandler(handleCreateSkill));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
