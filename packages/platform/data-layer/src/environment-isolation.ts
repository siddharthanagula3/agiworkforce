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
  const rawConfigured = readTrimmed(env, APP_BASE_URL_VAR);
  let end = rawConfigured?.length ?? 0;
  while (end > 0 && rawConfigured?.[end - 1] === '/') end -= 1;
  const configured = rawConfigured?.slice(0, end);
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

export type ConfigKeyType = 'string' | 'url' | 'integer' | 'boolean' | 'enum';

export type ConfigKeyLifecycle = 'in-use' | 'deprecated';

/**
 * What one configuration key is, and where it may be read. A key without an
 * entry is unreadable in production: an unclassified key is one nobody has
 * decided is safe to read there.
 */
export interface ConfigKeyDescriptor {
  /** the name, which is what the process reads */
  key: string;
  type: ConfigKeyType;
  /** the workspace package or web directory that answers for the value */
  owner: string;
  /** what the runtime uses when nothing is set, or null when there is no safe one */
  defaultValue: string | null;
  /** the environments that must have it set, which is what the boot check enforces */
  requiredIn: readonly RuntimeEnvironment[];
  secrecy: ConfigKeySecrecy;
  allowedEnvironments: readonly RuntimeEnvironment[];
  /** what a set value must look like; the message says what is wrong with it */
  validate?: (value: string) => string | null;
  description: string;
  lifecycle: ConfigKeyLifecycle;
  /** what to set instead; required whenever lifecycle is deprecated */
  supersededBy?: string;
}

export type ConfigKeyRegistry = Readonly<Record<string, ConfigKeyDescriptor>>;

export function defineConfigKeys(descriptors: readonly ConfigKeyDescriptor[]): ConfigKeyRegistry {
  return Object.freeze(
    Object.fromEntries(descriptors.map((descriptor) => [descriptor.key, descriptor])),
  );
}

export type ConfigKeyViolationReason =
  | 'environment_not_allowed'
  | 'secret_exposed_to_client'
  | 'required_and_unset'
  | 'invalid_value'
  | 'deprecated_and_set'
  | 'descriptor_incomplete';

export interface ConfigKeyViolation {
  key: string;
  environment: RuntimeEnvironment;
  reason: ConfigKeyViolationReason;
  message: string;
}

const CLIENT_READABLE_PREFIX = 'NEXT_PUBLIC_';

