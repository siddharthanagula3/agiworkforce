import { describe, expect, it } from 'vitest';

import { conditionsMatch, evaluateFlag, type FlagSubject } from '../evaluate-flags';
import { FlagDefinitionInputSchema, type FlagDefinition } from '../flag-definition';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');

function subject(overrides: Partial<FlagSubject> = {}): FlagSubject {
  return {
    userId: 'user_customer',
    workspaceId: null,
    role: 'member',
    plan: 'pro',
    region: 'us',
    country: 'US',
    surface: 'web',
    clientVersion: '2.4.1',
    ...overrides,
  };
}

function staffOnlyFlag(): FlagDefinition {
  const input = FlagDefinitionInputSchema.parse({
    key: 'capability.can_use_desktop_automation',
    variants: ['on', 'off'],
    defaultVariant: 'off',
    rules: [{ id: 'staff', conditions: { internalStaffOnly: true }, variant: 'on' }],
  });
  return {
    ...input,
    archivedAt: null,
    version: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('internal-staff targeting', () => {
  it('does not serve a staff-only rule to a customer', () => {
    const evaluation = evaluateFlag(staffOnlyFlag(), subject(), {}, NOW);
    expect(evaluation).toMatchObject({ variant: 'off', enabled: false, reason: 'default' });
  });

  it('serves a staff-only rule to staff', () => {
    const evaluation = evaluateFlag(staffOnlyFlag(), subject({ internalStaff: true }), {}, NOW);
    expect(evaluation).toMatchObject({ variant: 'on', enabled: true, reason: 'rule' });
  });

  it('treats a subject whose staff status was never established as a customer', () => {
    expect(conditionsMatch({ internalStaffOnly: true }, subject())).toBe(false);
    expect(conditionsMatch({ internalStaffOnly: true }, subject({ internalStaff: false }))).toBe(
      false,
    );
    expect(conditionsMatch({ internalStaffOnly: true }, subject({ internalStaff: true }))).toBe(
      true,
    );
  });

  it('leaves a rule that does not ask for staff open to everyone', () => {
    expect(conditionsMatch({}, subject())).toBe(true);
    expect(conditionsMatch({ internalStaffOnly: false }, subject())).toBe(true);
  });

  it('narrows rather than widens: staff still have to match the other conditions', () => {
    expect(
      conditionsMatch(
        { internalStaffOnly: true, surfaces: ['desktop'] },
        subject({ internalStaff: true, surface: 'web' }),
      ),
    ).toBe(false);
  });
});
