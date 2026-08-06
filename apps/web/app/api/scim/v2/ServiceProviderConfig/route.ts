import 'server-only';

import type { NextRequest } from 'next/server';
import { scimServiceProviderConfig } from '@/lib/server/scim/scim-protocol';
import { withScimDiscovery } from '@/lib/server/scim/scim-route';

// Argon2id token verification is a native module.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/scim/v2/ServiceProviderConfig — RFC 7644 §4.
 *
 * The document advertises only what is genuinely implemented: PATCH yes, bulk
 * no, sort no, ETag no. Claiming bulk support would make Okta send bulk
 * requests this provider rejects.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return withScimDiscovery(request, scimServiceProviderConfig);
}
