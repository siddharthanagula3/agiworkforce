import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { readIdempotencyKey, withIdempotentWrite } from '@/lib/server/idempotency';
import {
  assertWorkspaceRevisionUnchanged,
  readExpectedWorkspaceRevision,
  readWorkspaceRevision,
  withWorkspaceRevisionHeaders,
} from '@/lib/server/workspace-revision';
import {
  McpProbeError,
  probeMcpServer,
  transportForUrl,
  type McpCapabilityCounts,
} from '@/lib/connectors/mcp-custom-connections';
import { readConnectorPolicy } from '@/lib/services/connector-policy-service';
import {
  evaluateMcpHostAccess,
  type ConnectorAccessPolicy,
} from '@/lib/services/connector-policy-evaluator';
import {
  listOrgMcpServers,
  publishOrgMcpServer,
  updateOrgMcpServer,
  type OrgMcpServer,
} from './org-mcp-servers';
import {
  requireWorkspaceConsolePermission,
  resolveWorkspaceConsoleAccess,
} from '../workspace-access';

export const runtime = 'nodejs';

const PublishSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    url: z.string().trim().url().max(2048),
    transport: z.enum(['sse', 'streamable-http']).optional(),
    published: z.boolean().optional(),
  })
  .strict();

const UpdateSchema = z
  .object({
    serverId: z.string().uuid(),
    published: z.boolean().optional(),
    retired: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.published !== undefined || body.retired !== undefined, {
    message: 'Say what to change: published, retired, or both.',
  });

export interface OrgMcpServersResponse {
  organizationId: string;
  canManage: boolean;
  servers: OrgMcpServer[];
  revision: number;
}

interface PublishedServer {
  server: OrgMcpServer;
  capabilities: McpCapabilityCounts;
}

function present(
  organizationId: string,
  canManage: boolean,
  servers: OrgMcpServer[],
  revision: number,
): OrgMcpServersResponse {
  return { organizationId, canManage, servers, revision };
}

/**
 * An https URL, on a host the workspace's own policy permits. The policy is the
 * administrator's own, so this is not a restriction on them, it is the check
 * that stops a workspace publishing a server its members would then be refused.
 */
function requirePublishableUrl(raw: string, policy: ConnectorAccessPolicy | null): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw createError.validation('That is not a URL.').asUserSafe();
  }
  if (url.protocol !== 'https:') {
    throw createError.validation('An MCP server must be reached over https.').asUserSafe();
  }
  const decision = evaluateMcpHostAccess(policy, url.toString());
  if (!decision.allowed) {
    throw createError.validation(decision.reason).asUserSafe();
  }
  return url;
}

async function respondWithServers(
  organizationId: string,
  canManage: boolean,
): Promise<NextResponse> {
  const db = getNeonDb();
  const [servers, revision] = await Promise.all([
    listOrgMcpServers(db, organizationId),
    readWorkspaceRevision(db, organizationId),
  ]);
  return withWorkspaceRevisionHeaders(
    NextResponse.json(present(organizationId, canManage, servers, revision)),
    revision,
  ) as NextResponse;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { organizationId, access } = await resolveWorkspaceConsoleAccess(request);
  return respondWithServers(organizationId, access.permissions.has('policy.manage'));
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    'Your workspace role does not allow publishing an MCP server to this workspace.',
  );

  const body = await readValidatedJsonBody(request, PublishSchema, 'Invalid MCP server');
  const db = getNeonDb();
  const expected = readExpectedWorkspaceRevision(request);
  await assertWorkspaceRevisionUnchanged(db, organizationId, expected);

  const policy = await readConnectorPolicy(db, organizationId);
  const url = requirePublishableUrl(body.url, policy);
  const transport = transportForUrl(url, body.transport);
  const idempotencyKey = readIdempotencyKey(request);

  const publish = async () => {
    // Reached before the row exists: a server the workspace cannot connect to
    // would be published to every member as something that only ever errors.
    let capabilities: McpCapabilityCounts;
    try {
      const probe = await probeMcpServer({
        serverName: body.name,
        url: url.toString(),
        transport,
        authorizationContext: userId,
      });
      capabilities = probe.capabilityCounts;
    } catch (error) {
      if (error instanceof McpProbeError) {
        throw createError
          .validation(
            error.authChallenge
              ? `${url.host} needs authorization before it can be published. Connect it once as a custom connector so this workspace holds a credential for it.`
              : `${url.host} could not be reached: ${error.message}`,
          )
          .asUserSafe();
      }
      throw error;
    }

    const server = await publishOrgMcpServer(db, {
      organizationId,
      name: body.name,
      description: body.description ?? null,
      url: url.toString(),
      transport,
      published: body.published ?? true,
      actorUserId: userId,
    });

    await recordAuditEvent({
      userId,
      eventType: 'admin_policy_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'organization_mcp_server',
        resourceId: server.id,
        resourceName: server.name,
        status: server.published ? 'published' : 'created',
      },
    });

    return { replayed: false, status: 201, body: { server, capabilities } };
  };

  if (idempotencyKey === null) {
    const created = await publish();
    return NextResponse.json(created.body, { status: created.status });
  }

  const result = await withIdempotentWrite<PublishedServer>(
    db,
    {
      organizationId,
      scope: 'organization-mcp-servers:publish',
      actorId: userId,
      key: idempotencyKey,
      requestBody: body,
    },
    publish,
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Idempotency-Replayed': result.replayed ? 'true' : 'false' },
  });
}

async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    'Your workspace role does not allow changing this workspace’s MCP servers.',
  );

  const body = await readValidatedJsonBody(request, UpdateSchema, 'Invalid MCP server change');
  const db = getNeonDb();
  await assertWorkspaceRevisionUnchanged(
    db,
    organizationId,
    readExpectedWorkspaceRevision(request),
  );

  const change = async () => {
    const server = await updateOrgMcpServer(db, {
      organizationId,
      serverId: body.serverId,
      ...(body.published !== undefined ? { published: body.published } : {}),
      ...(body.retired !== undefined ? { retired: body.retired } : {}),
      actorUserId: userId,
    });
    if (!server) throw createError.notFound('That MCP server is not published by this workspace.');

    await recordAuditEvent({
      userId,
      eventType: 'admin_policy_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'organization_mcp_server',
        resourceId: server.id,
        resourceName: server.name,
        status: server.retiredAt ? 'retired' : server.published ? 'published' : 'unpublished',
      },
    });
    return { replayed: false, status: 200, body: { server } };
  };

  const idempotencyKey = readIdempotencyKey(request);
  if (idempotencyKey !== null) {
    await withIdempotentWrite<{ server: OrgMcpServer }>(
      db,
      {
        organizationId,
        scope: 'organization-mcp-servers:update',
        actorId: userId,
        key: idempotencyKey,
        requestBody: body,
      },
      change,
    );
  } else {
    await change();
  }

  return respondWithServers(organizationId, access.permissions.has('policy.manage'));
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const PATCH = withErrorHandler(handlePatch);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
