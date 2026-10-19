import { resolveRuntimeEnvironment, type IsolationEnvironment } from '@agiworkforce/data-layer';

export type DevAccountsRefusalCode =
  | 'deployed_runtime'
  | 'database_url_missing'
  | 'database_url_invalid'
  | 'database_not_local'
  | 'database_proxy_not_local'
  | 'database_server_not_local'
  | 'clerk_key_missing'
  | 'clerk_key_not_development'
  | 'stripe_key_missing'
  | 'stripe_key_not_test';

export class DevAccountsRefusal extends Error {
  constructor(
    readonly code: DevAccountsRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevAccountsRefusal';
  }
}

export interface LocalTestEnvironment {
  databaseUrl: string;
  databaseHost: string;
  clerkSecretKey: string;
  stripeSecretKey: string;
}

const DATABASE_URL_KEYS = ['AGI_DATABASE_URL', 'DATABASE_URL'] as const;
const POSTGRES_SCHEMES = new Set(['postgres:', 'postgresql:']);
const LOCAL_HOST_NAMES = new Set(['localhost', '::1']);
const LOOPBACK_IPV4 = /^127(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const LOCAL_NAME_SUFFIXES = ['.localhost', '.test'] as const;
const DATABASE_PROXY_KEY = 'AGI_DATABASE_WS_PROXY';

const CLERK_SECRET_KEY = 'CLERK_SECRET_KEY';
const CLERK_PUBLISHABLE_KEY = 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
const STRIPE_SECRET_KEY = 'STRIPE_SECRET_KEY';
const STRIPE_PUBLISHABLE_KEY = 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY';

const CLERK_DEVELOPMENT_SECRET_PREFIX = 'sk_test_';
const CLERK_DEVELOPMENT_PUBLISHABLE_PREFIX = 'pk_test_';
const STRIPE_TEST_SECRET_PREFIXES = ['sk_test_', 'rk_test_'] as const;
const STRIPE_TEST_PUBLISHABLE_PREFIX = 'pk_test_';

function read(env: IsolationEnvironment, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function hostnameOf(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    if (!POSTGRES_SCHEMES.has(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  } catch {
    return null;
  }
}

export function isLocalHost(host: string): boolean {
  return (
    LOCAL_HOST_NAMES.has(host) ||
    LOOPBACK_IPV4.test(host) ||
    LOCAL_NAME_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

export function isLocalDatabaseUrl(connectionString: string): boolean {
  const host = hostnameOf(connectionString);
  return host !== null && isLocalHost(host);
}

/**
 * Every value in the environment that names a Postgres server, whatever its
 * key. A second URL such as DATABASE_URL_UNPOOLED is as able to reach a shared
 * database as the one the client picks, so all of them must be local.
 */
function postgresUrlEntries(env: IsolationEnvironment): [string, string][] {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => [key, value.trim()] as [string, string])
    .filter(([, value]) => /^postgres(ql)?:\/\//i.test(value));
}

function assertDatabase(env: IsolationEnvironment): { url: string; host: string } {
  const selectedKey = DATABASE_URL_KEYS.find((key) => read(env, key));
  if (!selectedKey) {
    throw new DevAccountsRefusal(
      'database_url_missing',
      'No AGI_DATABASE_URL or DATABASE_URL is set, so there is no local database to seed.',
    );
  }
  const selected = read(env, selectedKey) as string;
  if (!hostnameOf(selected)) {
    throw new DevAccountsRefusal(
      'database_url_invalid',
      `${selectedKey} is not a postgres:// connection string.`,
    );
  }

  for (const [key, value] of postgresUrlEntries(env)) {
    if (!isLocalDatabaseUrl(value)) {
      throw new DevAccountsRefusal(
        'database_not_local',
        `${key} points at "${hostnameOf(value) ?? 'an unreadable host'}". Test accounts are ` +
          'only written to a database on this machine (127.0.0.1, localhost, *.localhost or *.test).',
      );
    }
  }

  const proxy = read(env, DATABASE_PROXY_KEY);
  if (proxy) {
    const proxyHost = (proxy.split(':')[0] ?? '').toLowerCase();
    if (!isLocalHost(proxyHost)) {
      throw new DevAccountsRefusal(
        'database_proxy_not_local',
        `${DATABASE_PROXY_KEY} points at "${proxyHost}", not at this machine.`,
      );
    }
  }

  return { url: selected, host: hostnameOf(selected) as string };
}

function assertClerk(env: IsolationEnvironment): string {
  const secret = read(env, CLERK_SECRET_KEY);
  if (!secret) {
    throw new DevAccountsRefusal(
      'clerk_key_missing',
      `${CLERK_SECRET_KEY} is not set, so no development sign-in account can be made.`,
    );
  }
  if (!secret.startsWith(CLERK_DEVELOPMENT_SECRET_PREFIX)) {
    throw new DevAccountsRefusal(
      'clerk_key_not_development',
      `${CLERK_SECRET_KEY} is not a development-instance key. Test accounts are only made in a Clerk development instance.`,
    );
  }
  const publishable = read(env, CLERK_PUBLISHABLE_KEY);
  if (publishable && !publishable.startsWith(CLERK_DEVELOPMENT_PUBLISHABLE_PREFIX)) {
    throw new DevAccountsRefusal(
      'clerk_key_not_development',
      `${CLERK_PUBLISHABLE_KEY} belongs to a production Clerk instance.`,
    );
  }
  return secret;
}

function assertStripe(env: IsolationEnvironment): string {
  const secret = read(env, STRIPE_SECRET_KEY);
  if (!secret) {
    throw new DevAccountsRefusal(
      'stripe_key_missing',
      `${STRIPE_SECRET_KEY} is not set, so the Stripe-billed test accounts cannot be made.`,
    );
  }
  if (!STRIPE_TEST_SECRET_PREFIXES.some((prefix) => secret.startsWith(prefix))) {
    throw new DevAccountsRefusal(
      'stripe_key_not_test',
      `${STRIPE_SECRET_KEY} is not a test-mode key. Test accounts are only billed in Stripe test mode.`,
    );
  }
  const publishable = read(env, STRIPE_PUBLISHABLE_KEY);
  if (publishable && !publishable.startsWith(STRIPE_TEST_PUBLISHABLE_PREFIX)) {
    throw new DevAccountsRefusal(
      'stripe_key_not_test',
      `${STRIPE_PUBLISHABLE_KEY} is a live-mode key.`,
    );
  }
  return secret;
}

/**
 * Runs before anything is written, and before any module that can open a
 * database or call Clerk or Stripe is loaded. There is no override: an account
 * seeded into a shared database lands next to real users.
 */
export function assertLocalTestEnvironment(env: IsolationEnvironment): LocalTestEnvironment {
  const runtime = resolveRuntimeEnvironment(env);
  if (runtime === 'preview' || runtime === 'production') {
    throw new DevAccountsRefusal(
      'deployed_runtime',
      `This environment declares itself ${runtime}. Test accounts are only made on a development machine.`,
    );
  }
  const database = assertDatabase(env);
  return {
    databaseUrl: database.url,
    databaseHost: database.host,
    clerkSecretKey: assertClerk(env),
    stripeSecretKey: assertStripe(env),
  };
}

/**
 * The address the server reports for this connection. A *.test or *.localhost
 * name is only a name; this is where it resolved. A Unix socket reports null.
 */
export function assertLocalServerAddress(address: string | null): void {
  if (address === null) return;
  const bare = address.split('/')[0]?.toLowerCase() ?? '';
  if (bare === '::1' || LOOPBACK_IPV4.test(bare)) return;
  throw new DevAccountsRefusal(
    'database_server_not_local',
    `The database answered from ${bare}, which is not this machine.`,
  );
}
