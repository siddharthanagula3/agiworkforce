import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import type { SSOConnectionRow } from '@/lib/server/neon-types';
import { SSO_CONNECTION_SELECT_COLUMNS, toConnectionView } from '@/lib/server/sso/connection-view';
import {
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
  ClerkConnectionError,
  ClerkNotProvisionedError,
  provisionConnection,
  setConnectionActive,
  updateConnection,
  type ProvisionInput,
  type ProvisionedConnection,
} from '@/lib/server/sso/clerk-enterprise-connections';

export const runtime = 'nodejs';

const ENDPOINT = '/api/admin/sso/[id]';

const UpdateSchema = z
  .object({
    display_name: z.string().min(1).max(200).nullable().optional(),
    metadata_url: z.string().max(2048).optional(),
    metadata_xml: z.string().max(500_000).optional(),
    oidc_discovery_url: z.string().max(2048).optional(),
    oidc_client_id: z.string().min(1).max(512).optional(),
    oidc_client_secret: z.string().min(1).max(2048).optional(),
    attribute_mapping: z.record(z.string(), z.unknown()).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

type UpdateInput = z.infer<typeof UpdateSchema>;

async function loadConnection(
  db: { query: <T>(sql: string, params: unknown[]) => Promise<T[]> },
  id: string,
): Promise<(SSOConnectionRow & { metadata_xml: string | null }) | null> {
  const rows = await db.query<SSOConnectionRow>(
    `select ${SSO_CONNECTION_SELECT_COLUMNS}, metadata_xml from sso_connections where id = $1 limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

function buildProvisionInput(
  row: SSOConnectionRow,
  next: {
    metadataUrl: string | null;
    metadataXml: string | null;
    oidcDiscoveryUrl: string | null;
    oidcClientId: string | null;
    oidcClientSecret: string | null;
    attributeMapping: Record<string, string>;
    displayName: string | null;
  },
): ProvisionInput | { missing: string } {
  const name = next.displayName ?? row.display_name ?? row.domain;

  if (row.provider_type === 'saml') {
    if (!next.metadataUrl && !next.metadataXml) {
      return { missing: 'metadata_url or metadata_xml' };
    }
    return {
      providerType: 'saml',
      name,
      domain: row.domain,
      metadataUrl: next.metadataUrl,
      metadataXml: next.metadataXml,
      attributeMapping: next.attributeMapping,
    };
  }

  if (!next.oidcDiscoveryUrl || !next.oidcClientId) {
    return { missing: 'oidc_discovery_url and oidc_client_id' };
  }
  if (!next.oidcClientSecret) {
    return { missing: 'oidc_client_secret' };
  }
  return {
    providerType: 'oidc',
    name,
    domain: row.domain,
    discoveryUrl: next.oidcDiscoveryUrl,
    clientId: next.oidcClientId,
    clientSecret: next.oidcClientSecret,
  };
}

function providerErrorResponse(error: unknown, context: Record<string, unknown>): Response | null {
  if (error instanceof ClerkNotProvisionedError) {
    return NextResponse.json({ error: error.message, code: error.reason }, { status: 503 });
  }
  if (error instanceof ClerkConnectionError) {
    logger.error({ ...context, status: error.status }, 'Identity provider rejected the request');
    return NextResponse.json(
      {
        error:
          'The identity provider rejected this configuration. Check the metadata, certificate, and client credentials against your IdP.',
      },
      { status: 502 },
    );
  }
  return null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { principal, response } = await authorizeSSORequest(request, ENDPOINT);
  if (!principal) return response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid connection id' }, { status: 400 });
  }

  try {
    const row = await loadConnection(principal.db, id);
    if (!row) {
      return NextResponse.json({ error: 'SSO connection not found' }, { status: 404 });
    }

    const forbidden = await requireOrgRole(
      principal,
      row.organization_id,
      ['owner', 'admin'],
      ENDPOINT,
      'read-sso-connection',
    );
    if (forbidden) return forbidden;

    return NextResponse.json({ connection: toConnectionView(row) });
  } catch (error) {
    return ssoErrorResponse(error, { userId: principal.userId, connectionId: id, method: 'GET' });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-create');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const { principal, response } = await authorizeSSORequest(request, ENDPOINT);
  if (!principal) return response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid connection id' }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const update: UpdateInput = parsed.data;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No changes supplied' }, { status: 400 });
  }

  try {
    const row = await loadConnection(principal.db, id);
    if (!row) {
      return NextResponse.json({ error: 'SSO connection not found' }, { status: 404 });
    }

    const forbidden = await requireOrgRole(
      principal,
      row.organization_id,
      ['owner'],
      ENDPOINT,
      'update-sso-connection',
    );
    if (forbidden) return forbidden;

    if (
      row.provider_type === 'saml' &&
      (update.oidc_discovery_url || update.oidc_client_id || update.oidc_client_secret)
    ) {
      return NextResponse.json(
        { error: 'OIDC fields are not accepted on a SAML connection', field: 'provider_type' },
        { status: 400 },
      );
    }
    if (row.provider_type === 'oidc' && (update.metadata_url || update.metadata_xml)) {
      return NextResponse.json(
        { error: 'SAML metadata is not accepted on an OIDC connection', field: 'provider_type' },
        { status: 400 },
      );
    }

    let next: Parameters<typeof buildProvisionInput>[1];
    try {
      next = {
        metadataUrl:
          update.metadata_url !== undefined
            ? assertSafeIdpUrl('metadata_url', update.metadata_url)
            : row.metadata_url,
        metadataXml:
          update.metadata_xml !== undefined
            ? assertSafeMetadataXml(update.metadata_xml)
            : row.metadata_xml,
        oidcDiscoveryUrl:
          update.oidc_discovery_url !== undefined
            ? assertSafeIdpUrl('oidc_discovery_url', update.oidc_discovery_url)
            : row.oidc_discovery_url,
        oidcClientId:
          update.oidc_client_id !== undefined ? update.oidc_client_id.trim() : row.oidc_client_id,
        oidcClientSecret: update.oidc_client_secret ?? null,
        attributeMapping:
          update.attribute_mapping !== undefined
            ? assertSafeAttributeMapping(rawAttributeMapping(rawBody))
            : (row.attribute_mapping ?? {}),
        displayName:
          update.display_name !== undefined ? update.display_name : (row.display_name ?? null),
      };
    } catch (error) {
      if (error instanceof IdpValidationError) {
        return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
      }
      throw error;
    }

    const wantsActive = update.is_active ?? row.is_active;

    if (wantsActive && !row.domain_verified_at) {
      return NextResponse.json(
        {
          error: `Domain "${row.domain}" has not been verified. Publish the DNS TXT challenge and call POST /api/admin/sso/verify-domain before activating this connection.`,
          code: 'DOMAIN_NOT_VERIFIED',
        },
        { status: 409 },
      );
    }

    const changesProviderConfig =
      update.metadata_url !== undefined ||
      update.metadata_xml !== undefined ||
      update.oidc_discovery_url !== undefined ||
      update.oidc_client_id !== undefined ||
      update.oidc_client_secret !== undefined ||
      update.attribute_mapping !== undefined ||
      update.display_name !== undefined;

    const mustReachProvider =
      (wantsActive && !row.is_active) ||
      (changesProviderConfig && row.clerk_connection_id !== null);

    let provisioned: ProvisionedConnection | null = null;

    if (mustReachProvider) {
      const provisionInput = buildProvisionInput(row, next);
      if ('missing' in provisionInput) {
        return NextResponse.json(
          {
            error: `This ${row.provider_type.toUpperCase()} connection cannot be provisioned until ${provisionInput.missing} is supplied.`,
            code: 'INCOMPLETE_CONFIGURATION',
          },
          { status: 400 },
        );
      }

      try {
        provisioned = row.clerk_connection_id
          ? await updateConnection(row.clerk_connection_id, provisionInput, { active: wantsActive })
          : await provisionConnection(provisionInput, { active: wantsActive });
      } catch (error) {
        const mapped = providerErrorResponse(error, {
          userId: principal.userId,
          connectionId: id,
        });
        if (mapped) return mapped;
        throw error;
      }
    } else if (!wantsActive && row.is_active && row.clerk_connection_id) {
      try {
        provisioned = await setConnectionActive(row.clerk_connection_id, false);
      } catch (error) {
        const mapped = providerErrorResponse(error, {
          userId: principal.userId,
          connectionId: id,
        });
        if (mapped) return mapped;
        throw error;
      }
    }

    const effectiveActive = provisioned ? provisioned.active : row.is_active;

    const updated = await principal.db.query<SSOConnectionRow>(
      `update sso_connections set
         display_name = $2,
         metadata_url = $3,
         metadata_xml = $4,
         oidc_discovery_url = $5,
         oidc_client_id = $6,
         attribute_mapping = $7,
         clerk_connection_id = coalesce($8, clerk_connection_id),
         acs_url = coalesce($9, acs_url),
         sp_entity_id = coalesce($10, sp_entity_id),
         sp_metadata_url = coalesce($11, sp_metadata_url),
         is_active = $12
       where id = $1
       returning ${SSO_CONNECTION_SELECT_COLUMNS}`,
      [
        id,
        next.displayName,
        next.metadataUrl,
        next.metadataXml,
        next.oidcDiscoveryUrl,
        next.oidcClientId,
        JSON.stringify(next.attributeMapping),
        provisioned?.clerkConnectionId ?? null,
        provisioned?.acsUrl ?? null,
        provisioned?.spEntityId ?? null,
        provisioned?.spMetadataUrl ?? null,
        effectiveActive,
      ],
    );

    const result = updated[0];
    if (!result) {
      return ssoErrorResponse(new Error('update returned no row'), {
        userId: principal.userId,
        connectionId: id,
      });
    }

    logger.info(
      {
        userId: principal.userId,
        connectionId: id,
        domain: row.domain,
        isActive: effectiveActive,
        provisioned: provisioned !== null,
      },
      'SSO connection updated',
    );

    await logSecurityEvent({
      userId: principal.userId,
      eventType: 'admin_action',
      severity: update.is_active !== undefined ? 'medium' : 'low',
      endpoint: ENDPOINT,
      details: {
        action: 'update-sso-connection',
        connectionId: id,
        organization_id: row.organization_id,
        domain: row.domain,
        is_active: effectiveActive,
      },
    });

    return NextResponse.json({ connection: toConnectionView(result) });
  } catch (error) {
    return ssoErrorResponse(error, { userId: principal.userId, connectionId: id, method: 'PATCH' });
  }
}
