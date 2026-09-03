import 'server-only';

import {
  CONNECTOR_OAUTH_CALLBACK_PATH,
  MCP_CLIENT_METADATA_PATH,
} from '@agiworkforce/cloud-contracts';

import { isLocalDevOrigin } from '@/lib/connectors/oauth-registry';

const CLIENT_NAME = 'AGI Workforce';

function resolveConfiguredBaseUrl(): URL | null {
  const configured = (
    process.env['CONNECTOR_OAUTH_REDIRECT_BASE_URL'] ??
    process.env['NEXT_PUBLIC_APP_URL'] ??
    ''
  ).trim();
  if (!configured) return null;

  try {
    return new URL(configured);
  } catch {
    return null;
  }
}

export function resolveClientMetadataOrigin(): string | null {
  const url = resolveConfiguredBaseUrl();
  if (!url || url.protocol !== 'https:') return null;
  return url.origin;
}

function resolveClientRedirectOrigin(): string | null {
  const url = resolveConfiguredBaseUrl();
  if (!url) return null;
  if (url.protocol !== 'https:' && !isLocalDevOrigin(url)) return null;
  return url.origin;
}

export function resolveClientMetadataUrl(): string | null {
  const origin = resolveClientMetadataOrigin();
  return origin ? `${origin}${MCP_CLIENT_METADATA_PATH}` : null;
}

export function resolveClientRedirectUri(): string | null {
  const origin = resolveClientRedirectOrigin();
  return origin ? `${origin}${CONNECTOR_OAUTH_CALLBACK_PATH}` : null;
}

export interface McpClientMetadataDocument {
  client_id: string;
  client_name: string;
  client_uri: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export function buildMcpClientMetadataDocument(): McpClientMetadataDocument | null {
  const origin = resolveClientMetadataOrigin();
  const clientId = resolveClientMetadataUrl();
  const redirectUri = resolveClientRedirectUri();
  if (!origin || !clientId || !redirectUri) return null;

  return {
    client_id: clientId,
    client_name: CLIENT_NAME,
    client_uri: origin,
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}
