import 'server-only';

import type { NextRequest } from 'next/server';
import {
  parseScimGroupFilter,
  parseScimPagination,
  scimListResponse,
  scimResponse,
} from '@/lib/server/scim/scim-protocol';
import { readScimBody, withScim } from '@/lib/server/scim/scim-route';
import {
  createScimGroup,
  getScimGroupMembers,
  listScimGroups,
  parseScimGroupResource,
  serializeScimGroup,
} from '@/lib/server/scim/scim-provisioning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return withScim(request, async (context, baseUrl) => {
    const params = new URL(request.url).searchParams;
    const filter = parseScimGroupFilter(params.get('filter'));
    const pagination = parseScimPagination(params);

    const { rows, total } = await listScimGroups(context.db, context, filter, pagination);

    const resources = await Promise.all(
      rows.map(async (row) =>
        serializeScimGroup(row, await getScimGroupMembers(context.db, context, row.id), baseUrl),
      ),
    );

    return scimResponse(scimListResponse(resources, total, pagination));
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return withScim(request, async (context, baseUrl) => {
    const body = await readScimBody(request);
    const parsed = parseScimGroupResource(body);

    const row = await createScimGroup(context.db, context, parsed);
    const members = await getScimGroupMembers(context.db, context, row.id);

    return scimResponse(serializeScimGroup(row, members, baseUrl), 201, {
      location: `${baseUrl}/Groups/${row.id}`,
    });
  });
}
