/**
 * /api/projects/preview — server-side ProjectHeaderPresentation derivation.
 *
 * Round-10 service-layer slice. Exposes the canonical
 * `summarizeProjectHeader()` from `@agiworkforce/types` as a stateless
 * Next.js API route so future host code (SSR pages, mobile via fetch, the
 * Tauri shell when it bridges to web endpoints, etc.) can request the
 * same presentation shape that Web/Desktop/Mobile compute client-side.
 *
 * Pure derivation — no database, no auth. The endpoint accepts a partial
 * ProjectRecord (validated minimally; bad shapes return 400) and returns
 * the derived `ProjectHeaderPresentation`. This proves the cross-language
 * contract (TS / Rust / Postgres) is wire-ready end-to-end at the service
 * layer.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  DEVELOPER_SESSION_SURFACES,
  PRIVACY_MODES,
  PROVIDER_MODES,
  SYNCED_APP_SURFACES,
  summarizeProjectHeader,
  type PrivacyMode,
  type ProjectRecord,
  type ProviderMode,
  type SourceSurface,
} from '@agiworkforce/types';

const ALL_SOURCE_SURFACES: readonly SourceSurface[] = [
  ...SYNCED_APP_SURFACES,
  ...DEVELOPER_SESSION_SURFACES,
];

interface PreviewRequestBody {
  project?: Partial<ProjectRecord> & {
    id?: string;
    name?: string;
    defaultPrivacyMode?: string;
    defaultProviderMode?: string;
    allowedSurfaces?: unknown;
  };
  defaultModelLabel?: string;
  lastUsedRelativeLabel?: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function pickPrivacyMode(value: unknown): PrivacyMode {
  return (PRIVACY_MODES as readonly string[]).includes(value as string)
    ? (value as PrivacyMode)
    : 'local';
}

function pickProviderMode(value: unknown): ProviderMode {
  return (PROVIDER_MODES as readonly string[]).includes(value as string)
    ? (value as ProviderMode)
    : 'Local';
}

function pickSurfaces(value: unknown): SourceSurface[] {
  if (!Array.isArray(value)) return ['web', 'desktop', 'mobile'];
  const known = ALL_SOURCE_SURFACES as readonly string[];
  return value.filter(
    (entry): entry is SourceSurface => typeof entry === 'string' && known.includes(entry),
  );
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PreviewRequestBody;
  try {
    body = (await request.json()) as PreviewRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const projectInput = body.project;
  if (!projectInput || !isString(projectInput.id) || !isString(projectInput.name)) {
    return NextResponse.json(
      { error: 'project.id and project.name are required strings' },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const record: ProjectRecord = {
    id: projectInput.id,
    ownerUserId: isString(projectInput.ownerUserId) ? projectInput.ownerUserId : 'preview-user',
    organizationId: isString(projectInput.organizationId) ? projectInput.organizationId : null,
    name: projectInput.name,
    description: isString(projectInput.description) ? projectInput.description : null,
    defaultPrivacyMode: pickPrivacyMode(projectInput.defaultPrivacyMode),
    defaultProviderMode: pickProviderMode(projectInput.defaultProviderMode),
    allowedSurfaces: pickSurfaces(projectInput.allowedSurfaces),
    instructions: isString(projectInput.instructions) ? projectInput.instructions : null,
    defaultModelId: isString(projectInput.defaultModelId) ? projectInput.defaultModelId : null,
    knowledgeFileCount:
      typeof projectInput.knowledgeFileCount === 'number' ? projectInput.knowledgeFileCount : null,
    memberCount: typeof projectInput.memberCount === 'number' ? projectInput.memberCount : null,
    lastUsedAt: isString(projectInput.lastUsedAt) ? projectInput.lastUsedAt : null,
    iconEmoji: isString(projectInput.iconEmoji) ? projectInput.iconEmoji : null,
    accentColor:
      projectInput.accentColor === 'emerald' ||
      projectInput.accentColor === 'sky' ||
      projectInput.accentColor === 'amber' ||
      projectInput.accentColor === 'rose' ||
      projectInput.accentColor === 'violet' ||
      projectInput.accentColor === 'zinc'
        ? projectInput.accentColor
        : null,
    importedFrom:
      projectInput.importedFrom === 'claude' ||
      projectInput.importedFrom === 'openai' ||
      projectInput.importedFrom === 'manual'
        ? projectInput.importedFrom
        : null,
    createdAt: isString(projectInput.createdAt) ? projectInput.createdAt : nowIso,
    updatedAt: isString(projectInput.updatedAt) ? projectInput.updatedAt : nowIso,
  };

  const presentation = summarizeProjectHeader({
    project: record,
    defaultModelLabel: isString(body.defaultModelLabel) ? body.defaultModelLabel : undefined,
    lastUsedRelativeLabel: isString(body.lastUsedRelativeLabel)
      ? body.lastUsedRelativeLabel
      : undefined,
  });

  return NextResponse.json({ presentation }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'method_not_allowed',
      hint: 'POST a body with { project: ProjectRecord, defaultModelLabel?, lastUsedRelativeLabel? }',
    },
    { status: 405 },
  );
}
