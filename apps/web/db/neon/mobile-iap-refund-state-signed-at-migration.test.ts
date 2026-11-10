import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0397_mobile_iap_refund_state_signed_at.sql');
const down = read('down/0397_mobile_iap_refund_state_signed_at.down.sql');
const service = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/mobile-iap-notification-service.ts'),
  'utf8',
);

describe('0397 mobile iap refund state signed at', () => {
  it('adds the nullable watermark the notification service reads and writes', () => {
    expect(up).toContain('alter table public.mobile_iap_transactions');
    expect(up).toContain('add column if not exists refund_state_signed_at timestamptz;');
    expect(up).not.toMatch(/refund_state_signed_at timestamptz\s+not null/);
    expect(service).toContain('receipt.refund_state_signed_at');
    expect(service).toContain('set refund_state_signed_at = $2');
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('drop column if exists refund_state_signed_at;');
    expect(down).toContain("where filename = '0397_mobile_iap_refund_state_signed_at.sql';");
  });
});
