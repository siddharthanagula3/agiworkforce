import 'server-only';

import type { NextRequest } from 'next/server';
import { parseScimPatch, ScimError, scimResponse } from '@/lib/server/scim/scim-protocol';
import { readScimBody, withScim } from '@/lib/server/scim/scim-route';
import {
  deleteScimUser,
  getScimUser,
  getScimUserGroups,
  parseScimUserResource,
  parseScimResourceVersion,
  patchScimUser,
  replaceScimUser,
  serializeScimUser,
} from '@/lib/server/scim/scim-provisioning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const row = await getScimUser(context.db, context, userId);
    if (!row) throw new ScimError(404, `User ${userId} not found`);
    const groups = await getScimUserGroups(context.db, context, row.id);
    const resource = serializeScimUser(row, groups, baseUrl);
    return scimResponse(resource, 200, { etag: resource.meta.version });
  });
}

export async function PUT(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const parsed = parseScimUserResource(body);
    const expected = parseScimResourceVersion(request.headers.get('if-match'));
    const row = await replaceScimUser(context.db, context, userId, parsed, body, expected);
    const groups = await getScimUserGroups(context.db, context, row.id);
    const resource = serializeScimUser(row, groups, baseUrl);
    return scimResponse(resource, 200, { etag: resource.meta.version });
  });
}

export async function PATCH(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const operations = parseScimPatch(body);
    const expected = parseScimResourceVersion(request.headers.get('if-match'));
    const row = await patchScimUser(context.db, context, userId, operations, expected);
    const groups = await getScimUserGroups(context.db, context, row.id);
    const resource = serializeScimUser(row, groups, baseUrl);
    return scimResponse(resource, 200, { etag: resource.meta.version });
  });
}

export async function DELETE(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context) => {
    await deleteScimUser(
      context.db,
      context,
      userId,
      parseScimResourceVersion(request.headers.get('if-match')),
    );
    return new Response(null, { status: 204 });
  });
}
