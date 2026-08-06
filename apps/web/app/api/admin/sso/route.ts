import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import type { SSOConnectionRow } from '@/lib/server/neon-types';
import { SSO_CONNECTION_SELECT_COLUMNS, toConnectionView } from '@/lib/server/sso/connection-view';
import {
  issueDomainVerificationToken,
  domainVerificationInstructions,
} from '@/lib/server/sso/domain-verification';
import {
  assertClaimableDomain,
  assertSafeAttributeMapping,
  assertSafeIdpUrl,
  assertSafeMetadataXml,
  IdpValidationError,
  rawAttributeMapping,
} from '@/lib/server/sso/idp-metadata';
import {
  authorizeSSORequest,
  requireOrgRole,
  ssoErrorResponse,
} from '@/lib/server/sso/sso-route-guard';
import {
  deleteConnection,
  setConnectionActive,
  ClerkNotProvisionedError,
} from '@/lib/server/sso/clerk-enterprise-connections';

/**
 * Enterprise SSO connection management (managed cloud only).
 *
 * GET    /api/admin/sso                - Connections for orgs the caller administers
 * GET    /api/admin/sso?orgId=<uuid>   - Connections for one org (owner or admin)
 * POST   /api/admin/sso                - Register a connection draft (owner only)
 * DELETE /api/admin/sso?id=<uuid>      - Deactivate, or &hard=true to remove (owner only)
 *
 * Every handler is gated on `enterprise_controls`. A connection created here is
 * dormant: it is not provisioned with the identity provider and cannot sign
 * anyone in until the claimed email domain is proven by DNS TXT
 * (POST /api/admin/sso/verify-domain) and the connection is configured and
 * activated (PATCH /api/admin/sso/[id]).
 *
 * This deployment does not use Clerk Organizations, so Clerk enterprise
 * connections are instance-level and route every sign-in on a matching email
 * domain. Domain verification is therefore a security precondition, not a
 * formality.
 */

export const runtime = 'nodejs';

const ENDPOINT = '/api/admin/sso';

