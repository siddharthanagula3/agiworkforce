import { describe, expect, it } from 'vitest';

import type { AuditEventType } from '@/lib/security-audit';
import { REENCRYPT_TARGETS, recordKeyRotationAudit } from '../../../../scripts/reencrypt.mjs';

describe('scripts/reencrypt.mjs key rotation audit record', () => {
  it('writes an encryption_key_rotated row naming the target and the active key version, never key material', async () => {
    const writes: { sql: string; params: unknown[] }[] = [];
    const client = {
      async query(sql: string, params: unknown[]) {
        writes.push({ sql, params });
        return [];
      },
    };

    await recordKeyRotationAudit({
      client,
      name: 'two-factor',
      target: REENCRYPT_TARGETS['two-factor'],
      keyVersion: '2',
      outcome: { scanned: 4, rewritten: 3, stamped: 1, plaintext: 0 },
    });

    expect(writes).toHaveLength(1);
    const [write] = writes;
    expect(write!.sql).toMatch(/insert into security_audit_logs/i);
    const eventType: AuditEventType = 'encryption_key_rotated';
    expect(write!.params[0]).toBe(eventType);
    const details = JSON.parse(String(write!.params[2])) as Record<string, unknown>;
    expect(details).toMatchObject({
      resourceType: 'encryption_key',
      resourceId: 'two-factor',
      resourceName: 'public.user_two_factor',
      keyVersion: '2',
      count: 4,
    });
    expect(JSON.stringify(details)).not.toMatch(/TOTP_ENCRYPTION_KEY|material/);
  });
});
