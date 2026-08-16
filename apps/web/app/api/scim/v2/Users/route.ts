import 'server-only';

import type { NextRequest } from 'next/server';
import {
  parseScimPagination,
  parseScimUserFilter,
  scimListResponse,
  scimResponse,
} from '@/lib/server/scim/scim-protocol';
import { readScimBody, withScim } from '@/lib/server/scim/scim-route';
import {
  createScimUser,
  getScimUserGroups,
  listScimUsers,
  parseScimUserResource,
  serializeScimUser,
} from '@/lib/server/scim/scim-provisioning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return withScim(request, async (context, baseUrl) => {
    const params = new URL(request.url).searchParams;
    const filter = parseScimUserFilter(params.get('filter'));
    const pagination = parseScimPagination(params);

    const { rows, total } = await listScimUsers(context.db, context, filter, pagination);

    const resources = await Promise.all(
      rows.map(async (row) =>
        serializeScimUser(row, await getScimUserGroups(context.db, context, row.id), baseUrl),
      ),
    );

    return scimResponse(scimListResponse(resources, total, pagination));
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const parsed = parseScimUserResource(body);

    const row = await createScimUser(context.db, context, parsed, body);
    const groups = await getScimUserGroups(context.db, context, row.id);

    return scimResponse(serializeScimUser(row, groups, baseUrl), 201, {
      location: `${baseUrl}/Users/${row.id}`,
    });
  });
}
