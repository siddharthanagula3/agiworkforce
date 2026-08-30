import 'server-only';

import { AuthorizationServerMismatchError } from '@modelcontextprotocol/client';
import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';

import { logger } from '@/lib/logger';
import {
  buildMcpClientMetadataDocument,
  resolveClientMetadataUrl,
  resolveClientRedirectUri,
} from '@/lib/connectors/mcp-client-metadata';
import {
  getMcpOAuthClient,
  saveMcpOAuthClient,
  type McpClientRegistrationMethod,
} from '@/lib/connectors/mcp-oauth-clients';

export interface McpPendingAuthorizationDraft {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  issuer: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  resourceUrl: string | null;
  clientId: string | null;
}

export interface McpOAuthProviderSeed {
  state?: string;
  codeVerifier?: string;
  issuer?: string | null;
  tokens?: StoredOAuthTokens | undefined;
  discoveryState?: OAuthDiscoveryState | undefined;
}

export interface McpOAuthProviderOptions {
  mcpUrl: string;
  state: string;
  seed?: McpOAuthProviderSeed;
}

export class McpClientIdentityUnavailableError extends Error {
  constructor(readonly issuer: string) {
    super(
      `No client identity is available for ${issuer}: this deployment publishes no client ` +
        `metadata document (set CONNECTOR_OAUTH_REDIRECT_BASE_URL to an HTTPS origin) and the ` +
        `authorization server does not support dynamic client registration.`,
    );
    this.name = 'McpClientIdentityUnavailableError';
  }
}

export class McpOAuthClientProvider implements OAuthClientProvider {
  private _authorizationUrl: string | null = null;
  private _codeVerifier: string | null;
  private _discovery: OAuthDiscoveryState | null = null;
  private _clientInformation: StoredOAuthClientInformation | undefined;
  private _tokens: StoredOAuthTokens | undefined;
  private _resourceUrl: string | null = null;
  private _authorizationServerUrl: string | null;
  private _registrationMethod: McpClientRegistrationMethod | null = null;

  constructor(private readonly options: McpOAuthProviderOptions) {
    this._codeVerifier = options.seed?.codeVerifier ?? null;
    this._authorizationServerUrl = options.seed?.issuer ?? null;
    this._tokens = options.seed?.tokens;
    this._discovery = options.seed?.discoveryState ?? null;
  }

  get redirectUrl(): string | undefined {
    return resolveClientRedirectUri() ?? undefined;
  }

  get clientMetadataUrl(): string | undefined {
    return resolveClientMetadataUrl() ?? undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    const document = buildMcpClientMetadataDocument();
    if (document) {
      const { client_id: _clientId, ...metadata } = document;
      return metadata as unknown as OAuthClientMetadata;
    }
    return {
      client_name: 'AGI Workforce',
      redirect_uris: [this.redirectUrl ?? ''],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    } as unknown as OAuthClientMetadata;
  }

  state(): string {
    return this.options.state;
  }

  async clientInformation(ctx?: {
    issuer: string;
  }): Promise<StoredOAuthClientInformation | undefined> {
    if (this._clientInformation) return this._clientInformation;
    const issuer = ctx?.issuer ?? this._authorizationServerUrl;
    if (!issuer) return undefined;

    const record = await getMcpOAuthClient(issuer);
    if (!record) return undefined;

    this._registrationMethod = record.registrationMethod;
    this._clientInformation = {
      client_id: record.clientId,
      ...(record.clientSecret ? { client_secret: record.clientSecret } : {}),
      issuer: record.issuer,
    } as StoredOAuthClientInformation;
    return this._clientInformation;
  }

  async saveClientInformation(
    clientInformation: StoredOAuthClientInformation,
    ctx?: { issuer: string },
  ): Promise<void> {
    this._clientInformation = clientInformation;
    const issuer = clientInformation.issuer ?? ctx?.issuer ?? this._authorizationServerUrl;
    if (!issuer) {
      logger.warn(
        { mcpUrl: this.options.mcpUrl },
        '[mcp-oauth] client registration has no issuer; not persisting',
      );
      return;
    }

    const info = clientInformation as unknown as {
      client_id: string;
      client_secret?: string;
      client_secret_expires_at?: number;
    };

    const metadataUrl = resolveClientMetadataUrl();
    const method: McpClientRegistrationMethod =
      metadataUrl && info.client_id === metadataUrl ? 'cimd' : 'dynamic';
    this._registrationMethod = method;

    await saveMcpOAuthClient({
      issuer,
      clientId: info.client_id,
      clientSecret: method === 'cimd' ? null : (info.client_secret ?? null),
      registrationMethod: method,
      clientMetadataUrl: method === 'cimd' ? metadataUrl : null,
      clientSecretExpiresAt:
        info.client_secret_expires_at && info.client_secret_expires_at > 0
          ? new Date(info.client_secret_expires_at * 1000)
          : null,
    });

    logger.info(
      { issuer, method },
      '[mcp-oauth] client identity established without operator registration',
    );
  }

  tokens(): StoredOAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: StoredOAuthTokens): void {
    this._tokens = tokens;
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('No PKCE code verifier is available for this authorization');
    }
    return this._codeVerifier;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this._authorizationUrl = authorizationUrl.toString();
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this._discovery = state;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this._discovery ?? undefined;
  }

  saveAuthorizationServerUrl(authorizationServerUrl: string): void {
    const recordedIssuer = this.options.seed?.issuer;
    if (
      recordedIssuer &&
      recordedIssuer !== authorizationServerUrl &&
      `${recordedIssuer}/` !== authorizationServerUrl &&
      recordedIssuer !== `${authorizationServerUrl}/`
    ) {
      throw new AuthorizationServerMismatchError(recordedIssuer, authorizationServerUrl);
    }
    this._authorizationServerUrl = authorizationServerUrl;
  }

  authorizationServerUrl(): string | undefined {
    return this._authorizationServerUrl ?? undefined;
  }

  saveResourceUrl(resourceUrl: string): void {
    this._resourceUrl = resourceUrl;
  }

  resourceUrl(): string | undefined {
    return this._resourceUrl ?? undefined;
  }

  get issuer(): string | null {
    return (
      this._discovery?.authorizationServerMetadata?.issuer ?? this._authorizationServerUrl ?? null
    );
  }

  get registrationMethod(): McpClientRegistrationMethod | null {
    return this._registrationMethod;
  }

  get discoverySnapshot(): OAuthDiscoveryState | null {
    return this._discovery;
  }

  get resolvedTokens(): StoredOAuthTokens | undefined {
    return this._tokens;
  }

  get pendingDraft(): McpPendingAuthorizationDraft | null {
    if (!this._authorizationUrl || !this._codeVerifier) return null;
    const metadata = this._discovery?.authorizationServerMetadata;
    return {
      authorizationUrl: this._authorizationUrl,
      state: this.options.state,
      codeVerifier: this._codeVerifier,
      issuer: this.issuer,
      authorizationEndpoint: metadata?.authorization_endpoint ?? null,
      tokenEndpoint: metadata?.token_endpoint ?? null,
      resourceUrl: this._resourceUrl,
      clientId:
        (this._clientInformation as unknown as { client_id?: string } | undefined)?.client_id ??
        null,
    };
  }
}
