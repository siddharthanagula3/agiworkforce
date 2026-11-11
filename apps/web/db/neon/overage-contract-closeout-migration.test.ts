import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const closeoutUp = read('0402_overage_contract_closeout.sql');
const closeoutDown = read('down/0402_overage_contract_closeout.down.sql');
const reporter = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/enterprise-usage-metering.ts'),
  'utf8',
);

describe('0402 overage contract closeout', () => {
  it('adds the nullable closeout record the reporter writes for an ended contract', () => {
    expect(closeoutUp).toContain('NOT YET APPLIED');
    for (const column of [
      'overage_closeout_ended_at timestamptz',
      'overage_closeout_at timestamptz',
      'overage_closeout_reason text',
      'overage_written_off_cents bigint',
      'overage_written_off_unconfirmed_identifier text',
    ]) {
      expect(closeoutUp).toContain(`add column if not exists ${column}`);
      expect(closeoutUp).not.toContain(`${column} not null`);
    }
    expect(closeoutUp).toContain("overage_closeout_reason in ('contract_ended')");
    expect(closeoutUp).toContain('overage_written_off_cents >= 0');
    expect(closeoutUp).toContain(
      '(overage_closeout_ended_at is null) = (overage_written_off_cents is null)',
    );
    expect(reporter).toContain('overage_closeout_ended_at is distinct from ended_at');
    expect(reporter).toContain('set overage_closeout_ended_at = ended_at');
    expect(reporter).toContain("ENTERPRISE_OVERAGE_CLOSEOUT_REASON = 'contract_ended'");
  });

  it('rolls back what it adds', () => {
    expect(closeoutDown).toContain('WHAT THIS COSTS');
    for (const name of [
      'drop constraint if exists organization_billing_contracts_overage_closeout_values',
      'drop constraint if exists organization_billing_contracts_overage_closeout_complete',
      'drop column if exists overage_written_off_unconfirmed_identifier',
      'drop column if exists overage_written_off_cents',
      'drop column if exists overage_closeout_reason',
      'drop column if exists overage_closeout_at',
      'drop column if exists overage_closeout_ended_at',
    ]) {
      expect(closeoutDown).toContain(name);
    }
    expect(closeoutDown).toContain("where filename = '0402_overage_contract_closeout.sql';");
  });
});
