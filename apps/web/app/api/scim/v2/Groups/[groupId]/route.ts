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

export async function GET(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const row = await getScimGroup(context.db, context, groupId);
    if (!row) throw new ScimError(404, `Group ${groupId} not found`);
    const members = await getScimGroupMembers(context.db, context, row.id);
    return scimResponse(serializeScimGroup(row, members, baseUrl));
  });
}

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

export async function DELETE(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { groupId } = await routeContext.params;
  return withScim(request, async (context) => {
    await deleteScimGroup(context.db, context, groupId);
    return new Response(null, { status: 204 });
  });
}
