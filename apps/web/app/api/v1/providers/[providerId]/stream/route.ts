import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getEnv } from '@/utils/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/v1/providers/:providerId/stream — proxy to api-gateway provider stream.
 *
 * The api-gateway emits text/event-stream; we forward chunks to the browser
 * unmodified so the client SSE consumer in lib/providerStreamClient.ts can
 * parse them directly.
 *
 * Forwards Authorization header from the browser; never injects server-side
 * keys (those are pinned to the gateway). For Vercel deployments, set
 * API_GATEWAY_URL to the Fly.io / Render URL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
): Promise<Response> {
  const { providerId } = await params;
  const gatewayUrl = getEnv('API_GATEWAY_URL', 'http://localhost:3000').replace(/\/+$/, '');
  const authHeader = request.headers.get('authorization') ?? '';
  const csrfHeader = request.headers.get('x-requested-with') ?? 'agiworkforce-web';
  const body = await request.text();

  const upstream = await fetch(
    `${gatewayUrl}/api/v1/providers/${encodeURIComponent(providerId)}/stream`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': csrfHeader,
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      body,
      // @ts-expect-error — Next.js Node runtime accepts duplex on streamed bodies.
      duplex: 'half',
    },
  );

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    return NextResponse.json(
      { error: errText || `Upstream error ${upstream.status}` },
      { status: upstream.status || 502 },
    );
  }

  // Pass the SSE stream straight through.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
