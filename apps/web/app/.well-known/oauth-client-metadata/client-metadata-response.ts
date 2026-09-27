import { NextResponse } from 'next/server';

import type { McpClientMetadataDocument } from '@/lib/connectors/mcp-client-metadata';

export function clientMetadataResponse(document: McpClientMetadataDocument | null): NextResponse {
  if (!document) {
    return NextResponse.json(
      {
        error: 'not_available',
        error_description:
          'This deployment has no HTTPS origin configured, so it cannot publish a client metadata document.',
      },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(document, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
