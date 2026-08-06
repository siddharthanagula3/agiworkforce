import 'server-only';

import type { NextRequest } from 'next/server';
import { parseScimPatch, ScimError, scimResponse } from '@/lib/server/scim/scim-protocol';
import { readScimBody, withScim } from '@/lib/server/scim/scim-route';
import {
  deleteScimUser,
  getScimUser,
  getScimUserGroups,
  parseScimUserResource,
  patchScimUser,
  replaceScimUser,
  serializeScimUser,
} from '@/lib/server/scim/scim-provisioning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

/** GET /api/scim/v2/Users/{id} */
export async function GET(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const row = await getScimUser(context.db, context, userId);
    if (!row) throw new ScimError(404, `User ${userId} not found`);
    const groups = await getScimUserGroups(context.db, context, row.id);
    return scimResponse(serializeScimUser(row, groups, baseUrl));
  });
}

/**
 * PUT /api/scim/v2/Users/{id} — full replacement (RFC 7644 §3.5.1).
 *
 * `active: false` in the replacement body removes the organization membership,
 * exactly as a PATCH would.
 */
export async function PUT(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const parsed = parseScimUserResource(body);
    const row = await replaceScimUser(context.db, context, userId, parsed, body);
    const groups = await getScimUserGroups(context.db, context, row.id);
    return scimResponse(serializeScimUser(row, groups, baseUrl));
  });
}

/**
 * PATCH /api/scim/v2/Users/{id} — RFC 7644 §3.5.2.
 *
 * This is how Okta deprovisions (`replace` on `active`) and how Entra sends
 * the same change path-lessly as `{"value": {"active": false}}`. Both shapes
 * are honoured; an unrecognised path is refused with `invalidPath` rather than
 * silently ignored, because an ignored deprovision that returns 200 is the
 * worst failure this surface can have.
 */
export async function PATCH(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const operations = parseScimPatch(body);
    const row = await patchScimUser(context.db, context, userId, operations);
    const groups = await getScimUserGroups(context.db, context, row.id);
    return scimResponse(serializeScimUser(row, groups, baseUrl));
  });
}

/**
 * DELETE /api/scim/v2/Users/{id} — hard deprovision.
 *
 * The organization membership is removed first, then the SCIM resource, so a
 * partial failure still ends in the person having lost access. 204 with no
 * body, per RFC 7644 §3.6.
 */
export async function DELETE(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context) => {
    await deleteScimUser(context.db, context, userId);
    return new Response(null, { status: 204 });
  });
}
