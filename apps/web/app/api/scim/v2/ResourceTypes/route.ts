import 'server-only';

import type { NextRequest } from 'next/server';
import { scimResourceTypes } from '@/lib/server/scim/scim-protocol';
import { withScimDiscovery } from '@/lib/server/scim/scim-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/scim/v2/ResourceTypes — RFC 7644 §4. Users and Groups only. */
export async function GET(request: NextRequest): Promise<Response> {
  return withScimDiscovery(request, scimResourceTypes);
}
