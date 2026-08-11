import 'server-only';

/**
 * GET /api/projects/[id]/export — portable snapshot of one project.
 *
 * Only an account-wide GDPR export existed, which is the wrong granularity for
 * the common case: moving one project somewhere else, archiving a finished
 * piece of work, or handing a client their material. There was no project-level
 * export at all.
 *
 * OWNER ONLY, deliberately narrower than GET on the project itself. That route
 * also serves org-shared readers, but an export is a bulk extraction of every
 * knowledge file's text — a viewer on a shared project should not be able to
 * walk away with the whole corpus. Sharing grants reading in place, not
 * exfiltration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { mapProjectRow } from '@/lib/projects';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

type RouteContext = { params: Promise<{ id: string }> };

/** Schema version of the export envelope, so an importer can branch on it. */
const PROJECT_EXPORT_VERSION = 1;

function isSchemaNotReady(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703';
}

async function handleExportProject(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;
  const organizationId = await resolveActiveOrganizationId(db, userId);

  const [project] = await db.query<Record<string, unknown>>(
    `select * from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and deleted_at is null
      limit 1`,
    [id, userId, organizationId],
  );
  if (!project) {
    throw createError.notFound('Project not found');
  }

  // Knowledge files, with their extracted text so the export is self-contained
  // — a manifest of filenames the recipient cannot read would not be an export.
  // Superseded and deleted rows are excluded: the export mirrors the project as
  // it stands, not its edit history.
  let knowledgeFiles: Record<string, unknown>[] = [];
  try {
    knowledgeFiles = await db.query<Record<string, unknown>>(
      `select file_name, mime_type, byte_count, checksum_sha256, summary,
              source_surface, added_at, version,
              to_jsonb(project_knowledge_files)->>'extracted_text' as extracted_text
         from project_knowledge_files
        where project_id = $1 and deleted_at is null and superseded_at is null
        order by added_at asc`,
      [id],
    );
  } catch (error) {
    // A pre-migration deployment exports the project without its files rather
    // than failing the whole export.
    if (!isSchemaNotReady(error)) throw error;
  }

  const mapped = mapProjectRow(project);
  const fileName = `${
    String(mapped.name ?? 'project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'project'
  }-export.json`;

  const body = JSON.stringify(
    {
      version: PROJECT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      project: mapped,
      knowledgeFiles: knowledgeFiles.map((file) => ({
        fileName: file['file_name'],
        mimeType: file['mime_type'],
        byteCount: file['byte_count'],
        checksumSha256: file['checksum_sha256'],
        summary: file['summary'],
        sourceSurface: file['source_surface'],
        addedAt: file['added_at'],
        version: file['version'],
        extractedText: file['extracted_text'],
      })),
    },
    null,
    2,
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Downloads as a file rather than rendering in the tab.
      'Content-Disposition': `attachment; filename="${fileName}"`,
      // An export is a snapshot of live data; never let a proxy keep it.
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleExportProject));
// See the note in ../duplicate/route.ts: the preflight helper's signature does
// not satisfy Next 16's typed-route constraint when exported directly.
export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
