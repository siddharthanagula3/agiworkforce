import 'server-only';

import type { NextRequest } from 'next/server';
import { scimResourceTypes } from '@/lib/server/scim/scim-protocol';
import { withScimDiscovery } from '@/lib/server/scim/scim-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  return withScimDiscovery(request, scimResourceTypes);
}
