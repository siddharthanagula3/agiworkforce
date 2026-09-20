import { describe, expect, it } from 'vitest';

import { WORKSPACE_POLICY_SCOPES } from '../enterprise/workspace-controls';
import {
  MANDATORY_CAPABLE_SCOPES,
  SETTINGS_SCOPES,
  WORKSPACE_POLICY_SCOPE_SETTINGS_SCOPE,
  canSetMandatoryRule,
  inspectSetting,
  isSettingsScope,
  resolveSetting,
  settingsScopeRank,
  type SettingDefinition,
  type SettingRule,
  type SettingsScope,
} from '../settings-scopes';

const RETENTION_VALUES = [30, 90, 365] as const;

const retention: SettingDefinition<number> = {
  key: 'retention_days',
  safeDefault: 30,
  isAllowedValue: (value): value is number =>
    typeof value === 'number' && (RETENTION_VALUES as readonly number[]).includes(value),
};

function rule(
  scope: SettingsScope,
  value: number,
  extra: Partial<SettingRule<number>> = {},
): SettingRule<number> {
  return { scope, ruleId: `${scope}-rule`, ruleVersion: 1, value, ...extra };
}

describe('settings scopes', () => {
  it('orders every scope once', () => {
    expect(new Set(SETTINGS_SCOPES).size).toBe(SETTINGS_SCOPES.length);
    for (const scope of SETTINGS_SCOPES) {
      expect(isSettingsScope(scope)).toBe(true);
      expect(settingsScopeRank(scope)).toBeGreaterThanOrEqual(0);
    }
    expect(isSettingsScope('tenant')).toBe(false);
  });

  it('lets a mandate come only from a scope an administrator speaks from', () => {
    for (const scope of SETTINGS_SCOPES) {
      expect(canSetMandatoryRule(scope)).toBe(
        (MANDATORY_CAPABLE_SCOPES as readonly string[]).includes(scope),
      );
    }
    expect(canSetMandatoryRule('turn')).toBe(false);
    expect(canSetMandatoryRule('organization')).toBe(true);
  });

  it('places every workspace policy scope in the one vocabulary', () => {
    for (const scope of WORKSPACE_POLICY_SCOPES) {
      expect(SETTINGS_SCOPES).toContain(WORKSPACE_POLICY_SCOPE_SETTINGS_SCOPE[scope]);
    }
  });
});

describe('resolution', () => {
  it('gives the same answer whatever order the candidates arrive in', () => {
    const candidates = [rule('account', 365), rule('organization', 90), rule('project', 30)];
    const forward = resolveSetting(retention, candidates);
    const reversed = resolveSetting(retention, [...candidates].reverse());
    expect(forward).toEqual(reversed);
  });

  it('returns the effective value, its provenance and the rule version', () => {
    const resolved = resolveSetting(retention, [
      rule('account', 365, { ruleVersion: 4, setBy: 'user_1' }),
      rule('organization', 90, { ruleVersion: 7 }),
    ]);
    expect(resolved.value).toBe(365);
    expect(resolved.provenance).toEqual({
      scope: 'account',
      ruleId: 'account-rule',
      ruleVersion: 4,
      setBy: 'user_1',
    });
    expect(resolved.ruleVersion).toBe(7);
    expect(resolved.outcome).toBe('resolved');
  });

  it('names the rule that blocked the reader when a mandate wins', () => {
    const resolved = resolveSetting(retention, [
      rule('organization', 30, { mandatory: true, ruleVersion: 9 }),
      rule('project', 365),
    ]);
    expect(resolved.value).toBe(30);
    expect(resolved.outcome).toBe('blocked_by_mandate');
    expect(resolved.blockingRule?.scope).toBe('organization');
    expect(resolved.blockingRule?.ruleVersion).toBe(9);
    expect(resolved.editable).toBe(false);
  });

  it('lets the broadest mandate stand over a narrower one', () => {
    const resolved = resolveSetting(retention, [
      rule('organization', 30, { mandatory: true }),
      rule('project', 365, { mandatory: true }),
    ]);
    expect(resolved.value).toBe(30);
    expect(resolved.provenance?.scope).toBe('organization');
  });

  it('takes the narrowest preference when nothing is mandated', () => {
    const resolved = resolveSetting(retention, [
      rule('account', 365),
      rule('workspace', 90),
      rule('conversation', 30),
    ]);
    expect(resolved.value).toBe(30);
    expect(resolved.provenance?.scope).toBe('conversation');
    expect(resolved.editable).toBe(true);
  });

  it('lets the reader override a default an administrator did not mandate', () => {
    const resolved = resolveSetting(retention, [rule('account', 365), rule('organization', 90)]);
    expect(resolved.value).toBe(365);
    expect(resolved.provenance?.scope).toBe('account');
  });

  it('falls back to the narrowest administered default when the reader set nothing', () => {
    const resolved = resolveSetting(retention, [rule('organization', 365), rule('project', 90)]);
    expect(resolved.value).toBe(90);
    expect(resolved.provenance?.scope).toBe('project');
  });

  it('falls back to the safe default when a rule carries a value it cannot read', () => {
    const resolved = resolveSetting(retention, [
      rule('organization', 9999 as number, { mandatory: true }),
    ]);
    expect(resolved.value).toBe(retention.safeDefault);
    expect(resolved.outcome).toBe('unreadable_value');
    expect(resolved.blockingRule?.scope).toBe('organization');
  });

  it('refuses to let an old reader fall back past a mandate it does not understand', () => {
    const candidates = [
      rule('account', 365),
      rule('organization', 90, { mandatory: true, enforcementVersion: 5 }),
    ];
    const old = resolveSetting(retention, candidates, { readerPolicyVersion: 2 });
    expect(old.value).toBe(retention.safeDefault);
    expect(old.value).not.toBe(365);
    expect(old.outcome).toBe('rule_newer_than_reader');
    expect(old.editable).toBe(false);

    const current = resolveSetting(retention, candidates, { readerPolicyVersion: 5 });
    expect(current.value).toBe(90);
  });

  it('ignores a scope it does not know rather than admitting it', () => {
    const resolved = resolveSetting(retention, [
      { scope: 'galaxy' as SettingsScope, ruleId: 'x', ruleVersion: 1, value: 365 },
      rule('account', 90),
    ]);
    expect(resolved.value).toBe(90);
    expect(resolved.provenance?.scope).toBe('account');
  });

  it('holds the safe default when nothing is set', () => {
    const resolved = resolveSetting(retention, []);
    expect(resolved.value).toBe(retention.safeDefault);
    expect(resolved.outcome).toBe('default_unset');
    expect(resolved.provenance).toBeNull();
  });

  it('shows an administrator every candidate, broadest first', () => {
    const inspection = inspectSetting(retention, [
      rule('project', 30),
      rule('account', 365),
      rule('organization', 90),
    ]);
    expect(inspection.candidates.map((candidate) => candidate.scope)).toEqual([
      'account',
      'organization',
      'project',
    ]);
    expect(inspection.value).toBe(365);
    expect(inspection.provenance?.scope).toBe('account');
  });
});
