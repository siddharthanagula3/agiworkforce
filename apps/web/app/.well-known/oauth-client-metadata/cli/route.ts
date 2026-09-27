import type { NextResponse } from 'next/server';

import { buildMcpNativeClientMetadataDocument } from '@/lib/connectors/mcp-client-metadata';

import { clientMetadataResponse } from '../client-metadata-response';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return clientMetadataResponse(buildMcpNativeClientMetadataDocument('cli'));
}
