import { NextRequest, NextResponse } from 'next/server';

import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { readJsonBody } from '@/lib/read-json-body';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  isPluginMarketplaceContentHash,
  ManagedSkillsResponseSchema,
  PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD,
} from '@agiworkforce/cloud-contracts';
import { SkillDraftBodySchema } from './skill-draft-schema';
import { parseUploadedSkillDraft, type SkillDraft } from '@agiworkforce/skills';
import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import {
  PluginArchiveError,
  readSingleSkillFromArchive,
} from '@/features/plugins/server/directory/archive';
import {
  PLUGIN_UPLOAD_FILE_FIELD,
  SKILL_UPLOAD_NOT_UTF8_MESSAGE,
  SKILL_UPLOAD_UNREADABLE_MESSAGE,
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
} from '@/features/plugins/server/directory/constants';
import {
  namesSkillArchive,
  skillArchiveFolder,
  skillUploadFolderMismatchMessage,
} from './skill-upload-rules';
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
  type UserSkillFileInput,
  type UserSkillUpload,
} from '@/lib/services/user-skill-service';
import {
  requireUserSkillAuthoring,
  userSkillAuthoringEnabled,
} from '@/lib/services/user-skill-authoring';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';
import { workspaceAllowsPlugins } from '@/lib/services/workspace-plugin-access';
import { listInstalledDirectorySkills } from '@/features/plugins/server/directory/installed-skills';
import { loadSkillOrigins } from '@/lib/services/skill-origin-service';
import { refuseUnsafeUpload } from '@/lib/security/upload-scan';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';

export const runtime = 'nodejs';

const CATALOG_PARAM = 'catalog';
const CATALOG_ALL = 'all';
const MULTIPART_CONTENT_TYPE = 'multipart/form-data';
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const ZIP_MIME = 'application/zip';
const MARKDOWN_MIME = 'text/markdown';
const MAX_LISTED_REQUIREMENTS = 20;

function isZipArchive(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte);
}

interface UploadedSkillDraft {
  draft: SkillDraft;
  upload: UserSkillUpload;
  omittedFiles: string[];
}

async function readUploadedSkillDraft(request: NextRequest): Promise<UploadedSkillDraft> {
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
  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : undefined;
  await refuseUnsafeUpload(bytes, isZipArchive(bytes) ? ZIP_MIME : MARKDOWN_MIME, {
    leadsObject: true,
    filename: fileName,
  });

  let source: string;
  let folder: string | null = null;
  let files: UserSkillFileInput[] = [];
  let omittedFiles: string[] = [];
  if (isZipArchive(bytes)) {
    try {
      const skill = await readSingleSkillFromArchive(bytes);
      const layout = skillArchiveFolder(skill.archivePath);
      if ('problem' in layout) throw createError.validation(layout.problem);
      folder = layout.folder;
      source = skill.content;
      files = skill.files;
      omittedFiles = skill.omittedFiles;
    } catch (error) {
      if (error instanceof PluginArchiveError) throw createError.validation(error.message);
      throw error;
    }
  } else if (namesSkillArchive(fileName)) {
    throw createError.validation(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  } else {
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw createError.validation(SKILL_UPLOAD_NOT_UTF8_MESSAGE);
    }
  }

  const parsed = parseUploadedSkillDraft(source);
  if (!parsed.ok) throw createError.validation(parsed.errors.join(' '));
  if (folder !== null && folder !== parsed.draft.name) {
    throw createError.validation(skillUploadFolderMismatchMessage(folder, parsed.draft.name));
  }
  const acknowledgedScans = form
    .getAll(PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD)
    .filter((value): value is string => isPluginMarketplaceContentHash(value));
  return { draft: parsed.draft, upload: { files, acknowledgedScans }, omittedFiles };
}

async function handleListSkills(request: NextRequest) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { db, userId } = await getUserScopedDb(request);
  const wholeCatalog = new URL(request.url).searchParams.get(CATALOG_PARAM) === CATALOG_ALL;
  const pluginsAllowed = await workspaceAllowsPlugins(db, userId);
  let skills;
  try {
    const enabledPluginIds = pluginsAllowed
      ? await listEnabledPluginIds(db, userId)
      : new Set<string>();
    const directory = await getManagedSkillDirectoryForPlugins(enabledPluginIds);
    skills = wholeCatalog ? directory : await resolveInstalledManagedSkills(db, userId, directory);
  } catch (error) {
    if (error instanceof SkillCatalogUnavailableError) {
      throw createError.internal('Failed to load skills');
    }
    throw error;
  }
  const canAuthorSkills = userSkillAuthoringEnabled();
  const userSkills = canAuthorSkills ? await listUserSkills(db, userId) : [];
  const directorySkills = pluginsAllowed ? await listInstalledDirectorySkills(db, userId) : [];
  const listed = dedupeByFirstClaimedName([...skills, ...directorySkills]);
  const originOf = await loadSkillOrigins(db, userId, listed);
  let body;
  try {
    body = ManagedSkillsResponseSchema.parse({
      skills: dedupeByFirstClaimedName([
        ...listed.map((s) => ({
          origin: originOf(s),
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
          ...(s.metadata.requires?.mcp?.length
            ? { requiredConnectors: s.metadata.requires.mcp.slice(0, MAX_LISTED_REQUIREMENTS) }
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
  requireUserSkillAuthoring();

  const { db, userId } = await getUserScopedDb(request);
  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'skills',
    resolveCloudChatSurface(request),
  );
  if (featureGate) return featureGate;
  const uploaded = (request.headers.get('content-type') ?? '').includes(MULTIPART_CONTENT_TYPE);

  let draft: SkillDraft;
  let upload: UploadedSkillDraft | null = null;
  if (uploaded) {
    upload = await readUploadedSkillDraft(request);
    draft = upload.draft;
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

  const created = await createUserSkill(db, userId, draft, upload?.upload);
  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'skill_installed',
    detail: {
      resourceType: 'skill',
      resourceId: draft.name,
      source: uploaded ? 'uploaded' : 'authored',
    },
  });
  return NextResponse.json(
    {
      skill: toUserSkillSummary(created),
      ...(upload && upload.omittedFiles.length > 0 ? { omittedFiles: upload.omittedFiles } : {}),
    },
    { status: 201 },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleListSkills));
export const POST = withCorsRoute(withErrorHandler(handleCreateSkill));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
