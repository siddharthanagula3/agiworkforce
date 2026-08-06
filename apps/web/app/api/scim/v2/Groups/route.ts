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

/**
 * GET /api/scim/v2/Groups — supports `displayName eq "x"` and `externalId eq`,
 * plus 1-based pagination, scoped to the token's connection.
 */
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

/**
 * POST /api/scim/v2/Groups.
 *
 * A new group carries no role mapping. Mapping a group to an organization role
 * is a deliberate admin action in the AGI console — an IdP must not be able to
 * decide, by naming a group, what privileges its members receive.
 */
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