function describeDescriptor(
  descriptor: ConfigKeyDescriptor,
  environment: RuntimeEnvironment,
): ConfigKeyViolation[] {
  const violations: ConfigKeyViolation[] = [];
  const fail = (reason: ConfigKeyViolationReason, message: string) =>
    violations.push({ key: descriptor.key, environment, reason, message });

  if (descriptor.secrecy === 'secret' && descriptor.key.startsWith(CLIENT_READABLE_PREFIX)) {
    fail(
      'secret_exposed_to_client',
      `${descriptor.key} is registered as a secret but its ${CLIENT_READABLE_PREFIX} name ships its value to every browser.`,
    );
  }
  if (descriptor.description.trim().length === 0) {
    fail('descriptor_incomplete', `${descriptor.key} carries no description.`);
  }
  if (descriptor.owner.trim().length === 0) {
    fail('descriptor_incomplete', `${descriptor.key} names no owner.`);
  }
  if (descriptor.lifecycle === 'deprecated' && !descriptor.supersededBy?.trim()) {
    fail(
      'descriptor_incomplete',
      `${descriptor.key} is deprecated but names nothing to set instead.`,
    );
  }
  for (const required of descriptor.requiredIn) {
    if (descriptor.allowedEnvironments.includes(required)) continue;
    fail(
      'descriptor_incomplete',
      `${descriptor.key} is required in ${required} but is not allowed there.`,
    );
  }
  if (descriptor.defaultValue !== null && descriptor.secrecy === 'secret') {
    fail('descriptor_incomplete', `${descriptor.key} is a secret with a default value.`);
  }
  return violations;
}

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
    violations.push(...describeDescriptor(descriptor, environment));

    const value = readTrimmed(env, descriptor.key);
    if (value === undefined) {
      if (descriptor.requiredIn.includes(environment) && descriptor.defaultValue === null) {
        violations.push({
          key: descriptor.key,
          environment,
          reason: 'required_and_unset',
          message: `${descriptor.key} is required in ${environment} and has no safe default: ${descriptor.description}`,
        });
      }
      continue;
    }

    if (descriptor.lifecycle === 'deprecated') {
      violations.push({
        key: descriptor.key,
        environment,
        reason: 'deprecated_and_set',
        message: `${descriptor.key} is deprecated and still set. Use ${descriptor.supersededBy} instead.`,
      });
    }

    const problem = descriptor.validate?.(value) ?? null;
    if (problem !== null) {
      violations.push({
        key: descriptor.key,
        environment,
        reason: 'invalid_value',
        message: `${descriptor.key} is set to a value this runtime refuses: ${problem}`,
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

export interface DeployedValueRule {
  /** what the value looks like when it belongs to another environment */
  readonly match: (value: string) => boolean;
  /** the environments that must refuse a value of this shape */
  readonly refusedIn: readonly RuntimeEnvironment[];
  readonly consequence: string;
}

const PLACEHOLDER_VALUES = new Set([
  'changeme',
  'change-me',
  'example',
  'placeholder',
  'replace-me',
  'secret',
  'test',
  'todo',
  'xxx',
  'yourvaluehere',
]);

function isPlaceholder(value: string): boolean {
  const normalised = value.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalised)) return true;
  if (normalised.startsWith('your-') || normalised.startsWith('your_')) return true;
  return /^(.)\1{5,}$/u.test(normalised);
}

/**
 * The shapes a deployed runtime must refuse. A test key in production takes no
 * money and signs nobody in; a live key in preview spends and signs in against
 * the real accounts, which is the same database and the same customers.
 */
export const DEPLOYED_VALUE_RULES: Readonly<Record<string, DeployedValueRule>> = Object.freeze({
  test_credential: {
    match: (value) => /^(?:sk|pk|rk|whsec)_test_/u.test(value),
    refusedIn: ['production'],
    consequence:
      'a test-mode credential in production takes no payment and authenticates nobody, so the ' +
      'deployment looks healthy while every paid action silently does nothing',
  },
  live_credential: {
    match: (value) => /^(?:sk|pk|rk|whsec)_live_/u.test(value),
    refusedIn: ['preview'],
    consequence:
      'a live credential in preview spends real money and mutates the real account, so preview ' +
      'and production stop being separate environments',
  },
  loopback_url: {
    match: (value) => /^https?:\/\//u.test(value) && isLoopbackConnectionString(value),
    refusedIn: ['preview', 'production'],
    consequence: 'a deployed runtime cannot reach the operator laptop, so the link goes nowhere',
  },
  placeholder: {
    match: isPlaceholder,
    refusedIn: ['preview', 'production'],
    consequence: 'a placeholder is a value nobody chose, so what it configures is undefined',
  },
});

export interface DeployedValueViolation {
  key: string;
  environment: RuntimeEnvironment;
  rule: string;
  message: string;
}

/**
 * Enumerates the registry rather than a list of keys to check, so a key added
 * without a thought about which environment its value belongs to is still
 * measured.
 */
export function deployedValueViolations(
  registry: ConfigKeyRegistry,
  env: IsolationEnvironment = process.env,
  environment: RuntimeEnvironment = resolveRuntimeEnvironment(env),
): DeployedValueViolation[] {
  const violations: DeployedValueViolation[] = [];

  for (const descriptor of Object.values(registry)) {
    const value = readTrimmed(env, descriptor.key);
    if (value === undefined) continue;
    for (const [rule, { match, refusedIn, consequence }] of Object.entries(DEPLOYED_VALUE_RULES)) {
      if (!refusedIn.includes(environment) || !match(value)) continue;
      violations.push({
        key: descriptor.key,
        environment,
        rule,
        message: `${descriptor.key} carries a ${rule.replace(/_/gu, ' ')} value in ${environment}: ${consequence}.`,
      });
    }
  }

  return violations;
}
