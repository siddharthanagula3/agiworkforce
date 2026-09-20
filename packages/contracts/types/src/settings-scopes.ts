/**
 * Where a setting can be set, and which answer wins when more than one place
 * sets it. One resolver, on the server, returning the value and the reason it
 * is that value: a surface that works precedence out for itself is a second
 * answer nobody reconciles.
 *
 * `scripts/check-settings-precedence.mjs` proves the order is total and that
 * every settings table in the migration history declares the scope it holds.
 *
 * @module settings-scopes
 */

import type { WorkspacePolicyScope } from './enterprise/workspace-controls';

/**
 * Broadest first. The list is the order: resolution walks it, so it is total
 * by construction and two runs over the same candidates cannot disagree.
 */
export const SETTINGS_SCOPES = [
  'account',
  'organization',
  'personal_workspace',
  'workspace',
  'project',
  'device',
  'surface',
  'session',
  'runtime',
  'conversation',
  'turn',
] as const;

export type SettingsScope = (typeof SETTINGS_SCOPES)[number];

export function isSettingsScope(value: string): value is SettingsScope {
  return (SETTINGS_SCOPES as readonly string[]).includes(value);
}

export function settingsScopeRank(scope: SettingsScope): number {
  return SETTINGS_SCOPES.indexOf(scope);
}

/**
 * The scopes an administrator speaks from. Only these may mark a rule
 * mandatory, because only these belong to someone other than the reader.
 */
export const MANDATORY_CAPABLE_SCOPES = [
  'organization',
  'workspace',
  'project',
  'device',
] as const satisfies readonly SettingsScope[];

export type MandatoryCapableScope = (typeof MANDATORY_CAPABLE_SCOPES)[number];

export function canSetMandatoryRule(scope: SettingsScope): scope is MandatoryCapableScope {
  return (MANDATORY_CAPABLE_SCOPES as readonly SettingsScope[]).includes(scope);
}

/**
 * Whose answer a rule is. A value an administrator set and did not mandate is
 * a default the reader may still override; a value the reader set at any of
 * their own scopes is their answer and outranks that default.
 */
export function isAdministeredScope(scope: SettingsScope): boolean {
  return canSetMandatoryRule(scope);
}

/**
 * The workspace controls layering is one instance of this vocabulary, not a
 * second one. `role` and `group` narrow the organization's own rule and are
 * read at that scope; `user` is the reader's own account.
 */
export const WORKSPACE_POLICY_SCOPE_SETTINGS_SCOPE: Readonly<
  Record<WorkspacePolicyScope, SettingsScope>
> = {
  workspace: 'workspace',
  role: 'organization',
  group: 'organization',
  project: 'project',
  device: 'device',
  user: 'account',
};

export const SETTING_RESOLUTION_OUTCOMES = [
  'resolved',
  'default_unset',
  'blocked_by_mandate',
  'unreadable_value',
  'rule_newer_than_reader',
] as const;

export type SettingResolutionOutcome = (typeof SETTING_RESOLUTION_OUTCOMES)[number];

export interface SettingRule<Value> {
  scope: SettingsScope;
  ruleId: string;
  /** The revision of the rule set this value came from. */
  ruleVersion: number;
  value: Value;
  /** The reader may not override it, and a reader that cannot read it may not ignore it. */
  mandatory?: boolean;
  /** The lowest reader revision that understands this rule. */
  enforcementVersion?: number;
  setBy?: string;
}

export interface SettingDefinition<Value> {
  key: string;
  /** What holds when nothing is set, and what a rule nobody can read falls back to. */
  safeDefault: Value;
  isAllowedValue: (value: unknown) => value is Value;
}

export interface SettingProvenance {
  scope: SettingsScope;
  ruleId: string;
  ruleVersion: number;
  setBy: string | null;
}

export interface ResolvedSetting<Value> {
  key: string;
  value: Value;
  outcome: SettingResolutionOutcome;
  /** Where the winning value came from, or null when nothing set it. */
  provenance: SettingProvenance | null;
  /** The rule that stopped the reader's own value from winning, if any. */
  blockingRule: SettingProvenance | null;
  /** The highest rule version any candidate carried, so a reader can tell it is behind. */
  ruleVersion: number;
  /** The reader may change this setting for itself. */
  editable: boolean;
}

