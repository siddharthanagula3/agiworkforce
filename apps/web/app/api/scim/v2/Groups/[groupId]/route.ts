import 'server-only';

import type { NextRequest } from 'next/server';
import { parseScimPatch, ScimError, scimResponse } from '@/lib/server/scim/scim-protocol';
import { readScimBody, withScim } from '@/lib/server/scim/scim-route';
import {
  deleteScimGroup,
  getScimGroup,
  getScimGroupMembers,
  parseScimGroupResource,
  parseScimResourceVersion,
  patchScimGroup,
  replaceScimGroup,
  serializeScimGroup,
} from '@/lib/server/scim/scim-provisioning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ groupId: string }> };

export async function GET(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const row = await getScimGroup(context.db, context, groupId);
    if (!row) throw new ScimError(404, `Group ${groupId} not found`);
    const members = await getScimGroupMembers(context.db, context, row.id);
    const resource = serializeScimGroup(row, members, baseUrl);
    return scimResponse(resource, 200, { etag: resource.meta.version });
  });
}

export async function PUT(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const parsed = parseScimGroupResource(body);
    const expected = parseScimResourceVersion(request.headers.get('if-match'));
    const row = await replaceScimGroup(context.db, context, groupId, parsed, expected);
    const members = await getScimGroupMembers(context.db, context, row.id);
    const resource = serializeScimGroup(row, members, baseUrl);
    return scimResponse(resource, 200, { etag: resource.meta.version });
  });
}

export async function PATCH(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const operations = parseScimPatch(body);
    const expected = parseScimResourceVersion(request.headers.get('if-match'));
    const row = await patchScimGroup(context.db, context, groupId, operations, expected);
    const members = await getScimGroupMembers(context.db, context, row.id);
    const resource = serializeScimGroup(row, members, baseUrl);
    return scimResponse(resource, 200, { etag: resource.meta.version });
  });
}

export async function DELETE(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context) => {
    await deleteScimGroup(
      context.db,
      context,
      groupId,
      parseScimResourceVersion(request.headers.get('if-match')),
    );
    return new Response(null, { status: 204 });
  });
}
