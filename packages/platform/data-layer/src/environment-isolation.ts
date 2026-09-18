/**
 * @file environment-isolation.ts
 * @module @agiworkforce/data-layer/environment-isolation
 *
 * # A development runtime may not attach to a shared database
 *
 * The composition root resolves one connection string from the environment and
 * hands it to whichever adapter the provider selection picked. Nothing in that
 * path asks *which* database it just reached, so a developer whose `.env.local`
 * still carries the deployed credentials runs every local request, every test
 * fixture and every automated browser sweep against real user rows. That has
 * happened twice: once as 5.56 GB of transfer quota spent on QA traffic, and
 * again on 2026-09-08 with a dev server on :3100 reading and writing the shared
 * endpoint.
 *
 * The rule is a host shape, not a host list. A deployed runtime keeps whatever
 * credentials the platform gave it. A development or test runtime must reach a
 * loopback address, which is the only address that cannot be shared with
 * anybody else. Naming production hosts instead would mean maintaining a list
 * that is wrong the day a second environment is created.
 *
 * The escape hatch is deliberate and unmistakable: `AGI_ALLOW_REMOTE_DATABASE`
 * must be set to a sentence that states what it permits. A value of `1` or
 * `true` is refused, so the override cannot be reached by reflex.
 */

import { DataLayerConfigError } from './types';

export type RuntimeEnvironment = 'development' | 'test' | 'preview' | 'production';

export type IsolationEnvironment = Record<string, string | undefined>;

const DEPLOY_ENVIRONMENT_VARS = ['AGI_DEPLOY_ENV', 'VERCEL_ENV'] as const;
const NODE_ENVIRONMENT_VAR = 'NODE_ENV';

export const REMOTE_DATABASE_OVERRIDE_VAR = 'AGI_ALLOW_REMOTE_DATABASE';
export const REMOTE_DATABASE_OVERRIDE_VALUE =
  'yes-i-am-pointing-a-development-runtime-at-a-shared-database';

export const RUNTIME_ENVIRONMENTS: readonly RuntimeEnvironment[] = [
  'development',
  'test',
  'preview',
  'production',
];

