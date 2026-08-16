import 'server-only';

import type { SSOConnectionRow } from '@/lib/server/neon-types';
import {
  domainChallengeExpiresAt,
  domainVerificationInstructions,
  isDomainChallengeExpired,
} from './domain-verification';

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
  serviceProvider: {
    acsUrl: string | null;
    entityId: string | null;
    metadataUrl: string | null;
  };
  domainVerification: {
    recordType: 'TXT';
    recordName: string;
    recordValue: string;
  } | null;
  domainChallengeExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function connectionStatus(row: SSOConnectionRow): SSOConnectionStatus {
  if (row.is_active) return 'active';
  if (!row.domain_verified_at) return 'awaiting_domain_verification';
  if (!row.clerk_connection_id) return 'awaiting_provider_configuration';
  return 'ready_to_activate';
}

export function toConnectionView(row: SSOConnectionRow): SSOConnectionView {
  const verified = row.domain_verified_at !== null;

  const token = row.domain_verification_token;
  const liveToken = !verified && token !== null && !isDomainChallengeExpired(token) ? token : null;

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
    domainVerification: liveToken ? domainVerificationInstructions(row.domain, liveToken) : null,
    domainChallengeExpiresAt: liveToken
      ? (domainChallengeExpiresAt(liveToken)?.toISOString() ?? null)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
