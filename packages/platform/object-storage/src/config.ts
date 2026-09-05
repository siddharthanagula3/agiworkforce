import { ObjectStorageConfigError, type ObjectStorageProvider } from './types';

export const OBJECT_STORAGE_PROVIDER_ENV = 'AGI_STORAGE_PROVIDER';
export const OBJECT_STORAGE_ENDPOINT_ENV = 'AGI_STORAGE_ENDPOINT';
export const OBJECT_STORAGE_REGION_ENV = 'AGI_STORAGE_REGION';
export const OBJECT_STORAGE_BUCKET_ENV = 'AGI_STORAGE_BUCKET';
export const OBJECT_STORAGE_PRIVATE_BUCKET_ENV = 'AGI_STORAGE_PRIVATE_BUCKET';
export const OBJECT_STORAGE_ACCESS_KEY_ID_ENV = 'AGI_STORAGE_ACCESS_KEY_ID';
export const OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV = 'AGI_STORAGE_SECRET_ACCESS_KEY';
export const OBJECT_STORAGE_PUBLIC_BASE_URL_ENV = 'AGI_STORAGE_PUBLIC_BASE_URL';
export const OBJECT_STORAGE_FORCE_PATH_STYLE_ENV = 'AGI_STORAGE_FORCE_PATH_STYLE';

export const R2_ACCOUNT_ID_ENV = 'CLOUDFLARE_R2_ACCOUNT_ID';
export const R2_ACCESS_KEY_ID_ENV = 'CLOUDFLARE_R2_ACCESS_KEY_ID';
export const R2_SECRET_ACCESS_KEY_ENV = 'CLOUDFLARE_R2_SECRET_ACCESS_KEY';
export const R2_BUCKET_ENV = 'CLOUDFLARE_R2_BUCKET_NAME';
export const R2_PRIVATE_BUCKET_ENV = 'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME';
export const R2_PUBLIC_BASE_URL_ENV = 'CLOUDFLARE_R2_PUBLIC_BASE_URL';

const OBJECT_STORAGE_PROVIDERS: readonly ObjectStorageProvider[] = ['s3', 'memory', 'none'];
const DEFAULT_STORAGE_REGION = 'auto';
const R2_ENDPOINT_HOST_SUFFIX = 'r2.cloudflarestorage.com';
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu;
const BUCKET_NAME_PATTERN = /^(?!-)[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/u;
const ENDPOINT_PROTOCOLS = new Set(['https:', 'http:']);
const ENABLED_VALUES = new Set(['1', 'true', 'yes']);

export type ObjectStorageEnvironment = Record<string, string | undefined>;

export interface ObjectStorageConfig {
  provider: ObjectStorageProvider;
  endpoint: string | undefined;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  publicBucket: string | undefined;
  privateBucket: string | undefined;
  publicBaseUrl: string | undefined;
}

function read(env: ObjectStorageEnvironment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function processEnvironment(): ObjectStorageEnvironment {
  if (typeof process === 'undefined' || !process.env) return {};
  return process.env;
}

function r2Endpoint(env: ObjectStorageEnvironment): string | undefined {
  const accountId = read(env, R2_ACCOUNT_ID_ENV);
  if (!accountId || !DNS_LABEL_PATTERN.test(accountId)) return undefined;
  return `https://${accountId}.${R2_ENDPOINT_HOST_SUFFIX}`;
}

function readProvider(env: ObjectStorageEnvironment): ObjectStorageProvider | undefined {
  const configured = read(env, OBJECT_STORAGE_PROVIDER_ENV)?.toLowerCase();
  if (!configured) return undefined;
  if ((OBJECT_STORAGE_PROVIDERS as readonly string[]).includes(configured)) {
    return configured as ObjectStorageProvider;
  }
  throw new ObjectStorageConfigError(
    `${OBJECT_STORAGE_PROVIDER_ENV}="${configured}" is not one of: ${OBJECT_STORAGE_PROVIDERS.join(', ')}`,
  );
}

/**
 * The single resolution order for every storage setting. A neutral name wins;
 * the Cloudflare-specific name behind it is the fallback so an environment
 * that was provisioned before the port existed keeps working untouched. The
 * endpoint is derived from the account id only when that id is a single DNS
 * label, so a hostname smuggled into it never becomes part of an origin this
 * app reaches or allows a browser to reach.
 */
export function resolveObjectStorageConfig(
  env: ObjectStorageEnvironment = processEnvironment(),
): ObjectStorageConfig {
  const endpoint = read(env, OBJECT_STORAGE_ENDPOINT_ENV) ?? r2Endpoint(env);
  const accessKeyId =
    read(env, OBJECT_STORAGE_ACCESS_KEY_ID_ENV) ?? read(env, R2_ACCESS_KEY_ID_ENV);
  const secretAccessKey =
    read(env, OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV) ?? read(env, R2_SECRET_ACCESS_KEY_ENV);
  const explicitProvider = readProvider(env);
  const credentialed = Boolean(endpoint && accessKeyId && secretAccessKey);

  return {
    provider: explicitProvider ?? (credentialed ? 's3' : 'none'),
    endpoint,
    region: read(env, OBJECT_STORAGE_REGION_ENV) ?? DEFAULT_STORAGE_REGION,
    forcePathStyle: ENABLED_VALUES.has(
      read(env, OBJECT_STORAGE_FORCE_PATH_STYLE_ENV)?.toLowerCase() ?? '',
    ),
    accessKeyId,
    secretAccessKey,
    publicBucket: read(env, OBJECT_STORAGE_BUCKET_ENV) ?? read(env, R2_BUCKET_ENV),
    privateBucket: read(env, OBJECT_STORAGE_PRIVATE_BUCKET_ENV) ?? read(env, R2_PRIVATE_BUCKET_ENV),
    publicBaseUrl:
      read(env, OBJECT_STORAGE_PUBLIC_BASE_URL_ENV) ?? read(env, R2_PUBLIC_BASE_URL_ENV),
  };
}

export function hasObjectStorageCredentials(config: ObjectStorageConfig): boolean {
  return Boolean(config.endpoint && config.accessKeyId && config.secretAccessKey);
}

function endpointUrl(endpoint: string | undefined): URL | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return ENDPOINT_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The origins a browser may upload to directly, for whatever egress allowlist
 * the surface enforces. They are derived from the configured endpoint and
 * bucket names, so moving the bucket to another host moves the allowlist with
 * it, and a bucket name that is not a single DNS label is refused rather than
 * widening the origin into a domain someone else controls.
 */
export function objectStorageUploadOrigins(config: ObjectStorageConfig): string[] {
  const url = endpointUrl(config.endpoint);
  if (!url) return [];
  if (config.forcePathStyle) return [url.origin];

  const origins: string[] = [];
  for (const bucket of [config.publicBucket, config.privateBucket]) {
    if (!bucket || !BUCKET_NAME_PATTERN.test(bucket)) continue;
    origins.push(`${url.protocol}//${bucket}.${url.host}`);
  }
  return origins;
}
