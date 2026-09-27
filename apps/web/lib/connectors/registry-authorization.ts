import 'server-only';

import {
  checkResourceAllowed,
  discoverOAuthServerInfo,
  resourceUrlFromServerUrl,
  type AuthorizationServerMetadata,
  type OAuthDiscoveryState,
  type OAuthServerInfo,
} from '@modelcontextprotocol/client';

import { logger } from '@/lib/logger';
import { mcpOAuthFetch } from '@/lib/connectors/mcp-oauth-fetch';
import { supportsS256Pkce } from '@/lib/connectors/mcp-oauth-provider';
import type { ConnectorOAuthProvider } from '@/lib/connectors/oauth-registry';

const PKCE_METHOD = 'S256';

export interface RegistryAuthorizationContext {
  issuer: string | null;
  resource: string;
  discoveryState: OAuthDiscoveryState | null;
}

export type RegistryAuthorizationResolution =
  | { status: 'ready'; context: RegistryAuthorizationContext }
  | { status: 'authorization-server-changed'; issuer: string }
  | { status: 'pkce-unsupported'; issuer: string };

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function sameIssuer(left: string, right: string): boolean {
  return withoutTrailingSlash(left) === withoutTrailingSlash(right);
}

function namesAdvertisedServer(
  issuer: string,
  info: OAuthServerInfo | null,
  metadata: AuthorizationServerMetadata | undefined,
): boolean {
  const advertised = info?.resourceMetadata?.authorization_servers ?? [];
  if (advertised.length === 0) return true;
  if (advertised.some((server) => sameIssuer(server, issuer))) return true;
  return (
    info !== null &&
    metadata !== undefined &&
    sameIssuer(metadata.issuer, issuer) &&
    advertised.some((server) => sameIssuer(server, info.authorizationServerUrl))
  );
}

function acceptsS256(
  provider: ConnectorOAuthProvider,
  metadata: AuthorizationServerMetadata,
): boolean {
  if (metadata.code_challenge_methods_supported !== undefined) return supportsS256Pkce(metadata);
  return provider.codeChallengeMethodsSupported?.includes(PKCE_METHOD) === true;
}

export function canonicalResourceUri(mcpUrl: string): string {
  const url = resourceUrlFromServerUrl(mcpUrl);
  return url.pathname === '/' ? withoutTrailingSlash(url.href) : url.href;
}

function advertisedResource(mcpUrl: string, info: OAuthServerInfo | null): string {
  const declared = info?.resourceMetadata?.resource;
  if (
    declared &&
    checkResourceAllowed({
      requestedResource: resourceUrlFromServerUrl(mcpUrl),
      configuredResource: declared,
    })
  ) {
    return declared;
  }
  return canonicalResourceUri(mcpUrl);
}

async function discoverServerInfo(mcpUrl: string): Promise<OAuthServerInfo | null> {
  try {
    return await discoverOAuthServerInfo(mcpUrl, { fetchFn: mcpOAuthFetch });
  } catch (error) {
    logger.info(
      { mcpUrl, error: error instanceof Error ? error.name : 'unknown' },
      '[connector-oauth] no usable authorization metadata for a pre-registered connector',
    );
    return null;
  }
}

export async function resolveRegistryAuthorization(
  provider: ConnectorOAuthProvider,
): Promise<RegistryAuthorizationResolution> {
  const info = await discoverServerInfo(provider.mcpUrl);
  const metadata = info?.authorizationServerMetadata;
  const discoveredIsConfigured =
    metadata !== undefined && metadata.token_endpoint === provider.tokenUrl;
  const issuer = provider.issuer ?? (discoveredIsConfigured ? metadata.issuer : null);

  if (issuer !== null && !namesAdvertisedServer(issuer, info, metadata)) {
    return { status: 'authorization-server-changed', issuer };
  }
  if (discoveredIsConfigured && !acceptsS256(provider, metadata)) {
    return { status: 'pkce-unsupported', issuer: metadata.issuer };
  }

  return {
    status: 'ready',
    context: {
      issuer,
      resource: advertisedResource(provider.mcpUrl, info),
      discoveryState:
        info && discoveredIsConfigured
          ? {
              authorizationServerUrl: info.authorizationServerUrl,
              ...(info.resourceMetadata ? { resourceMetadata: info.resourceMetadata } : {}),
              authorizationServerMetadata: metadata,
            }
          : null,
    },
  };
}
