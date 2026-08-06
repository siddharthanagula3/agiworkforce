import 'server-only';

import type { SamlAttributeMapping } from './idp-metadata';

/**
 * Thin wrapper over Clerk's enterprise-connection API.
 *
 * Clerk is the SAML/OIDC implementation. We never parse a SAML assertion or
 * metadata document ourselves — validated values are forwarded and Clerk owns
 * the protocol. This module exists to (a) keep the Clerk import in one place,
 * (b) translate Clerk's responses into the Service Provider values an admin
 * must paste into their IdP, and (c) turn a missing Clerk entitlement into an
 * explicit, honest error instead of a confusing 500.
 *
 * Clerk enterprise SSO requires a paid Clerk plan with the Enhanced
 * Authentication add-on. If the instance is not entitled, Clerk rejects the
 * call and we surface that plainly rather than pretending SSO was configured.
 */

export class ClerkNotProvisionedError extends Error {
  readonly reason: 'missing_credentials' | 'not_entitled';

  constructor(reason: 'missing_credentials' | 'not_entitled', message: string) {
    super(message);
    this.name = 'ClerkNotProvisionedError';
    this.reason = reason;
  }
}

export class ClerkConnectionError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'ClerkConnectionError';
    this.status = status;
  }
}

export interface SamlProvisionInput {
  providerType: 'saml';
  name: string;
  domain: string;
  metadataUrl?: string | null;
  metadataXml?: string | null;
  attributeMapping: SamlAttributeMapping;
}

export interface OidcProvisionInput {
  providerType: 'oidc';
  name: string;
  domain: string;
  discoveryUrl: string;
  clientId: string;
  /** Forwarded to Clerk and never persisted locally. */
  clientSecret: string;
}

export type ProvisionInput = SamlProvisionInput | OidcProvisionInput;

export interface ProvisionedConnection {
  clerkConnectionId: string;
  active: boolean;
  /** Present for SAML connections; Clerk does not issue these for OIDC. */
  acsUrl: string | null;
  spEntityId: string | null;
  spMetadataUrl: string | null;
}

interface ClerkEnterpriseConnectionLike {
  id: string;
  active: boolean;
  samlConnection?: {
    acsUrl?: string | null;
    spEntityId?: string | null;
    spMetadataUrl?: string | null;
  } | null;
}

/**
 * The exact shape forwarded to Clerk. Named fields rather than a loose record
 * so a typo in a provider parameter is a compile error, not a connection that
 * silently omits the setting it was supposed to carry.
 */
export interface ClerkConnectionParams {
  name?: string;
  domains?: string[];
  active?: boolean;
  syncUserAttributes?: boolean;
  saml?: {
    idpMetadataUrl?: string;
    idpMetadata?: string;
    attributeMapping?: SamlAttributeMapping;
    allowIdpInitiated?: boolean;
    allowSubdomains?: boolean;
  };
  oidc?: {
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
  };
}

export interface ClerkEnterpriseConnectionClient {
  createEnterpriseConnection(params: ClerkConnectionParams): Promise<ClerkEnterpriseConnectionLike>;
  updateEnterpriseConnection(
    id: string,
    params: ClerkConnectionParams,
  ): Promise<ClerkEnterpriseConnectionLike>;
  deleteEnterpriseConnection(id: string): Promise<unknown>;
}

async function defaultClient(): Promise<ClerkEnterpriseConnectionClient> {
  if (!process.env['CLERK_SECRET_KEY']) {
    throw new ClerkNotProvisionedError(
      'missing_credentials',
      'Enterprise SSO is not provisioned on this deployment: CLERK_SECRET_KEY is not configured.',
    );
  }

  const { clerkClient } = await import('@clerk/nextjs/server');
  const client = await clerkClient();
  return client.enterpriseConnections as unknown as ClerkEnterpriseConnectionClient;
}