function provenanceOf<Value>(rule: SettingRule<Value>): SettingProvenance {
  return {
    scope: rule.scope,
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    setBy: rule.setBy ?? null,
  };
}

export interface SettingResolutionOptions {
  /** The revision of the rule vocabulary this reader was built against. */
  readerPolicyVersion?: number;
}

/**
 * The broadest mandate wins, then the reader's own narrowest answer, then an
 * administrator's narrowest default. A mandate the reader is too old to
 * understand is not skipped: the safe default stands and the rule is reported,
 * because a client that ignores what it cannot read is how an old build keeps
 * a capability an administrator turned off.
 */
export function resolveSetting<Value>(
  definition: SettingDefinition<Value>,
  candidates: readonly SettingRule<Value>[],
  options: SettingResolutionOptions = {},
): ResolvedSetting<Value> {
  const readerPolicyVersion = options.readerPolicyVersion ?? Number.MAX_SAFE_INTEGER;
  const known = candidates.filter((rule) => isSettingsScope(rule.scope));
  const ruleVersion = known.reduce((highest, rule) => Math.max(highest, rule.ruleVersion), 0);

  const mandates = known
    .filter((rule) => rule.mandatory === true && canSetMandatoryRule(rule.scope))
    .sort((a, b) => settingsScopeRank(a.scope) - settingsScopeRank(b.scope));

  const mandate = mandates[0];
  if (mandate !== undefined) {
    const provenance = provenanceOf(mandate);
    if ((mandate.enforcementVersion ?? 0) > readerPolicyVersion) {
      return {
        key: definition.key,
        value: definition.safeDefault,
        outcome: 'rule_newer_than_reader',
        provenance: null,
        blockingRule: provenance,
        ruleVersion,
        editable: false,
      };
    }
    if (!definition.isAllowedValue(mandate.value)) {
      return {
        key: definition.key,
        value: definition.safeDefault,
        outcome: 'unreadable_value',
        provenance: null,
        blockingRule: provenance,
        ruleVersion,
        editable: false,
      };
    }
    const overridden = known.some(
      (rule) =>
        rule !== mandate && settingsScopeRank(rule.scope) > settingsScopeRank(mandate.scope),
    );
    return {
      key: definition.key,
      value: mandate.value,
      outcome: overridden ? 'blocked_by_mandate' : 'resolved',
      provenance,
      blockingRule: provenance,
      ruleVersion,
      editable: false,
    };
  }

  const narrowestFirst = (rules: readonly SettingRule<Value>[]) =>
    rules.slice().sort((a, b) => settingsScopeRank(b.scope) - settingsScopeRank(a.scope));
  const preferences = [
    ...narrowestFirst(known.filter((rule) => !isAdministeredScope(rule.scope))),
    ...narrowestFirst(known.filter((rule) => isAdministeredScope(rule.scope))),
  ];

  for (const rule of preferences) {
    if (!definition.isAllowedValue(rule.value)) {
      return {
        key: definition.key,
        value: definition.safeDefault,
        outcome: 'unreadable_value',
        provenance: null,
        blockingRule: provenanceOf(rule),
        ruleVersion,
        editable: true,
      };
    }
    return {
      key: definition.key,
      value: rule.value,
      outcome: 'resolved',
      provenance: provenanceOf(rule),
      blockingRule: null,
      ruleVersion,
      editable: true,
    };
  }

  return {
    key: definition.key,
    value: definition.safeDefault,
    outcome: 'default_unset',
    provenance: null,
    blockingRule: null,
    ruleVersion,
    editable: true,
  };
}

/**
 * What an administrator is shown when they ask why a reader sees this value:
 * the effective value, the rule that produced it and the rule version, never
 * the value alone.
 */
export interface SettingInspection<Value> extends ResolvedSetting<Value> {
  candidates: readonly SettingProvenance[];
}

export function inspectSetting<Value>(
  definition: SettingDefinition<Value>,
  candidates: readonly SettingRule<Value>[],
  options: SettingResolutionOptions = {},
): SettingInspection<Value> {
  return {
    ...resolveSetting(definition, candidates, options),
    candidates: candidates
      .filter((rule) => isSettingsScope(rule.scope))
      .sort((a, b) => settingsScopeRank(a.scope) - settingsScopeRank(b.scope))
      .map(provenanceOf),
  };
}
