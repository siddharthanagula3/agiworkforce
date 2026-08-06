import 'server-only';

import type { SSOConnectionRow } from '@/lib/server/neon-types';
import { domainVerificationInstructions } from './domain-verification';

/**
 * The columns every SSO read selects. Deliberately excludes `metadata_xml`
 * (up to 500KB of IdP document that no client needs) and never exposes the
 * verification token itself except through the explicit instructions block.
 */
export const SSO_CONNECTION_SELECT_COLUMNS = [
  'id',
  'organization_id',
  'provider_type',
  'domain',
  'display_name',
  'metadata_url',
  'oidc_discovery_url',
  'oidc_client_id',
  'clerk_connection_id',
  'acs_url',
  'sp_entity_id',
  'sp_metadata_url',
  'domain_verified_at',
  'domain_verification_token',
  'attribute_mapping',
  'is_active',
  'created_by',
  'created_at',
  'updated_at',
].join(', ');

export type SSOConnectionReadRow = SSOConnectionRow;

export type SSOConnectionStatus =
  | 'awaiting_domain_verification'
  | 'awaiting_provider_configuration'
  | 'ready_to_activate'
  | 'active';

export interface SSOConnectionView {
  id: string;
  organizationId: string;
  providerType: 'saml' | 'oidc';
  domain: string;
  displayName: string | null;
  metadataUrl: string | null;
  oidcDiscoveryUrl: string | null;
  oidcClientId: string | null;
  attributeMapping: Record<string, string>;
  isActive: boolean;
  status: SSOConnectionStatus;
  domainVerifiedAt: string | null;
  /** Service Provider values the admin pastes into their IdP. Null until provisioned. */
  serviceProvider: {
    acsUrl: string | null;
    entityId: string | null;
    metadataUrl: string | null;
  };
  /** Present only while the domain is unverified. */
  domainVerification: {
    recordType: 'TXT';
    recordName: string;
    recordValue: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export function connectionStatus(row: SSOConnectionRow): SSOConnectionStatus {
  if (row.is_active) return 'active';
  if (!row.domain_verified_at) return 'awaiting_domain_verification';
  if (!row.clerk_connection_id) return 'awaiting_provider_configuration';
  return 'ready_to_activate';
}

/**
 * Project a stored row into the client shape.
 *
 * The Clerk connection id is never returned: it is an internal provider
 * reference, and exposing it invites a client to address Clerk directly.
 */
export function toConnectionView(row: SSOConnectionRow): SSOConnectionView {
  const verified = row.domain_verified_at !== null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    providerType: row.provider_type,
    domain: row.domain,
    displayName: row.display_name,
    metadataUrl: row.metadata_url,
    oidcDiscoveryUrl: row.oidc_discovery_url,
    oidcClientId: row.oidc_client_id,
    attributeMapping: row.attribute_mapping ?? {},
    isActive: row.is_active,
    status: connectionStatus(row),
    domainVerifiedAt: row.domain_verified_at,
    serviceProvider: {
      acsUrl: row.acs_url,
      entityId: row.sp_entity_id,
      metadataUrl: row.sp_metadata_url,
    },
    domainVerification:
      verified || !row.domain_verification_token
        ? null
        : domainVerificationInstructions(row.domain, row.domain_verification_token),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
