import 'server-only';

import { randomBytes } from 'node:crypto';

import { GoogleAuth } from 'google-auth-library';

import { signAwsRequest, type AwsCredentials } from './aws-sigv4';
import {
  CMEK_DATA_KEY_LENGTH,
  CmekProviderUnconfiguredError,
  type CmekKeyDescriptor,
  type CmekProvider,
  type CmekProviderId,
  type CmekProviderRegistry,
} from './cmek';

// A provider whose credentials are absent is not constructed at all: an
// unconfigured provider that answered would be the fall-through CMEK prevents.

export type KmsFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface KmsProviderOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: KmsFetch;
  now?: () => Date;
}

const AWS_ACCESS_KEY_ENV = 'AGI_KMS_AWS_ACCESS_KEY_ID';
const AWS_SECRET_KEY_ENV = 'AGI_KMS_AWS_SECRET_ACCESS_KEY';
const AWS_SESSION_TOKEN_ENV = 'AGI_KMS_AWS_SESSION_TOKEN';
const AZURE_TENANT_ENV = 'AGI_KMS_AZURE_TENANT_ID';
const AZURE_CLIENT_ID_ENV = 'AGI_KMS_AZURE_CLIENT_ID';
const AZURE_CLIENT_SECRET_ENV = 'AGI_KMS_AZURE_CLIENT_SECRET';
const GCP_CREDENTIALS_ENV = 'GOOGLE_APPLICATION_CREDENTIALS';

const GCP_KMS_SCOPE = 'https://www.googleapis.com/auth/cloudkms';
const GCP_KMS_HOST = 'https://cloudkms.googleapis.com/v1';
const AZURE_KEY_VAULT_API_VERSION = '7.4';
const AZURE_WRAP_ALGORITHM = 'RSA-OAEP-256';
const AZURE_LOGIN_HOST = 'https://login.microsoftonline.com';
const AZURE_KEY_VAULT_SCOPE = 'https://vault.azure.net/.default';

export class KmsRequestError extends Error {
  readonly provider: CmekProviderId;
  readonly status: number;

  constructor(provider: CmekProviderId, operation: string, status: number, detail: string) {
    super(`${provider} refused ${operation} with HTTP ${status}: ${detail}`);
    this.name = 'KmsRequestError';
    this.provider = provider;
    this.status = status;
  }
}

function read(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertDataKey(provider: CmekProviderId, material: Buffer): Buffer {
  if (material.length !== CMEK_DATA_KEY_LENGTH) {
    throw new KmsRequestError(
      provider,
      'unwrap',
      200,
      `returned ${material.length} bytes where a data key is ${CMEK_DATA_KEY_LENGTH}`,
    );
  }
  return material;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 512);
  } catch {
    return response.statusText;
  }
}

async function jsonOrThrow(
  provider: CmekProviderId,
  operation: string,
  response: Response,
): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new KmsRequestError(provider, operation, response.status, await readErrorBody(response));
  }
  return (await response.json()) as Record<string, unknown>;
}

function requireString(
  provider: CmekProviderId,
  operation: string,
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new KmsRequestError(provider, operation, 200, `response carried no "${field}"`);
  }
  return value;
}

/**
 * AWS KMS.
 *
 * `GenerateDataKey` is the one operation that makes AWS produce the data key
 * itself, so the plaintext exists in this process only for the lifetime of the
 * call and the ciphertext is what anything persists.
 */
export function createAwsKmsProvider(options: KmsProviderOptions = {}): CmekProvider {
  const env = options.env ?? process.env;
  const accessKeyId = read(env, AWS_ACCESS_KEY_ENV);
  const secretAccessKey = read(env, AWS_SECRET_KEY_ENV);
  if (!accessKeyId || !secretAccessKey) throw new CmekProviderUnconfiguredError('aws_kms');
  const credentials: AwsCredentials = {
    accessKeyId,
    secretAccessKey,
    sessionToken: read(env, AWS_SESSION_TOKEN_ENV),
  };
  const call = options.fetchImpl ?? fetch;

  async function invoke(
    descriptor: CmekKeyDescriptor,
    target: 'GenerateDataKey' | 'Decrypt',
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const signed = signAwsRequest({
      credentials,
      region: descriptor.region,
      service: 'kms',
      host: `kms.${descriptor.region}.amazonaws.com`,
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `TrentService.${target}`,
      },
      ...(options.now ? { now: options.now() } : {}),
    });
    const response = await call(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    });
    return jsonOrThrow('aws_kms', target, response);
  }

  return {
    id: 'aws_kms',
    async generateDataKey(descriptor) {
      const body = await invoke(descriptor, 'GenerateDataKey', {
        KeyId: descriptor.keyUri,
        NumberOfBytes: CMEK_DATA_KEY_LENGTH,
      });
      return {
        wrapped: requireString('aws_kms', 'GenerateDataKey', body, 'CiphertextBlob'),
        plaintext: assertDataKey(
          'aws_kms',
          Buffer.from(requireString('aws_kms', 'GenerateDataKey', body, 'Plaintext'), 'base64'),
        ),
      };
    },
    async unwrapDataKey(descriptor, wrapped) {
      const body = await invoke(descriptor, 'Decrypt', {
        KeyId: descriptor.keyUri,
        CiphertextBlob: wrapped,
      });
      return assertDataKey(
        'aws_kms',
        Buffer.from(requireString('aws_kms', 'Decrypt', body, 'Plaintext'), 'base64'),
      );
    },
  };
}

