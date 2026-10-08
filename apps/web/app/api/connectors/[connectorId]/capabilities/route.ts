import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTOR_REF_PATTERN,
  type ConnectorCapabilityCatalog,
  type ConnectorToolParameter,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { loadUserConnectorCapabilityCatalog } from '@/lib/user-connector-tools';
import { rethrowConnectorUnreachable } from '@/lib/connectors/reachable-mcp-handle';
import { plainMcpServerText } from '@/lib/connectors/mcp-untrusted-text';
import { resolveConnectorToolMetadata } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';

export const runtime = 'nodejs';

function toolParameters(inputSchema: Record<string, unknown>): ConnectorToolParameter[] {
  const properties = inputSchema['properties'];
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];
  const required = new Set(
    Array.isArray(inputSchema['required'])
      ? inputSchema['required'].filter((name): name is string => typeof name === 'string')
      : [],
  );
  return Object.entries(properties as Record<string, unknown>).map(([name, raw]) => {
    const property =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const type = typeof property['type'] === 'string' ? property['type'] : undefined;
    const description = plainMcpServerText(
      typeof property['description'] === 'string' ? property['description'] : undefined,
    );
    return {
      name,
      required: required.has(name),
      ...(type ? { type } : {}),
      ...(description ? { description } : {}),
    };
  });
}

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;

  const { connectorId: encodedRef } = await context.params;
  const connectorRef = encodedRef;
  if (!CONNECTOR_REF_PATTERN.test(connectorRef)) {
    throw createError.validation('Invalid connector identifier');
  }

  const { userId } = await getUserScopedDb(request);
  const resolved = await loadUserConnectorCapabilityCatalog(userId, connectorRef).catch(
    rethrowConnectorUnreachable,
  );
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
      supportedVersions: server.discover?.supportedVersions ?? [],
      transport: server.transport,
      serverInfo: server.serverInfo,
      capabilityKeys: Object.keys(server.capabilities).sort(),
      tasksSupported: server.tasksSupported,
      rejectedTools: server.rejectedTools ?? [],
      tools: server.tools.map((tool) => ({
        name: tool.toolName,
        title: plainMcpServerText(tool.title),
        description: plainMcpServerText(tool.description),
        parameters: toolParameters(tool.inputSchema),
        visibility: tool.visibility,
        hasApp: Boolean(tool.app),
        readOnly:
          resolveConnectorToolMetadata(resolved.connectorId, tool.toolName).actionClass === 'read',
      })),
      resources: server.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        title: plainMcpServerText(resource.title),
        mimeType: resource.mimeType,
        size: resource.size,
        isApp: resource.isApp,
      })),
      resourceTemplates: server.resourceTemplates.map((template) => ({
        uriTemplate: template.uriTemplate,
        name: template.name,
        title: plainMcpServerText(template.title),
        mimeType: template.mimeType,
      })),
      prompts: server.prompts.map((prompt) => ({
        name: prompt.name,
        title: plainMcpServerText(prompt.title),
        arguments: prompt.arguments,
      })),
      apps: server.apps,
      discoveryErrors: server.discoveryErrors,
    } satisfies ConnectorCapabilityCatalog,
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