const CreateSSOConnectionSchema = z
  .object({
    organization_id: z.string().uuid(),
    provider_type: z.enum(['saml', 'oidc']),
    domain: z.string().min(3).max(253),
    display_name: z.string().min(1).max(200).optional(),
    metadata_url: z.string().max(2048).optional(),
    metadata_xml: z.string().max(500_000).optional(),
    oidc_discovery_url: z.string().max(2048).optional(),
    oidc_client_id: z.string().min(1).max(512).optional(),
    attribute_mapping: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * Normalize and harden the caller's payload. Every externally supplied value
 * that could reach an outbound fetch, an XML parser, or an authentication
 * routing decision is validated here before it touches the database.
 */
function normalizeCreateInput(
  input: z.infer<typeof CreateSSOConnectionSchema>,
  rawMapping: Record<string, unknown> | undefined,
) {
  const domain = assertClaimableDomain(input.domain);
  const attributeMapping = assertSafeAttributeMapping(rawMapping);

  if (input.provider_type === 'saml') {
    if (input.oidc_discovery_url || input.oidc_client_id) {
      throw new IdpValidationError(
        'provider_type',
        'OIDC fields are not accepted on a SAML connection',
      );
    }
    if (!input.metadata_url && !input.metadata_xml) {
      throw new IdpValidationError(
        'metadata_url',
        'A SAML connection requires metadata_url or metadata_xml',
      );
    }
    return {
      domain,
      attributeMapping,
      metadataUrl: input.metadata_url ? assertSafeIdpUrl('metadata_url', input.metadata_url) : null,
      metadataXml: input.metadata_xml ? assertSafeMetadataXml(input.metadata_xml) : null,
      oidcDiscoveryUrl: null,
      oidcClientId: null,
    };
  }

  if (input.metadata_url || input.metadata_xml) {
    throw new IdpValidationError(
      'provider_type',
      'SAML metadata is not accepted on an OIDC connection',
    );
  }
  if (!input.oidc_discovery_url || !input.oidc_client_id) {
    throw new IdpValidationError(
      'oidc_discovery_url',
      'An OIDC connection requires oidc_discovery_url and oidc_client_id',
    );
  }

  return {
    domain,
    attributeMapping,
    metadataUrl: null,
    metadataXml: null,
    oidcDiscoveryUrl: assertSafeIdpUrl('oidc_discovery_url', input.oidc_discovery_url),
    oidcClientId: input.oidc_client_id.trim(),
  };
}

function validationResponse(error: IdpValidationError): Response {
  return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
}

/**
 * GET /api/admin/sso
 */
export async function GET(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { principal, response } = await authorizeSSORequest(request, ENDPOINT);
  if (!principal) return response;

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');

  try {
    if (orgId) {
      const forbidden = await requireOrgRole(
        principal,
        orgId,
        ['owner', 'admin'],
        ENDPOINT,
        'list-sso-connections',
      );
      if (forbidden) return forbidden;

      const rows = await principal.db.query<SSOConnectionRow>(
        `select ${SSO_CONNECTION_SELECT_COLUMNS} from sso_connections where organization_id = $1 order by created_at desc`,
        [orgId],
      );

      return NextResponse.json({
        connections: rows.map(toConnectionView),
        access: { plan: principal.access.plan, canManageSSO: true },
      });
    }

    const memberRows = await principal.db.query<{ organization_id: string }>(
      "select organization_id from organization_members where user_id = $1 and role in ('owner', 'admin')",
      [principal.userId],
    );

    const orgIds = memberRows.map((row) => row.organization_id);
    if (orgIds.length === 0) {
      return NextResponse.json({
        connections: [],
        access: { plan: principal.access.plan, canManageSSO: true },
      });
    }

    const rows = await principal.db.query<SSOConnectionRow>(
      `select ${SSO_CONNECTION_SELECT_COLUMNS} from sso_connections where organization_id = any($1) order by created_at desc`,
      [orgIds],
    );

    return NextResponse.json({
      connections: rows.map(toConnectionView),
      access: { plan: principal.access.plan, canManageSSO: true },
    });
  } catch (error) {
    return ssoErrorResponse(error, { userId: principal.userId, method: 'GET' });
  }
}

/**
 * POST /api/admin/sso
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-create');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const { principal, response } = await authorizeSSORequest(request, ENDPOINT);
  if (!principal) return response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSSOConnectionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  let normalized: ReturnType<typeof normalizeCreateInput>;
  try {
    normalized = normalizeCreateInput(parsed.data, rawAttributeMapping(rawBody));
  } catch (error) {
    if (error instanceof IdpValidationError) return validationResponse(error);
    throw error;
  }

  const { organization_id, provider_type, display_name } = parsed.data;

  try {
    const forbidden = await requireOrgRole(
      principal,
      organization_id,
      ['owner'],
      ENDPOINT,
      'create-sso-connection',
    );
    if (forbidden) return forbidden;

    const verificationToken = issueDomainVerificationToken();

    let rows: SSOConnectionRow[];
    try {
      rows = await principal.db.query<SSOConnectionRow>(
        `insert into sso_connections (
           organization_id, provider_type, domain, display_name, metadata_url, metadata_xml,
           oidc_discovery_url, oidc_client_id, attribute_mapping, created_by,
           is_active, domain_verification_token
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
         returning ${SSO_CONNECTION_SELECT_COLUMNS}`,
        [
          organization_id,
          provider_type,
          normalized.domain,
          display_name ?? null,
          normalized.metadataUrl,
          normalized.metadataXml,
          normalized.oidcDiscoveryUrl,
          normalized.oidcClientId,
          JSON.stringify(normalized.attributeMapping),
          principal.userId,
          verificationToken,
        ],
      );
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        return NextResponse.json(
          { error: `Domain "${normalized.domain}" is already configured for SSO` },
          { status: 409 },
        );
      }
      throw err;
    }

    const created = rows[0];
    if (!created) {
      return ssoErrorResponse(new Error('insert returned no row'), {
        userId: principal.userId,
        organization_id,
      });
    }

    // No IdP metadata, certificate, or client secret is ever logged.
    logger.info(
      { userId: principal.userId, organization_id, domain: normalized.domain, provider_type },
      'SSO connection draft created',
    );

    await logSecurityEvent({
      userId: principal.userId,
      eventType: 'admin_action',
      severity: 'low',
      endpoint: ENDPOINT,
      details: {
        action: 'create-sso-connection',
        organization_id,
        domain: normalized.domain,
        provider_type,
      },
    });

    return NextResponse.json(
      {
        connection: toConnectionView(created),
        nextStep: 'verify_domain',
        domainVerification: domainVerificationInstructions(normalized.domain, verificationToken),
      },
      { status: 201 },
    );
  } catch (error) {
    return ssoErrorResponse(error, { userId: principal.userId, organization_id, method: 'POST' });
  }
}

/**
 * DELETE /api/admin/sso?id=<uuid>[&hard=true]
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const { principal, response } = await authorizeSSORequest(request, ENDPOINT);
  if (!principal) return response;

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('id');
  const hardDelete = searchParams.get('hard') === 'true';

  if (!connectionId || !z.string().uuid().safeParse(connectionId).success) {
    return NextResponse.json({ error: 'A valid id query parameter is required' }, { status: 400 });
  }

  try {
    const existing = await principal.db.query<
      Pick<SSOConnectionRow, 'id' | 'organization_id' | 'domain' | 'clerk_connection_id'>
    >(
      'select id, organization_id, domain, clerk_connection_id from sso_connections where id = $1 limit 1',
      [connectionId],
    );

    const conn = existing[0];
    if (!conn) {
      return NextResponse.json({ error: 'SSO connection not found' }, { status: 404 });
    }

    const forbidden = await requireOrgRole(
      principal,
      conn.organization_id,
      ['owner'],
      ENDPOINT,
      'delete-sso-connection',
    );
    if (forbidden) return forbidden;

    // Tear the connection down at the identity provider FIRST. If the local row
    // were removed first and the Clerk call then failed, a live connection would
    // keep routing sign-ins with nothing left to reconcile it against.
    if (conn.clerk_connection_id) {
      try {
        if (hardDelete) {
          await deleteConnection(conn.clerk_connection_id);
        } else {
          await setConnectionActive(conn.clerk_connection_id, false);
        }
      } catch (error) {
        if (error instanceof ClerkNotProvisionedError) {
          return NextResponse.json({ error: error.message, code: error.reason }, { status: 503 });
        }
        logger.error(
          { error, userId: principal.userId, connectionId },
          'Failed to update the identity provider while removing an SSO connection',
        );
        return NextResponse.json(
          { error: 'Could not update the identity provider; the connection was left unchanged' },
          { status: 502 },
        );
      }
    }

    if (hardDelete) {
      await principal.db.execute('delete from sso_connections where id = $1', [connectionId]);
    } else {
      await principal.db.execute('update sso_connections set is_active = false where id = $1', [
        connectionId,
      ]);
    }

    logger.info(
      { userId: principal.userId, connectionId, domain: conn.domain, hardDelete },
      'SSO connection removed',
    );

    await logSecurityEvent({
      userId: principal.userId,
      eventType: 'admin_action',
      severity: 'medium',
      endpoint: ENDPOINT,
      details: {
        action: hardDelete ? 'hard-delete-sso-connection' : 'deactivate-sso-connection',
        connectionId,
        domain: conn.domain,
        organization_id: conn.organization_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: hardDelete
        ? `SSO connection for domain "${conn.domain}" permanently deleted`
        : `SSO connection for domain "${conn.domain}" deactivated`,
    });
  } catch (error) {
    return ssoErrorResponse(error, { userId: principal.userId, connectionId, method: 'DELETE' });
  }
}
