import { randomUUID } from 'node:crypto';
import { PostgresDatabaseAdapter } from '@agiworkforce/data-layer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({ deleteUser: vi.fn(async () => undefined) }));

vi.mock('server-only', () => ({}));
vi.mock('../identity', () => ({ getIdentityProvider: () => identity }));

const liveDatabaseUrl = process.env['AGI_LIVE_DATABASE_URL'];
const live = process.env['AGI_TEST_LIVE_ACCOUNT_ERASURE'] === '1' && Boolean(liveDatabaseUrl);

if (liveDatabaseUrl) {
  process.env['AGI_DATABASE_URL'] = liveDatabaseUrl;
  process.env['DATABASE_URL'] = liveDatabaseUrl;
  process.env['AGI_DATABASE_PROVIDER'] = process.env['AGI_LIVE_DATABASE_PROVIDER'] ?? 'postgres';
  process.env['AGI_KV_PROVIDER'] = 'none';
}

const fixture = {
  userId: `qa-erasure-${randomUUID()}`,
  email: `qa-erasure-${randomUUID()}@example.test`,
  conversationId: randomUUID(),
  providerCostEventId: randomUUID(),
  personalUsageId: randomUUID(),
  organizationUsageId: randomUUID(),
  organizationId: randomUUID(),
};

let client: PostgresDatabaseAdapter;

async function seed(): Promise<void> {
  await client.query(
    `insert into public.profiles
       (id, email, account_status, deletion_requested_at, deletion_scheduled_for)
     values ($1, $2, 'deletion_scheduled', now() - interval '2 days', now() - interval '1 day')`,
    [fixture.userId, fixture.email],
  );
  await client.query(
    `insert into public.identities (provider, subject, user_id)
     values ('clerk', $1, $1)`,
    [fixture.userId],
  );
  await client.query(
    `insert into public.user_settings (user_id, settings, server_version)
     values ($1, '{"theme":"dark"}'::jsonb, 1)`,
    [fixture.userId],
  );
  await client.query(
    `insert into public.web_conversations (id, user_id, title, server_version)
     values ($1, $2, 'Disposable erasure probe', 1)`,
    [fixture.conversationId, fixture.userId],
  );
  await client.query(
    `insert into public.token_credits
       (user_id, period_start, period_end, credits_allocated_cents, credits_used_cents)
     values ($1, now() - interval '1 day', now() + interval '1 day', 100, 0)`,
    [fixture.userId],
  );
  await client.query(
    `insert into public.beta_applications (email, full_name, role, user_id)
     values ($1, 'Disposable Probe', 'developer', null)`,
    [fixture.email],
  );
  await client.query(
    `insert into public.provider_cost_events
       (id, user_id, capability, provider, unit_basis, units, provider_cost_cents, source_ref)
     values ($1, $2, 'chat', 'probe', 'request', 1, 1, $3)`,
    [fixture.providerCostEventId, fixture.userId, `erasure-probe:${fixture.userId}`],
  );
  await client.query(
    `insert into public.organizations (id, name, slug)
     values ($1, 'Disposable Erasure Probe', $2)`,
    [fixture.organizationId, `qa-erasure-${randomUUID()}`],
  );
  await client.query(
    `insert into public.organization_usage_ledger
       (id, user_id, privacy_mode, provider, model, input_tokens, output_tokens,
        provider_cost_usd, charged_amount_usd, gross_margin_usd)
     values ($1, $2, 'managed', 'probe', 'probe-model', 1, 1, 0.01, 0.02, 0.01)`,
    [fixture.personalUsageId, fixture.userId],
  );
  await client.query(
    `insert into public.organization_usage_ledger
       (id, organization_id, user_id, privacy_mode, provider, model, input_tokens, output_tokens,
        provider_cost_usd, charged_amount_usd, gross_margin_usd)
     values ($1, $2, $3, 'managed', 'probe', 'probe-model', 1, 1, 0.01, 0.02, 0.01)`,
    [fixture.organizationUsageId, fixture.organizationId, fixture.userId],
  );
}

async function cleanup(): Promise<void> {
  await client.query('delete from public.provider_cost_events where id = $1', [
    fixture.providerCostEventId,
  ]);
  await client.query('delete from public.organization_usage_ledger where id = $1', [
    fixture.organizationUsageId,
  ]);
  await client.query('delete from public.organization_usage_ledger where id = $1', [
    fixture.personalUsageId,
  ]);
  await client.query('delete from public.organizations where id = $1', [fixture.organizationId]);
  await client.query('delete from public.erasure_tombstones where user_id = $1', [fixture.userId]);
  await client.query('delete from public.beta_applications where email = $1', [fixture.email]);
  await client.query('delete from public.profiles where id = $1', [fixture.userId]);
}

// llm-guardrail-allow: Live database writes require AGI_TEST_LIVE_ACCOUNT_ERASURE=1 and an explicitly supplied AGI_LIVE_DATABASE_URL.
describe.skipIf(!live)('scheduled account erasure, live PostgreSQL', () => {
  beforeAll(async () => {
    if (!liveDatabaseUrl) throw new Error('Live database URL is required.');
    client = new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl });
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    if (!client) return;
    await cleanup();
    await client.dispose();
  });

  it('deletes subject stores, anonymizes retained financial records and closes the tombstone', async () => {
    const { eraseScheduledAccount } = await import('../scheduled-account-erasure');

    await expect(eraseScheduledAccount(fixture.userId)).resolves.toEqual({
      status: 'purged',
      resurrected: false,
    });
    expect(identity.deleteUser).toHaveBeenCalledWith(fixture.userId);

    const deleted = await client.query<{ profile: string; settings: string; conversation: string }>(
      `select
         (select count(*)::text from public.profiles where id = $1) as profile,
         (select count(*)::text from public.user_settings where user_id = $1) as settings,
         (select count(*)::text from public.web_conversations where user_id = $1) as conversation`,
      [fixture.userId],
    );
    expect(deleted[0]).toEqual({ profile: '0', settings: '0', conversation: '0' });

    const related = await client.query<{
      identities: string;
      credits: string;
      betaApplications: string;
    }>(
      `select
         (select count(*)::text from public.identities where user_id = $1) as identities,
         (select count(*)::text from public.token_credits where user_id = $1) as credits,
         (select count(*)::text from public.beta_applications where lower(email) = lower($2))
           as "betaApplications"`,
      [fixture.userId, fixture.email],
    );
    expect(related[0]).toEqual({ identities: '0', credits: '0', betaApplications: '0' });

    const retained = await client.query<{
      providerCostUserId: string | null;
      organizationUsageUserId: string | null;
      personalUsageRows: string;
      tombstoneClosed: boolean;
    }>(
      `select
         (select user_id from public.provider_cost_events where id = $1) as "providerCostUserId",
         (select user_id from public.organization_usage_ledger where id = $2)
           as "organizationUsageUserId",
         (select count(*)::text from public.organization_usage_ledger where id = $3)
           as "personalUsageRows",
         exists (
           select 1 from public.erasure_tombstones
            where user_id = $4 and erased_at is not null
         ) as "tombstoneClosed"`,
      [
        fixture.providerCostEventId,
        fixture.organizationUsageId,
        fixture.personalUsageId,
        fixture.userId,
      ],
    );
    expect(retained[0]).toEqual({
      providerCostUserId: null,
      organizationUsageUserId: null,
      personalUsageRows: '0',
      tombstoneClosed: true,
    });
  });
});
