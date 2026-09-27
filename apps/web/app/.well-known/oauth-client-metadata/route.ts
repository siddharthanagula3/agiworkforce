import type { NextResponse } from 'next/server';

import { buildMcpClientMetadataDocument } from '@/lib/connectors/mcp-client-metadata';

import { clientMetadataResponse } from './client-metadata-response';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return clientMetadataResponse(buildMcpClientMetadataDocument());
}
