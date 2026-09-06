import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { loadUserConnectorCapabilityCatalog } from '@/lib/user-connector-tools';

export const runtime = 'nodejs';

const CONNECTOR_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;

  const { connectorId: encodedRef } = await context.params;
  const connectorRef = encodedRef;
  if (!CONNECTOR_REF_RE.test(connectorRef)) {
    throw createError.validation('Invalid connector identifier');
  }

  const { userId } = await getUserScopedDb(request);
  const resolved = await loadUserConnectorCapabilityCatalog(userId, connectorRef);
  if (!resolved) throw createError.notFound('Connected connector not found');

  const server = resolved.catalog.servers[resolved.connectorId];
  if (!server) throw createError.serviceUnavailable('Connector is temporarily unreachable');

  return NextResponse.json(
    {
      connectorId: resolved.connectorId,
      connectorLabel: resolved.connectorLabel,
      source: resolved.source,
      generatedAt: resolved.catalog.generatedAt,
      protocolEra: server.protocolEra,
      protocolVersion: server.protocolVersion,
      serverInfo: server.serverInfo,
      capabilityKeys: Object.keys(server.capabilities).sort(),
      tasksSupported: server.tasksSupported,
      tools: server.tools.map((tool) => ({
        name: tool.toolName,
        title: tool.title,
        visibility: tool.visibility,
        hasApp: Boolean(tool.app),
      })),
      resources: server.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        mimeType: resource.mimeType,
        size: resource.size,
        isApp: resource.isApp,
      })),
      resourceTemplates: server.resourceTemplates.map((template) => ({
        uriTemplate: template.uriTemplate,
        name: template.name,
        title: template.title,
        mimeType: template.mimeType,
      })),
      prompts: server.prompts.map((prompt) => ({
        name: prompt.name,
        title: prompt.title,
        arguments: prompt.arguments,
      })),
      apps: server.apps,
      discoveryErrors: server.discoveryErrors,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
