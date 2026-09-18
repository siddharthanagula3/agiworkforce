import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BILLING_PLAN_CAPABILITY_TIERS } from '@agiworkforce/types';
import { SLO_CATALOGUE } from '@/lib/server/slo/catalogue';
import { retentionEnforcement } from '@/lib/server/retention/enforcement';

const APP = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(APP, relative), 'utf8');

const sla = read('sla/page.tsx');
const enterprise = read('enterprise/page.tsx');
const ticketStore = readFileSync(path.resolve(APP, '../lib/support/tickets/store.ts'), 'utf8');

/**
 * Every commitment these two pages make is checked against the code path the
 * page names. A claim nothing implements is a contract defect, not a copy one.
 */
describe('/sla claims', () => {
  it('builds its service levels from the catalogue the alerting reads', () => {
    expect(sla).toContain('SLO_CATALOGUE');
    expect(SLO_CATALOGUE.length).toBeGreaterThan(0);
    for (const slo of SLO_CATALOGUE) {
      if (slo.source === null) {
        expect(slo.missingInstrument, slo.domain).toBeTruthy();
      } else {
        expect(slo.source.table, slo.domain).toMatch(/^[a-z_.]+$/u);
      }
    }
  });

  it('never presents an uptime number as a commitment', () => {
    expect(sla).toContain('planned targets, not a binding commitment');
    expect(sla).not.toMatch(/guaranteed uptime|uptime guarantee|we guarantee/iu);
  });

  it('names the tables a first-response measurement would come from, and says nothing computes it', () => {
    expect(sla).toContain('public.support_tickets');
    expect(sla).toContain('public.support_ticket_replies');
    expect(ticketStore).toContain('public.support_tickets');
    expect(ticketStore).toContain('public.support_ticket_replies');
    expect(sla).toContain('First response is not measured yet');
  });

  it('states the response commitment once, and /enterprise repeats the same figure', () => {
    expect(sla).toContain('4 business hours');
    expect(enterprise).toContain('4 business hours');
    const otherFigures = /(\d+)\s+business hours/gu;
    const onSla = new Set([...sla.matchAll(otherFigures)].map((match) => match[1]));
    const onEnterprise = new Set([...enterprise.matchAll(otherFigures)].map((match) => match[1]));
    for (const figure of onEnterprise) expect(onSla).toContain(figure);
  });
});

describe('/enterprise claims', () => {
  it('does not claim retention is deleted against unconditionally', () => {
    expect(enterprise).toContain('Retention enforced only when the owner turns it on');
    expect(enterprise).not.toMatch(/retention (is|will be) enforced for every workspace/iu);
  });

  it('claims a plan-required window only where the entitlement actually grants it', () => {
    expect(enterprise).toContain('enterprise controls entitlement');
    expect([...BILLING_PLAN_CAPABILITY_TIERS.enterprise_controls]).toEqual(['enterprise']);
    expect(
      retentionEnforcement({ plan: 'enterprise', retentionDays: 30, retentionEnforced: false }),
    ).toMatchObject({ required: true, enforced: false });
    expect(
      retentionEnforcement({ plan: 'team', retentionDays: 30, retentionEnforced: false }),
    ).toMatchObject({ required: false, enforced: false });
  });

  it('keeps the gap between a required window and an enforced one visible', () => {
    expect(enterprise).toContain('required and not yet enforced');
    expect(enterprise).toContain('reported as a gap, not as a control');
  });

  it('defers uptime to /sla rather than restating it', () => {
    expect(enterprise).toContain('planned targets rather than binding commitments');
    expect(enterprise).not.toMatch(/99\.\d+%/u);
  });
});
