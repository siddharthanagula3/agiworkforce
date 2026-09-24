import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  fundingOrganization: vi.fn<(...args: unknown[]) => Promise<string | null>>(async () => null),
  readOrganizationPolicy: vi.fn(),
  monthToDateSpend: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/enterprise-funding-organization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/enterprise-funding-organization')>()),
  resolveEnterpriseFundingOrganizationId: mocks.fundingOrganization,
}));
vi.mock('@/lib/services/organization-policy-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-policy-service')>()),
  readOrganizationPolicy: mocks.readOrganizationPolicy,
}));
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/cogs-ledger-service')>()),
  getOrganizationMonthToDateSpendCents: mocks.monthToDateSpend,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: vi.fn(async () => undefined),
}));

const { reserveManagedUsageRequest } = await import('../managed-usage-request-service');

const webRoot = resolve(import.meta.dirname, '..', '..', '..');
const neonDir = join(webRoot, 'db', 'neon');
const SERVICE = 'lib/services/managed-usage-request-service.ts';

function productionSources(): string[] {
  const sources: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '.next', '__tests__', '__mocks__'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        sources.push(path);
      }
    }
  };
  for (const top of ['app', 'lib']) walk(join(webRoot, top));
  return sources;
}

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every database function that opens or grows a reservation, as the migration chain defines them. */
function reservingFunctions(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(neonDir).filter((name) => /^\d+_.*\.sql$/.test(name))) {
    const sql = readFileSync(join(neonDir, file), 'utf8');
    for (const match of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)/gi,
    )) {
      const name = (match[1] as string).toLowerCase();
      if (/^(reserve|extend)_managed_usage_request/.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

const sources = productionSources().map((path) => ({
  path: relative(webRoot, path).split('\\').join('/'),
  code: codeOnly(readFileSync(path, 'utf8')),
}));

describe('every managed reservation passes the one admission check', () => {
  it('opens or grows a reservation only through the managed usage service', () => {
    const functions = reservingFunctions();
    expect(functions).toEqual(
      expect.arrayContaining([
        'reserve_managed_usage_request_with_limits_microusd',
        'extend_managed_usage_request_provider_step_microusd',
      ]),
    );
    const callers = sources
      .filter(({ code }) => functions.some((name) => code.includes(name)))
      .map(({ path }) => path);
    expect(callers).toEqual([SERVICE]);
  });

  it('reaches the service from every Code surface the server hosts', () => {
    const reservers = sources
      .filter(({ path, code }) => path !== SERVICE && /\breserveManagedUsageRequest\(/.test(code))
      .map(({ path }) => path);
    expect(reservers).toEqual(
      expect.arrayContaining([
        'app/api/llm/v1/chat/completions/lib/request-processor.ts',
        'app/api/code/sessions/[sessionId]/provider-proxy/[...path]/route.ts',
        'lib/services/cloud-code-agent-service.ts',
      ]),
    );
  });
});

describe('reserveManagedUsageRequest, the funding organization cap', () => {
  const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

  function input(organizationId: string | null) {
    const query = vi.fn(async (sql: string) =>
      sql.includes('reserve_managed_usage_request_with_limits_microusd')
        ? [
            {
              reservation_decision: 'acquired',
              request_status: 'reserved',
              lease_token: 'lease-1',
              estimated_cost_microusd: 1_000_000,
            },
          ]
        : [],
    );
    return {
      query,
      request: {
        db: { query } as never,
        userId: 'member-1',
        organizationId,
        idempotencyKey: 'req-00000042',
        requestHash: 'hash-42',
        provider: 'fixture-provider',
        model: 'fixture-model',
        estimatedCostMicrousd: 1_000_000,
        planTier: 'pro',
        isFlagship: false,
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readOrganizationPolicy.mockResolvedValue({ monthlySpendCapCents: 50_000 });
    mocks.monthToDateSpend.mockResolvedValue(50_000);
  });

  it('refuses a turn sent without a workspace once the funding organization is at its cap', async () => {
    mocks.fundingOrganization.mockResolvedValue(ORGANIZATION_ID);
    const { query, request } = input(null);

    await expect(reserveManagedUsageRequest(request)).rejects.toMatchObject({
      status: 402,
      code: 'organization_spend_cap_reached',
    });
    expect(mocks.readOrganizationPolicy).toHaveBeenCalledWith(expect.anything(), ORGANIZATION_ID);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('reserve_managed'))).toBe(false);
  });

  it('refuses a turn scoped to the capped workspace the same way', async () => {
    const { query, request } = input(ORGANIZATION_ID);

    await expect(reserveManagedUsageRequest(request)).rejects.toMatchObject({
      code: 'organization_spend_cap_reached',
    });
    expect(mocks.fundingOrganization).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('reserve_managed'))).toBe(false);
  });

  it('reserves for an account no organization funds', async () => {
    mocks.fundingOrganization.mockResolvedValue(null);
    const { request } = input(null);

    await expect(reserveManagedUsageRequest(request)).resolves.toMatchObject({
      leaseToken: 'lease-1',
    });
    expect(mocks.readOrganizationPolicy).not.toHaveBeenCalled();
  });
});
