
import { NextResponse } from 'next/server';

import { buildMcpClientMetadataDocument } from '@/lib/connectors/mcp-client-metadata';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const document = buildMcpClientMetadataDocument();

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
