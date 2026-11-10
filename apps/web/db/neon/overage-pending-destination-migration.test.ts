import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const destinationUp = read('0400_overage_pending_destination.sql');
const destinationDown = read('down/0400_overage_pending_destination.down.sql');
const reporter = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/enterprise-usage-metering.ts'),
  'utf8',
);

describe('0400 overage pending destination', () => {
  it('adds the nullable destination the reporter claims with and replays to', () => {
    expect(destinationUp).toContain('NOT YET APPLIED');
    expect(destinationUp).toContain('alter table public.organization_billing_contracts');
    expect(destinationUp).toContain('add column if not exists overage_pending_customer_id text');
    expect(destinationUp).toContain('add column if not exists overage_pending_price_id text');
    expect(destinationUp).not.toMatch(/overage_pending_(customer|price)_id text\s+not null/);
    expect(destinationUp).toContain(
      'drop constraint if exists organization_billing_contracts_overage_pending_destination',
    );
    expect(destinationUp).toContain(
      '(overage_pending_customer_id is null) = (overage_pending_price_id is null)',
    );
    expect(destinationUp).toContain(
      'overage_pending_identifier is not null or overage_pending_customer_id is null',
    );
    expect(reporter).toContain('overage_pending_customer_id = $9');
    expect(reporter).toContain('overage_pending_price_id = $10');
    expect(reporter).toContain('overage_pending_customer_id = null');
  });

  it('rolls back what it adds', () => {
    expect(destinationDown).toContain('WHAT THIS COSTS');
    expect(destinationDown).toContain(
      'drop constraint if exists organization_billing_contracts_overage_pending_destination',
    );
    expect(destinationDown).toContain('drop column if exists overage_pending_price_id');
    expect(destinationDown).toContain('drop column if exists overage_pending_customer_id');
    expect(destinationDown).toContain("where filename = '0400_overage_pending_destination.sql';");
  });
});
