import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
  isConnectorTokenStorageAvailable,
  sealCustomConnectorCredential,
} from '@/lib/custom-connector-crypto';
import {
  evictCustomConnectorCaches,
  findUserCustomConnectorByUrl,
} from '@/lib/user-connector-tools';
import { resolveDirectoryTarget } from '@/lib/connectors/mcp-directory-targets';
import {
  resolveConnectorCredentialSpec,
  type ConnectorCredentialSpec,
} from '@/lib/connectors/mcp-credential-spec';
import {
  assertConnectorToolCapacity,
  assertCustomConnectorCapacity,
  CONNECTOR_UNREACHABLE_CODE,
  customConnectorId,
  insertCustomConnector,
  McpProbeError,
  probeMcpServer,
  updateCustomConnectorCredential,
  type CustomConnectorRow,
  type McpProbeResult,
} from '@/lib/connectors/mcp-custom-connections';
import { setCachedToolNames } from '@/lib/connectors/directory/tool-names-cache';

export const runtime = 'nodejs';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const RATE_LIMIT_BUCKET = 'chat-conversation';
const CONNECTOR_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const API_KEY_MAX_LENGTH = 4096;
const HEADER_PLACEMENT = 'header';
const CUSTOM_AUDIT_RESOURCE_TYPE = 'custom_mcp_connector';
const DIRECTORY_AUDIT_SOURCE = 'directory';
const NOT_FOUND_MESSAGE = 'Connector directory entry not found';

const BodySchema = z.object({ apiKey: z.string().trim().min(1).max(API_KEY_MAX_LENGTH) });

async function requireTarget(context: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await context.params;
  if (!CONNECTOR_REF_RE.test(connectorId))
    throw createError.validation('Invalid connector identifier');
  const target = await resolveDirectoryTarget(connectorId);
  if (!target) throw createError.notFound(NOT_FOUND_MESSAGE);
  return target;
}

function specView(spec: ConnectorCredentialSpec) {
  return {
    headerName: spec.headerName,
    valuePrefix: spec.valuePrefix,
    placement: spec.placement,
    source: spec.source,
    description: spec.description,
  };
}

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const limited = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (limited) return limited;

  const { userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const target = await requireTarget(context);
  const [spec, existing] = await Promise.all([
    resolveConnectorCredentialSpec(target),
    findUserCustomConnectorByUrl(userId, target.mcpUrl),
  ]);

  return NextResponse.json(
    {
      connectorId: target.connectorId,
      name: target.name,
      documentationUrl: target.documentationUrl,
      connected: existing !== null,
      ...specView(spec),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePost(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (limited) return limited;

  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const target = await requireTarget(context);

  if (!isConnectorTokenStorageAvailable()) {
    throw createError.serviceUnavailable(CONNECTOR_TOKEN_STORAGE_UNAVAILABLE);
  }

  const parsedBody = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) throw createError.validation('apiKey is required');
  const { apiKey } = parsedBody.data;

  const spec = await resolveConnectorCredentialSpec(target);
  if (spec.placement !== HEADER_PLACEMENT) {
    throw createError.validation(
      `${target.name} only accepts credentials in the request ${spec.placement}, which this app does not send.`,
    );
  }

  const parsedUrl = await validateHttpsMcpUrl(target.mcpUrl);
  const url = parsedUrl.toString();
  const credential = { headerName: spec.headerName, headerValue: `${spec.valuePrefix}${apiKey}` };
  const existing = await findUserCustomConnectorByUrl(userId, url);
  const capacity = existing ? null : await assertCustomConnectorCapacity(db, userId);

  let probe: McpProbeResult;
  try {
    probe = await probeMcpServer({
      serverName: target.serverId,
      url,
      transport: target.transport,
      headers: { [credential.headerName]: credential.headerValue },
      authorizationContext: `user:${userId}:custom-url:${url}`,
    });
  } catch (error) {
    if (error instanceof McpProbeError) {
      if (error.authChallenge) {
        throw createError.validation(`${target.name} rejected that API key.`);
      }
      const message = `${target.name} could not be reached: ${error.message}`;
      return NextResponse.json(
        { error: { code: CONNECTOR_UNREACHABLE_CODE, message }, message },
        { status: 502 },
      );
    }
    throw error;
  }

  if (capacity) assertConnectorToolCapacity(capacity.planTier, probe.toolCount);

  const credentialEnc = sealCustomConnectorCredential(credential);
  let saved: CustomConnectorRow;
  if (existing) {
    const updated = await updateCustomConnectorCredential(db, userId, existing.id, credentialEnc);
    if (!updated) throw createError.notFound(NOT_FOUND_MESSAGE);
    await evictCustomConnectorCaches(userId, existing.id);
    saved = updated;
  } else {
    saved = await insertCustomConnector(db, {
      userId,
      name: target.name,
      url,
      transport: target.transport,
      credentialEnc,
      connectorLimit: capacity?.connectorLimit ?? null,
    });
  }

  await setCachedToolNames(target.connectorId, probe.toolNames);

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: CUSTOM_AUDIT_RESOURCE_TYPE,
      resourceId: saved.id,
      resourceName: saved.name,
      connectorId: customConnectorId(saved.short_id),
      subjectRef: target.connectorId,
      transport: saved.transport,
      source: DIRECTORY_AUDIT_SOURCE,
    },
  });

  return NextResponse.json(
    {
      connector: {
        id: saved.id,
        connectorId: target.connectorId,
        toolConnectorId: customConnectorId(saved.short_id),
        directoryId: target.connectorId,
        name: saved.name,
        url: saved.url,
        transport: saved.transport,
        source: 'custom',
        connectedAt: saved.created_at,
        updatedAt: saved.updated_at,
      },
      toolCount: probe.toolCount,
      toolNames: probe.toolNames,
      capabilityCounts: probe.capabilityCounts,
      protocolEra: probe.protocolEra,
      ...specView(spec),
    },
    { status: existing ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