function toProvisioned(connection: ClerkEnterpriseConnectionLike): ProvisionedConnection {
  const saml = connection.samlConnection ?? null;
  return {
    clerkConnectionId: connection.id,
    active: connection.active === true,
    acsUrl: saml?.acsUrl ?? null,
    spEntityId: saml?.spEntityId ?? null,
    spMetadataUrl: saml?.spMetadataUrl ?? null,
  };
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Clerk answers 402/403 when the instance lacks the Enhanced Authentication
 * add-on. That is an operator problem, not a caller problem, and must not be
 * reported as a generic failure.
 */
function rethrowClerkError(error: unknown, action: string): never {
  if (error instanceof ClerkNotProvisionedError) {
    throw error;
  }

  const status = statusOf(error);
  if (status === 402 || status === 403) {
    throw new ClerkNotProvisionedError(
      'not_entitled',
      'Enterprise SSO is not enabled on this deployment’s Clerk instance. Clerk enterprise connections require a paid Clerk plan with the Enhanced Authentication add-on.',
    );
  }

  throw new ClerkConnectionError(`Identity provider ${action} failed`, status);
}

export function buildParams(input: ProvisionInput, active: boolean): ClerkConnectionParams {
  const base: ClerkConnectionParams = {
    name: input.name,
    domains: [input.domain],
    active,
    // Attribute values are refreshed from the IdP on each sign-in so a
    // deprovisioned name or email does not persist in our directory.
    syncUserAttributes: true,
  };

  if (input.providerType === 'saml') {
    const saml: NonNullable<ClerkConnectionParams['saml']> = {
      // IdP-initiated flows accept an unsolicited assertion; requiring an
      // SP-initiated flow removes that class of replay.
      allowIdpInitiated: false,
      // A connection for example.com must not also capture sso.example.com,
      // which may be delegated to a different team.
      allowSubdomains: false,
    };
    if (input.metadataUrl) saml.idpMetadataUrl = input.metadataUrl;
    if (input.metadataXml) saml.idpMetadata = input.metadataXml;
    if (Object.keys(input.attributeMapping).length > 0) {
      saml.attributeMapping = input.attributeMapping;
    }
    return { ...base, saml };
  }

  return {
    ...base,
    oidc: {
      discoveryUrl: input.discoveryUrl,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    },
  };
}

export async function provisionConnection(
  input: ProvisionInput,
  options: { active: boolean; client?: ClerkEnterpriseConnectionClient },
): Promise<ProvisionedConnection> {
  const client = options.client ?? (await defaultClient());
  try {
    const connection = await client.createEnterpriseConnection(buildParams(input, options.active));
    return toProvisioned(connection);
  } catch (error) {
    rethrowClerkError(error, 'provisioning');
  }
}

export async function updateConnection(
  clerkConnectionId: string,
  input: ProvisionInput,
  options: { active: boolean; client?: ClerkEnterpriseConnectionClient },
): Promise<ProvisionedConnection> {
  const client = options.client ?? (await defaultClient());
  try {
    const connection = await client.updateEnterpriseConnection(
      clerkConnectionId,
      buildParams(input, options.active),
    );
    return toProvisioned(connection);
  } catch (error) {
    rethrowClerkError(error, 'update');
  }
}

export async function setConnectionActive(
  clerkConnectionId: string,
  active: boolean,
  options: { client?: ClerkEnterpriseConnectionClient } = {},
): Promise<ProvisionedConnection> {
  const client = options.client ?? (await defaultClient());
  try {
    const connection = await client.updateEnterpriseConnection(clerkConnectionId, { active });
    return toProvisioned(connection);
  } catch (error) {
    rethrowClerkError(error, 'activation change');
  }
}

export async function deleteConnection(
  clerkConnectionId: string,
  options: { client?: ClerkEnterpriseConnectionClient } = {},
): Promise<void> {
  const client = options.client ?? (await defaultClient());
  try {
    await client.deleteEnterpriseConnection(clerkConnectionId);
  } catch (error) {
    // A connection already gone from Clerk is the desired end state.
    if (statusOf(error) === 404) return;
    rethrowClerkError(error, 'removal');
  }
}
