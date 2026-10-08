import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const MIGRATION = '0359_settlement_recovery_binds_job_owner.sql';
const read = (relative: string) => readFileSync(resolve(neonDir, relative), 'utf8');

const migration = read(MIGRATION);
const down = read('down/0359_settlement_recovery_binds_job_owner.down.sql');
const ledger0182 = read('0182_managed_usage_microusd_ledger.sql');

function migrationFiles(): string[] {
  return readdirSync(neonDir)
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b));
}

function withoutLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function functionBodies(sql: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const header = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  for (const match of sql.matchAll(header)) {
    const rest = sql.slice(match.index);
    const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(rest);
    if (!tag) continue;
    const bodyStart = tag.index + tag[0].length;
    const bodyEnd = rest.indexOf(tag[1] as string, bodyStart);
    bodies.set((match[1] as string).toLowerCase(), rest.slice(bodyStart, bodyEnd));
  }
  return bodies;
}

function currentDefinition(name: string): { file: string; body: string } {
  let current: { file: string; body: string } | undefined;
  for (const file of migrationFiles()) {
    const body = functionBodies(withoutLineComments(read(file))).get(name);
    if (body !== undefined) current = { file, body };
  }
  if (!current) throw new Error(`${name} is never defined`);
  return current;
}

const SERVICE_SWEEPS = ['recover_stale_managed_usage_requests', 'process_credit_settlement_queue'];

describe('settlement recovery binds the job owner', () => {
  it.each(SERVICE_SWEEPS)('%s is defined last by 0359', (name) => {
    expect(currentDefinition(name).file).toBe(MIGRATION);
  });

  it.each(SERVICE_SWEEPS)(
    '%s binds the row owner around the settlement and restores the caller',
    (name) => {
      const body = currentDefinition(name).body;
      const bind = body.search(
        /set_config\('request\.jwt\.claim\.sub', v_(?:request|job)\.user_id, true\)/,
      );
      const settle = body.indexOf('enqueue_credit_settlement_microusd(');
      const restore = body.indexOf(
        "set_config('request.jwt.claim.sub', coalesce(v_subject, ''), true)",
      );

      expect(bind).toBeGreaterThan(-1);
      expect(settle).toBeGreaterThan(bind);
      expect(restore).toBeGreaterThan(settle);
    },
  );

  it.each(SERVICE_SWEEPS)('%s only touches the caller own rows when a claim is set', (name) => {
    const body = currentDefinition(name).body;
    expect(body).toContain("nullif(current_setting('request.jwt.claim.sub', true), '')");
    expect(body).toMatch(/\(v_subject is null or (?:request_row|job)\.user_id = v_subject\)/);
  });

  it('leaves the tenant check on the settlement itself untouched', () => {
    const settle = currentDefinition('settle_managed_usage_credits_microusd');
    expect(settle.file).toBe('0182_managed_usage_microusd_ledger.sql');
    expect(settle.body).toMatch(
      /p_user_id is distinct from public\.current_app_user_id\(\) then\s+raise exception using errcode = '42501'/,
    );
    expect(migration).not.toMatch(/settle_managed_usage_credits_microusd\s*\(/);
  });

  it('grants neither sweep to the request role', () => {
    for (const file of migrationFiles()) {
      for (const name of SERVICE_SWEEPS) {
        expect(read(file)).not.toMatch(
          new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}[^;]*\\bto\\b`, 'i'),
        );
      }
    }
    expect(migration).not.toMatch(/security\s+definer/i);
  });

  it('reopens no settled or terminal job', () => {
    expect(migration).not.toMatch(/update\s+public\.credit_settlement_jobs/i);
    expect(migration).not.toMatch(/delete from/i);
  });

  it('is reversed to the exact 0182 bodies and drops its ledger row', () => {
    const original = functionBodies(withoutLineComments(ledger0182));
    const reverted = functionBodies(withoutLineComments(down));
    for (const name of SERVICE_SWEEPS) {
      expect(reverted.get(name)).toBe(original.get(name));
    }
    expect(down).toContain(`filename = '${MIGRATION}'`);
  });
});
