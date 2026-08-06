import 'server-only';

import type { NextRequest } from 'next/server';
import { parseScimPatch, ScimError, scimResponse } from '@/lib/server/scim/scim-protocol';
import { readScimBody, withScim } from '@/lib/server/scim/scim-route';
import {
  deleteScimGroup,
  getScimGroup,
  getScimGroupMembers,
  parseScimGroupResource,
  patchScimGroup,
  replaceScimGroup,
  serializeScimGroup,
} from '@/lib/server/scim/scim-provisioning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ groupId: string }> };

/** GET /api/scim/v2/Groups/{id} */
export async function GET(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const row = await getScimGroup(context.db, context, groupId);
    if (!row) throw new ScimError(404, `Group ${groupId} not found`);
    const members = await getScimGroupMembers(context.db, context, row.id);
    return scimResponse(serializeScimGroup(row, members, baseUrl));
  });
}

/** PUT /api/scim/v2/Groups/{id} — replaces the member set wholesale. */
export async function PUT(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const parsed = parseScimGroupResource(body);
    const row = await replaceScimGroup(context.db, context, groupId, parsed);
    const members = await getScimGroupMembers(context.db, context, row.id);
    return scimResponse(serializeScimGroup(row, members, baseUrl));
  });
}

/**
 * PATCH /api/scim/v2/Groups/{id}.
 *
 * `add`/`remove` on `members` is how every IdP moves a person between groups,
 * and each affected member is re-reconciled against `organization_members`
 * afterwards so a role mapping change takes effect immediately.
 */
export async function PATCH(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const operations = parseScimPatch(body);
    const row = await patchScimGroup(context.db, context, groupId, operations);
    const members = await getScimGroupMembers(context.db, context, row.id);
    return scimResponse(serializeScimGroup(row, members, baseUrl));
  });
}

/** DELETE /api/scim/v2/Groups/{id} — members keep their accounts; only the
 * group and any role it mapped go away. */
export async function DELETE(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context) => {
    await deleteScimGroup(context.db, context, groupId);
    return new Response(null, { status: 204 });
  });
}
