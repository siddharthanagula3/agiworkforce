import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.resolve(import.meta.dirname, file), 'utf8');

const migration = read('0376_invite_code_redemption_unambiguous.sql');
const reversal = read('down/0376_invite_code_redemption_unambiguous.down.sql');

function functionBody(sql: string): string {
  const start = sql.indexOf('as $$');
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end);
}

describe('invite code redemption migration', () => {
  it('keeps the signature and the result shape callers destructure', () => {
    expect(migration).toContain(
      'create or replace function public.validate_and_redeem_invite_code(\n  p_user_id text,\n  p_code text,\n  p_surface text,\n  p_source text\n)',
    );
    expect(migration).toContain('returns table(valid boolean, invite_id uuid, error text)');
  });

  it('never names invite_id unqualified inside the body, where it collides with the output column', () => {
    const body = functionBody(migration);
    expect(body).toContain('where redemption.invite_id = v_invite.id');
    expect(body).toContain('and redemption.user_id = p_user_id');
    expect(body).not.toMatch(/where\s+invite_id\s*=/);
  });

  it('redeems once, then refuses a used-up code and a second redemption by the same user', () => {
    const body = functionBody(migration);
    expect(body).toContain('return query select true, v_invite.id, null::text;');
    expect(body).toContain("'fully_redeemed'::text");
    expect(body).toContain("'already_redeemed_by_user'::text");
    expect(body).toContain('set current_uses = current_uses + 1');
    expect(body.indexOf("'already_redeemed_by_user'")).toBeLessThan(
      body.indexOf('insert into public.beta_redemptions'),
    );
  });

  it('reverses to the previous body and forgets the migration', () => {
    expect(reversal).toContain(
      'create or replace function public.validate_and_redeem_invite_code(p_user_id text, p_code text, p_surface text, p_source text)',
    );
    expect(reversal).toContain(
      "delete from public.schema_migrations where filename = '0376_invite_code_redemption_unambiguous.sql';",
    );
  });
});
