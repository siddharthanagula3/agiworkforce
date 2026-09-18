import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createError } from '@/lib/errors';

export const IF_MATCH_HEADER = 'if-match';
export const WORKSPACE_REVISION_HEADER = 'x-workspace-revision';

const ETAG_PATTERN = /^(?:W\/)?"wsrev-(\d+)"$/;

/**
 * Every write to the admin policy, the model policy, the connector policy, an
 * override, a role or a role grant appends one row to
 * `organization_policy_revisions` (0201). One counter therefore versions the
 * whole administration surface, and one If-Match covers a role write and a
 * policy write alike.
 */
export async function readWorkspaceRevision(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<number> {
  const [row] = await db.query<{ revision: number | string | null }>(
    `select coalesce(max(revision), 0) as revision
       from public.organization_policy_revisions
      where organization_id = $1`,
    [organizationId],
  );
  const value =
    typeof row?.revision === 'string' ? Number.parseInt(row.revision, 10) : row?.revision;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function workspaceRevisionETag(revision: number): string {
  return `W/"wsrev-${revision}"`;
}

/**
 * Reads the caller's expected revision. `null` means the caller did not state
 * one, which stays allowed so existing clients keep working; `*` is the
 * standard "any current state" and is treated the same way.
 */
export function readExpectedWorkspaceRevision(request: Request): number | null {
  const raw = request.headers.get(IF_MATCH_HEADER)?.trim();
  if (!raw || raw === '*') return null;
  const match = ETAG_PATTERN.exec(raw);
  if (!match?.[1]) {
    throw createError
      .validation(
        'If-Match must be the workspace revision tag returned by this endpoint, for example W/"wsrev-12".',
      )
      .asUserSafe();
  }
  return Number.parseInt(match[1], 10);
}

export async function assertWorkspaceRevisionUnchanged(
  db: DatabaseAdapter,
  organizationId: string,
  expected: number | null,
): Promise<number> {
  const current = await readWorkspaceRevision(db, organizationId);
  if (expected !== null && expected !== current) {
    throw createError
      .conflict(
        `Another administrator changed this workspace while you were editing. Reload and reapply your change. Expected revision ${expected}, the workspace is at ${current}.`,
      )
      .asUserSafe();
  }
  return current;
}

export function withWorkspaceRevisionHeaders(response: Response, revision: number): Response {
  response.headers.set('ETag', workspaceRevisionETag(revision));
  response.headers.set(WORKSPACE_REVISION_HEADER, String(revision));
  return response;
}
