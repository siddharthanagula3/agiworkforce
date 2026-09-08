import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import {
  storeOwnedPluginSource,
  type OwnedPluginSkill,
} from '@/lib/services/plugin-owned-source-service';
import { pluginKeyFrom } from '@/features/plugins/server/directory/archive';
import { installsDisabledResponse } from '@/features/plugins/server/directory/install-responses';
import {
  CLAUDE_PLUGIN_SKILLS_DIRECTORY,
  CLAUDE_SKILL_FILE_NAME,
  PLUGIN_DIRECTORY_FALLBACK_VERSION,
  PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL,
  uploadUnusableNameMessage,
} from '@/features/plugins/server/directory/constants';
import { SkillDraftBodySchema } from '@/app/api/skills/skill-draft-schema';
import { buildSkillMarkdown, validateSkillDraft } from '@agiworkforce/skills';
import {
  PluginMarketplaceManifestPluginSchema,
  type PluginSourceInstallResponse,
} from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_KIND_AUTHORED = 'authored';
const INVALID_PLUGIN_CODE = 'PLUGIN_DRAFT_INVALID';
const DUPLICATE_SKILL_MESSAGE = 'Each skill in a plugin needs its own name.';
const INVALID_PLUGIN_MESSAGE = 'Give the plugin a name, a description and at least one skill.';

const AuthoredPluginBodySchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    skills: z.array(SkillDraftBodySchema).min(1).max(PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL),
  })
  .strict();

function rejected(message: string, issues?: readonly string[]): NextResponse {
  return NextResponse.json(
    { error: { code: INVALID_PLUGIN_CODE, message, ...(issues ? { issues } : {}) } },
    { status: 422 },
  );
}

function skillFilesOf(
  skills: readonly z.infer<typeof SkillDraftBodySchema>[],
): { files: OwnedPluginSkill[] } | { issues: string[] } {
  const seen = new Set<string>();
  const files: OwnedPluginSkill[] = [];
  const issues: string[] = [];
  for (const skill of skills) {
    const validation = validateSkillDraft(skill);
    if (!validation.ok) {
      issues.push(...validation.errors);
      continue;
    }
    if (seen.has(skill.name)) {
      issues.push(DUPLICATE_SKILL_MESSAGE);
      continue;
    }
    seen.add(skill.name);
    files.push({
      name: skill.name,
      path: `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}/${skill.name}/${CLAUDE_SKILL_FILE_NAME}`,
      content: buildSkillMarkdown(skill),
    });
  }
  return issues.length > 0 ? { issues } : { files };
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;

  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = AuthoredPluginBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: INVALID_PLUGIN_CODE, message: INVALID_PLUGIN_MESSAGE } },
      { status: 400 },
    );
  }

  const key = pluginKeyFrom(parsed.data.name);
  if (!key) return rejected(uploadUnusableNameMessage(parsed.data.name));

  const skillFiles = skillFilesOf(parsed.data.skills);
  if ('issues' in skillFiles) {
    return rejected(skillFiles.issues[0] ?? INVALID_PLUGIN_MESSAGE, skillFiles.issues);
  }
  const files = skillFiles.files;

  let declared;
  try {
    declared = PluginMarketplaceManifestPluginSchema.parse({
      id: key,
      name: parsed.data.name,
      description: parsed.data.description,
      version: PLUGIN_DIRECTORY_FALLBACK_VERSION,
      skills: files.map((file) => file.name),
      connectors: [],
      agents: [],
      examplePrompts: [],
      permissions: [],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return rejected(
        INVALID_PLUGIN_MESSAGE,
        error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    throw error;
  }

  try {
    const plugins = await storeOwnedPluginSource(db, userId, {
      kind: SOURCE_KIND_AUTHORED,
      sourceName: declared.name,
      plugins: [
        {
          key: declared.id,
          name: declared.name,
          description: declared.description,
          version: declared.version,
          skills: files,
        },
      ],
    });
    const body: PluginSourceInstallResponse = {
      sourceName: declared.name,
      kind: SOURCE_KIND_AUTHORED,
      plugins,
    };
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
