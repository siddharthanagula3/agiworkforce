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

export async function GET(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context, baseUrl) => {
    const row = await getScimUser(context.db, context, userId);
    if (!row) throw new ScimError(404, `User ${userId} not found`);
    const groups = await getScimUserGroups(context.db, context, row.id);
    return scimResponse(serializeScimUser(row, groups, baseUrl));
  });
}

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

export async function DELETE(request: NextRequest, routeContext: RouteContext): Promise<Response> {
  const { userId } = await routeContext.params;
  return withScim(request, async (context) => {
    await deleteScimUser(context.db, context, userId);
    return new Response(null, { status: 204 });
  });
}