export interface GcpKmsProviderOptions extends KmsProviderOptions {
  accessToken?: () => Promise<string>;
}

/**
 * GCP KMS.
 *
 * Cloud KMS has no GenerateDataKey for symmetric keys, so the data key is
 * generated here and encrypted under the customer's key, which is the envelope
 * shape Google's own guidance describes. The plaintext never leaves this
 * process and is never persisted.
 */
export function createGcpKmsProvider(options: GcpKmsProviderOptions = {}): CmekProvider {
  const env = options.env ?? process.env;
  if (!options.accessToken && !read(env, GCP_CREDENTIALS_ENV)) {
    throw new CmekProviderUnconfiguredError('gcp_kms');
  }
  const call = options.fetchImpl ?? fetch;
  const auth = options.accessToken
    ? { token: options.accessToken }
    : (() => {
        const client = new GoogleAuth({ scopes: [GCP_KMS_SCOPE] });
        return { token: async () => (await client.getAccessToken()) ?? '' };
      })();

  async function invoke(
    descriptor: CmekKeyDescriptor,
    operation: 'encrypt' | 'decrypt',
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const token = await auth.token();
    if (!token) throw new CmekProviderUnconfiguredError('gcp_kms');
    const response = await call(`${GCP_KMS_HOST}/${descriptor.keyUri}:${operation}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow('gcp_kms', operation, response);
  }

  return {
    id: 'gcp_kms',
    async generateDataKey(descriptor) {
      const plaintext = randomBytes(CMEK_DATA_KEY_LENGTH);
      const body = await invoke(descriptor, 'encrypt', {
        plaintext: plaintext.toString('base64'),
      });
      return {
        plaintext,
        wrapped: requireString('gcp_kms', 'encrypt', body, 'ciphertext'),
      };
    },
    async unwrapDataKey(descriptor, wrapped) {
      const body = await invoke(descriptor, 'decrypt', { ciphertext: wrapped });
      return assertDataKey(
        'gcp_kms',
        Buffer.from(requireString('gcp_kms', 'decrypt', body, 'plaintext'), 'base64'),
      );
    },
  };
}

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/**
 * Azure Key Vault.
 *
 * Key Vault wraps rather than encrypts, and its keys are asymmetric, so the
 * data key is generated here and wrapped with RSA-OAEP-256 under the
 * customer's key. Values on the wire are base64url, which is why the wrapped
 * key that reaches the database is stored exactly as Key Vault returned it.
 */
export function createAzureKeyVaultProvider(options: KmsProviderOptions = {}): CmekProvider {
  const env = options.env ?? process.env;
  const tenantId = read(env, AZURE_TENANT_ENV);
  const clientId = read(env, AZURE_CLIENT_ID_ENV);
  const clientSecret = read(env, AZURE_CLIENT_SECRET_ENV);
  if (!tenantId || !clientId || !clientSecret) {
    throw new CmekProviderUnconfiguredError('azure_key_vault');
  }
  const credentials: Record<string, string> = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: AZURE_KEY_VAULT_SCOPE,
  };
  const call = options.fetchImpl ?? fetch;

  async function accessToken(): Promise<string> {
    const response = await call(`${AZURE_LOGIN_HOST}/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(credentials).toString(),
    });
    const body = await jsonOrThrow('azure_key_vault', 'token', response);
    return requireString('azure_key_vault', 'token', body, 'access_token');
  }

  async function invoke(
    descriptor: CmekKeyDescriptor,
    operation: 'wrapkey' | 'unwrapkey',
    value: string,
  ): Promise<string> {
    const token = await accessToken();
    const response = await call(
      `${descriptor.keyUri}/${operation}?api-version=${AZURE_KEY_VAULT_API_VERSION}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ alg: AZURE_WRAP_ALGORITHM, value }),
      },
    );
    const body = await jsonOrThrow('azure_key_vault', operation, response);
    return requireString('azure_key_vault', operation, body, 'value');
  }

  return {
    id: 'azure_key_vault',
    async generateDataKey(descriptor) {
      const plaintext = randomBytes(CMEK_DATA_KEY_LENGTH);
      const wrapped = await invoke(descriptor, 'wrapkey', base64UrlEncode(plaintext));
      return { plaintext, wrapped };
    },
    async unwrapDataKey(descriptor, wrapped) {
      const value = await invoke(descriptor, 'unwrapkey', wrapped);
      return assertDataKey('azure_key_vault', base64UrlDecode(value));
    },
  };
}

/**
 * Every provider this deployment holds credentials for. A provider whose
 * credentials are missing is simply absent from the registry, so a workspace
 * whose key lives there is refused with `CmekProviderUnconfiguredError` at
 * resolution rather than served from somewhere else.
 */
export function createKmsProviderRegistry(options: KmsProviderOptions = {}): CmekProviderRegistry {
  const registry: CmekProviderRegistry = {};
  const builders: Array<[CmekProviderId, () => CmekProvider]> = [
    ['aws_kms', () => createAwsKmsProvider(options)],
    ['gcp_kms', () => createGcpKmsProvider(options)],
    ['azure_key_vault', () => createAzureKeyVaultProvider(options)],
  ];
  for (const [id, build] of builders) {
    try {
      registry[id] = build();
    } catch (error) {
      if (!(error instanceof CmekProviderUnconfiguredError)) throw error;
    }
  }
  return registry;
}
