import 'server-only';

import type { NextRequest } from 'next/server';
import { scimSchemas } from '@/lib/server/scim/scim-protocol';
import { withScimDiscovery } from '@/lib/server/scim/scim-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scim/v2/Schemas — RFC 7644 §4.
 *
 * Lists only the attributes this provider actually persists and round-trips.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return withScimDiscovery(request, scimSchemas);
}