/** Environments that own their own data and may hold remote credentials. */
const DEPLOYED_ENVIRONMENTS: ReadonlySet<RuntimeEnvironment> = new Set<RuntimeEnvironment>([
  'preview',
  'production',
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOOPBACK_IPV4_PREFIX = '127.';
const LOOPBACK_SUFFIX = '.localhost';

function readTrimmed(env: IsolationEnvironment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function asRuntimeEnvironment(raw: string | undefined): RuntimeEnvironment | undefined {
  if (!raw) return undefined;
  const lowered = raw.toLowerCase();
  return RUNTIME_ENVIRONMENTS.find((candidate) => candidate === lowered);
}

/**
 * The platform's own deployment marker wins over `NODE_ENV`, because a deployed
 * runtime sets both and `NODE_ENV` alone cannot distinguish a preview
 * deployment from a laptop running a production build.
 */
export function resolveRuntimeEnvironment(
  env: IsolationEnvironment = process.env,
): RuntimeEnvironment {
  for (const name of DEPLOY_ENVIRONMENT_VARS) {
    const declared = asRuntimeEnvironment(readTrimmed(env, name));
    if (declared) return declared;
  }
  return asRuntimeEnvironment(readTrimmed(env, NODE_ENVIRONMENT_VAR)) ?? 'development';
}

function normalizeHostname(hostname: string): string {
  const unbracketed =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return unbracketed.toLowerCase();
}

export function isLoopbackConnectionString(connectionString: string): boolean {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return false;
  }
  const hostname = normalizeHostname(url.hostname);
  return (
    LOOPBACK_HOSTS.has(hostname) ||
    hostname.startsWith(LOOPBACK_IPV4_PREFIX) ||
    hostname.endsWith(LOOPBACK_SUFFIX)
  );
}

function overrideIsSet(env: IsolationEnvironment): boolean {
  return readTrimmed(env, REMOTE_DATABASE_OVERRIDE_VAR) === REMOTE_DATABASE_OVERRIDE_VALUE;
}

export interface DatabaseEnvironmentIsolationOptions {
  connectionString: string;
  env?: IsolationEnvironment;
}

/**
 * Refuse a remote database when the runtime is not entitled to one.
 *
 * Allowed: development against loopback, test against loopback, and any
 * deployed environment against whatever it was given. Refused: development or
 * test against a host that anything else can also reach.
 *
 * @throws DataLayerConfigError when a development or test runtime resolves a
 * non-loopback connection string without the explicit override.
 */
export function assertDatabaseEnvironmentIsolation({
  connectionString,
  env = process.env,
}: DatabaseEnvironmentIsolationOptions): void {
  const environment = resolveRuntimeEnvironment(env);
  if (DEPLOYED_ENVIRONMENTS.has(environment)) return;
  if (isLoopbackConnectionString(connectionString)) return;
  if (overrideIsSet(env)) return;

  let host: string;
  try {
    host = new URL(connectionString).host;
  } catch {
    return;
  }

  throw new DataLayerConfigError(
    `A ${environment} runtime resolved a database at "${host}", which is not a loopback ` +
      'address. A development or test runtime must use a local database, because anything ' +
      'else is shared with real users: its rows are theirs, and its transfer quota is spent ' +
      'on them. Point AGI_DATABASE_URL (or DATABASE_URL) at 127.0.0.1, or, if reaching this ' +
      `host is genuinely intended, set ${REMOTE_DATABASE_OVERRIDE_VAR}=` +
      `"${REMOTE_DATABASE_OVERRIDE_VALUE}".`,
  );
}

export const APP_BASE_URL_VAR = 'NEXT_PUBLIC_APP_URL';
const LOCAL_PORT_VAR = 'PORT';
const DEFAULT_LOCAL_PORT = '3000';

function localBaseUrl(env: IsolationEnvironment): string {
  return `http://127.0.0.1:${readTrimmed(env, LOCAL_PORT_VAR) ?? DEFAULT_LOCAL_PORT}`;
}

// The origin this runtime serves, for every link it generates. A guessed origin
// sends password resets, OAuth callbacks and email links to another deployment.
export function resolveEnvironmentBaseUrl(env: IsolationEnvironment = process.env): string {
  const environment = resolveRuntimeEnvironment(env);
  const configured = readTrimmed(env, APP_BASE_URL_VAR)?.replace(/\/+$/, '');
  const deployed = DEPLOYED_ENVIRONMENTS.has(environment);

  if (!configured) {
    if (!deployed) return localBaseUrl(env);
    throw new DataLayerConfigError(
      `A ${environment} runtime has no ${APP_BASE_URL_VAR}, so every generated link would name a ` +
        'guessed origin. Set it to the origin this deployment serves.',
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new DataLayerConfigError(`${APP_BASE_URL_VAR} is not a URL: "${configured}".`);
  }

  if (deployed) {
    if (url.protocol !== 'https:') {
      throw new DataLayerConfigError(
        `${APP_BASE_URL_VAR} must use https in ${environment}, not ${url.protocol.replace(':', '')}.`,
      );
    }
    return url.origin;
  }

  if (!isLoopbackConnectionString(configured)) {
    throw new DataLayerConfigError(
      `A ${environment} runtime resolved the base URL "${url.origin}", which a deployed ` +
        'environment also serves. Links, OAuth callbacks and emails generated here would point ' +
        `at real users' deployment. Point ${APP_BASE_URL_VAR} at 127.0.0.1.`,
    );
  }

  return url.origin;
}

export type ConfigKeySecrecy = 'secret' | 'public';

/**
 * What one configuration key is, and where it may be read. A key without an
 * entry is unreadable in production: an unclassified key is one nobody has
 * decided is safe to read there.
 */
export interface ConfigKeyDescriptor {
  key: string;
  secrecy: ConfigKeySecrecy;
  allowedEnvironments: readonly RuntimeEnvironment[];
}

export type ConfigKeyRegistry = Readonly<Record<string, ConfigKeyDescriptor>>;

export function defineConfigKeys(descriptors: readonly ConfigKeyDescriptor[]): ConfigKeyRegistry {
  return Object.freeze(
    Object.fromEntries(descriptors.map((descriptor) => [descriptor.key, descriptor])),
  );
}

export interface ConfigKeyViolation {
  key: string;
  environment: RuntimeEnvironment;
  reason: 'environment_not_allowed' | 'secret_exposed_to_client';
  message: string;
}

const CLIENT_READABLE_PREFIX = 'NEXT_PUBLIC_';

/**
 * A secret named so the bundler inlines it into client JavaScript is not a
 * secret. That is a static property of the key, so it is checked in every
 * environment, not only the deployed ones.
 */
export function checkConfigKeys(
  registry: ConfigKeyRegistry,
  env: IsolationEnvironment = process.env,
  environment: RuntimeEnvironment = resolveRuntimeEnvironment(env),
): ConfigKeyViolation[] {
  const violations: ConfigKeyViolation[] = [];

  for (const descriptor of Object.values(registry)) {
    if (descriptor.secrecy === 'secret' && descriptor.key.startsWith(CLIENT_READABLE_PREFIX)) {
      violations.push({
        key: descriptor.key,
        environment,
        reason: 'secret_exposed_to_client',
        message: `${descriptor.key} is registered as a secret but its ${CLIENT_READABLE_PREFIX} name ships its value to every browser.`,
      });
    }
  }

  for (const key of Object.keys(env)) {
    if (readTrimmed(env, key) === undefined) continue;
    const descriptor = registry[key];
    if (!descriptor) continue;
    if (descriptor.allowedEnvironments.includes(environment)) continue;
    violations.push({
      key,
      environment,
      reason: 'environment_not_allowed',
      message: `${key} is set in a ${environment} runtime but is only allowed in ${descriptor.allowedEnvironments.join(', ')}.`,
    });
  }

  return violations;
}
