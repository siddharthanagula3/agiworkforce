import 'server-only';

import type { SamlAttributeMapping } from './idp-metadata';

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
  clientSecret: string;
}

export type ProvisionInput = SamlProvisionInput | OidcProvisionInput;

export interface ProvisionedConnection {
  clerkConnectionId: string;
  active: boolean;
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
    syncUserAttributes: true,
  };

  if (input.providerType === 'saml') {
    const saml: NonNullable<ClerkConnectionParams['saml']> = {
      allowIdpInitiated: false,
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
    if (statusOf(error) === 404) return;
    rethrowClerkError(error, 'removal');
  }
}
