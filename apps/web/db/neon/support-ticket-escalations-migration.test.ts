import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(resolve(neonDir, '0242_support_ticket_escalations.sql'), 'utf8');
const down = readFileSync(
  resolve(neonDir, 'down/0242_support_ticket_escalations.down.sql'),
  'utf8',
);

describe('0242 the engineering escalation a support ticket becomes', () => {
  it('links every escalation to the ticket it came from', () => {
    expect(sql).toMatch(/create table if not exists public\.support_ticket_escalations/i);
    expect(sql).toMatch(
      /ticket_id uuid not null\s*\n?\s*references public\.support_tickets\(id\) on delete cascade/i,
    );
    expect(sql).toMatch(/create index if not exists support_ticket_escalations_ticket_idx/i);
  });

  it('gives it a reference a customer can quote and an engineer can search', () => {
    expect(sql).toMatch(/reference_id text not null unique/i);
    expect(sql).toMatch(/AGI-\[0-9\]\{8\}-\[0-9A-HJKMNP-TV-Z\]\{8\}/);
  });

  it('makes an unpaged p0 or p1 impossible in the schema, not only in code', () => {
    expect(sql).toMatch(
      /support_ticket_escalations_urgent_is_paged[\s\S]*severity not in \('p0', 'p1'\) or paged_at is not null/i,
    );
    expect(sql).toMatch(/\(paged_at is null\) = \(page_outcome is null\)/i);
  });

  it('constrains severity and tracker to the values the service writes', () => {
    expect(sql).toMatch(/severity text not null check \(severity in \('p0', 'p1', 'p2', 'p3'\)\)/i);
    expect(sql).toMatch(/tracker in \('on-call', 'support-engineering'\)/i);
  });

  it('grants the application role nothing at all', () => {
    expect(sql).not.toMatch(/grant [a-z, ]+on public\.support_ticket_escalations to app_rls/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
  });

  it('keeps no customer message body, only the triage summary', () => {
    expect(sql).not.toMatch(/^\s*(message|transcript|diagnostics)\s+(text|jsonb)/im);
  });
});

describe('0242 reverses', () => {
  it('drops the escalation table and its indexes, and never the tickets', () => {
    expect(down).toMatch(/drop table if exists public\.support_ticket_escalations/i);
    expect(down).toMatch(/drop index if exists public\.support_ticket_escalations_open_idx/i);
    expect(down).not.toMatch(/drop table if exists public\.support_tickets/i);
    expect(down).toContain("where filename = '0242_support_ticket_escalations.sql'");
  });

  it('states what is lost before it is run', () => {
    expect(down).toMatch(/COST, read this before running it/i);
  });
});
