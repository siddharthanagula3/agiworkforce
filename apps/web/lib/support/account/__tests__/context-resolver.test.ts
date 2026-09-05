import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  getSubscription: vi.fn(),
  getManagedUsageSummary: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const callerDb = { query: mocks.query, execute: mocks.execute } as never;
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mocks.getSubscription },
}));
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: mocks.getManagedUsageSummary,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: () => new Set(['slack', 'notion']),
  getUserGithubInstallations: vi.fn(async () => []),
  getUserCustomConnectorSummaries: vi.fn(async () => []),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { getUser: mocks.getUser } }),
}));

import { buildSupportAccountCitations, resolveSupportAccountContext } from '../context-resolver';

const USER = 'user_a';

function usageSummary() {
  return {
    plan_tier: 'pro',
    usage_percentage: 42,
    usage_reset_at: '2026-09-01T00:00:00.000Z',
    has_usage_remaining: true,
    period_start: null,
    period_end: null,
    subscription_status: 'active',
    session_usage_percentage: 10,
    session_reset_at: null,
    weekly_usage_percentage: 30,
    weekly_reset_at: null,
    flagship_weekly_usage_percentage: 5,
    flagship_weekly_reset_at: null,
  };
}

describe('resolveSupportAccountContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
      current_period_end: new Date('2026-09-01T00:00:00.000Z'),
      stripe_subscription_id: 'sub_1',
    });
    mocks.getManagedUsageSummary.mockResolvedValue(usageSummary());
    mocks.getUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'someone@example.com',
        verification: { status: 'verified' },
      },
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (/from user_connectors/iu.test(sql)) {
        return [
          { id: 'row-1', connector_id: 'slack', connected_at: '2026-07-01T00:00:00.000Z' },
          { id: 'row-2', connector_id: 'dropbox', connected_at: '2026-07-01T00:00:00.000Z' },
        ];
      }
      if (/from public\.api_keys/iu.test(sql)) return [{ count: '2' }];
      throw new Error(`unexpected SQL: ${sql}`);
    });
  });

  it('refuses to resolve without an authenticated user id', async () => {
    await expect(resolveSupportAccountContext(callerDb, '')).rejects.toThrow(
      /authenticated user id/iu,
    );
  });

  it('binds every query to the caller', async () => {
    await resolveSupportAccountContext(callerDb, USER);
    expect(mocks.query.mock.calls.length).toBeGreaterThan(0);
    for (const [sql, params] of mocks.query.mock.calls as [string, unknown[]][]) {
      expect(sql).toMatch(/user_id = \$1/u);
      expect(params[0]).toBe(USER);
    }
    expect(mocks.getSubscription).toHaveBeenCalledWith(callerDb, USER);
    expect(mocks.getManagedUsageSummary).toHaveBeenCalledWith(callerDb, USER);
  });

  it('reports the plan honestly, keeping raw and effective tier apart', async () => {
    mocks.getSubscription.mockResolvedValue({
      plan_tier: 'pro',
      status: 'canceled',
      current_period_end: null,
      stripe_subscription_id: 'sub_1',
    });
    const context = await resolveSupportAccountContext(callerDb, USER);
    expect(context.plan.tier).toBe('pro');
    expect(context.plan.status).toBe('canceled');
    expect(context.plan.effectiveTier).not.toBe('pro');
    expect(context.plan.subscriptionSource).toBe('stripe');
  });

  it('reports only percentages for usage', async () => {
    const context = await resolveSupportAccountContext(callerDb, USER);
    expect(context.usage).toEqual({
      usagePercentage: 42,
      sessionUsagePercentage: 10,
      weeklyUsagePercentage: 30,
      flagshipWeeklyUsagePercentage: 5,
      usageResetAt: '2026-09-01T00:00:00.000Z',
      sessionResetAt: null,
      weeklyResetAt: null,
      hasUsageRemaining: true,
    });
  });

  it('degrades to unknown usage rather than guessing when the summary fails', async () => {
    mocks.getManagedUsageSummary.mockRejectedValue(new Error('ledger down'));
    const context = await resolveSupportAccountContext(callerDb, USER);
    expect(context.usage).toBeNull();
  });

  it('only reports connectors that would actually work', async () => {
    const context = await resolveSupportAccountContext(callerDb, USER);
    expect(context.connectors.map((c) => c.connectorId)).toEqual(['slack']);
  });

  it('never imports the private managed-usage policy module', () => {
    const dir = path.resolve(import.meta.dirname, '..');
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.ts'))
      .map((e) => path.join(dir, e.name));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, `${path.basename(file)} imports the private usage policy`).not.toMatch(
        /(?:^|\n)\s*(?:import|export)[^;\n]*from\s+['"][^'"]*managed-usage-policy['"]/u,
      );
      expect(source).not.toMatch(/(?:await\s+)?import\(\s*['"][^'"]*managed-usage-policy['"]/u);
    }
  });

  describe('email verification', () => {
    it('reports verified when the provider says so', async () => {
      const context = await resolveSupportAccountContext(callerDb, USER);
      expect(context.email).toEqual({ present: true, verified: 'verified' });
    });

    it('reports unverified only on an explicit unverified status', async () => {
      mocks.getUser.mockResolvedValue({
        primaryEmailAddress: {
          emailAddress: 'someone@example.com',
          verification: { status: 'unverified' },
        },
      });
      const context = await resolveSupportAccountContext(callerDb, USER);
      expect(context.email.verified).toBe('unverified');
    });

    it('reports unknown, not unverified, when the lookup fails', async () => {
      mocks.getUser.mockRejectedValue(new Error('clerk getUser timeout'));
      const context = await resolveSupportAccountContext(callerDb, USER);
      expect(context.email.verified).toBe('unknown');
    });

    it('never puts the address itself in the context', async () => {
      const context = await resolveSupportAccountContext(callerDb, USER);
      expect(JSON.stringify(context)).not.toContain('someone@example.com');
    });
  });

  describe('citations', () => {
    it('cites a real page for every fact group it returns', async () => {
      const context = await resolveSupportAccountContext(callerDb, USER);
      const citations = buildSupportAccountCitations(context);
      expect(citations.length).toBeGreaterThan(0);

      const appDir = path.resolve(import.meta.dirname, '../../../../app');
      for (const citation of citations) {
        const pagePath = path.join(appDir, citation.href.replace(/^\//u, ''), 'page.tsx');
        expect(fs.existsSync(pagePath), `${citation.href} has no page.tsx`).toBe(true);
      }
    });

    it('does not cite a usage page when usage could not be resolved', async () => {
      mocks.getManagedUsageSummary.mockRejectedValue(new Error('ledger down'));
      const context = await resolveSupportAccountContext(callerDb, USER);
      const citations = buildSupportAccountCitations(context);
      expect(citations.map((c) => c.id)).not.toContain('account:usage');
    });
  });
});
