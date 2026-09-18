import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0227_payment_provider_subscription_history.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0227_payment_provider_subscription_history.down.sql'),
  'utf8',
);

describe('payment provider subscription history migration', () => {
  it('accepts exactly the providers the adapter layer defines', () => {
    const providers = /payment_provider = any \(array\[([^\]]+)\]\)/.exec(migration)?.[1];
    expect(providers).toBeDefined();
    const accepted = [...providers!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(new Set(accepted)).toEqual(new Set(['stripe', 'apple', 'google']));
  });

  it('accepts exactly the normalized statuses, so an unmapped one cannot be stored', () => {
    const statuses = /status = any \(array\['active'([^\]]+)\]\)/.exec(migration)?.[0];
    expect(statuses).toBeDefined();
    const accepted = [...statuses!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(new Set(accepted)).toEqual(
      new Set([
        'active',
        'trialing',
        'past_due',
        'canceled',
        'incomplete',
        'incomplete_expired',
        'unpaid',
        'none',
      ]),
    );
  });

  it('makes a replayed provider event a no-op rather than a second transition', () => {
    expect(migration).toMatch(
      /create unique index if not exists idx_org_subscription_transitions_event\s+on public\.organization_subscription_state_transitions\s+\(payment_provider, subscription_reference, provider_event_id\)\s+where provider_event_id is not null/,
    );
  });

  it('is append-only to a tenant: admins read their own rows and nothing may update them', () => {
    expect(migration).toContain(
      'alter table public.organization_subscription_state_transitions enable row level security',
    );
    expect(migration).toContain(
      'alter table public.organization_subscription_state_transitions force row level security',
    );
    expect(migration).toContain(
      'create policy organization_subscription_state_transitions_admin_read',
    );
    expect(migration).toContain(
      'grant select on public.organization_subscription_state_transitions to app_rls',
    );
    expect(migration).not.toMatch(
      /grant\s+[^;]*(insert|update|delete)[^;]*on public\.organization_subscription_state_transitions to app_rls/,
    );
  });

  it('reverses every object it creates and retracts its ledger row', () => {
    expect(reversal).toContain(
      'drop table if exists public.organization_subscription_state_transitions',
    );
    expect(reversal).toContain('idx_org_subscription_transitions_event');
    expect(reversal).toContain('idx_org_subscription_transitions_reference');
    expect(reversal).toContain('idx_org_subscription_transitions_org_occurred');
    expect(reversal).toContain("where filename = '0227_payment_provider_subscription_history.sql'");
  });
});
