import { createHash } from 'node:crypto';

import {
  FLAG_OFF_VARIANT,
  type FlagConditions,
  type FlagDefinition,
  type FlagOverride,
  type FlagRollout,
  type FlagRule,
} from './flag-definition';

export interface FlagSubject {
  userId: string;
  workspaceId: string | null;
  role: string | null;
  plan: string | null;
  region: string | null;
  country: string | null;
  surface: string | null;
  clientVersion: string | null;
  /** Staff of this deployment. Absent means unestablished, which is not staff. */
  internalStaff?: boolean;
}

export type FlagEvaluationReason =
  'kill_switch' | 'expired' | 'user_override' | 'workspace_override' | 'rule' | 'default';

export interface FlagEvaluation {
  key: string;
  variant: string;
  enabled: boolean;
  reason: FlagEvaluationReason;
  ruleId: string | null;
  version: number;
}

const PERCENT_SCALE = 100;
const BUCKET_HEX_DIGITS = 13;
const BUCKET_SPACE = 16 ** BUCKET_HEX_DIGITS;

export function stableBucket(seed: string): number {
  const digest = createHash('sha256').update(seed).digest('hex');
  return Number.parseInt(digest.slice(0, BUCKET_HEX_DIGITS), 16) / BUCKET_SPACE;
}

function includesValue(values: readonly string[] | undefined, value: string | null): boolean {
  if (!values || values.length === 0) return true;
  return value !== null && values.includes(value);
}

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function compareClientVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function clientVersionMatches(
  range: FlagConditions['clientVersion'],
  clientVersion: string | null,
): boolean {
  if (!range || (range.min === undefined && range.max === undefined)) return true;
  if (!clientVersion) return false;
  if (range.min !== undefined && compareClientVersions(clientVersion, range.min) < 0) return false;
  if (range.max !== undefined && compareClientVersions(clientVersion, range.max) > 0) return false;
  return true;
}

/**
 * Staff targeting narrows: a rule that asks for staff matches nobody the
 * request has not established as staff, so an unresolved subject is a customer.
 */
function staffMatches(conditions: FlagConditions, subject: FlagSubject): boolean {
  return conditions.internalStaffOnly !== true || subject.internalStaff === true;
}

export function conditionsMatch(conditions: FlagConditions, subject: FlagSubject): boolean {
  return (
    staffMatches(conditions, subject) &&
    includesValue(conditions.userIds, subject.userId) &&
    includesValue(conditions.workspaceIds, subject.workspaceId) &&
    includesValue(conditions.roles, subject.role) &&
    includesValue(conditions.plans, subject.plan) &&
    includesValue(conditions.regions, subject.region) &&
    includesValue(conditions.countries, subject.country) &&
    includesValue(conditions.surfaces, subject.surface) &&
    clientVersionMatches(conditions.clientVersion, subject.clientVersion)
  );
}

export function rolloutPercentage(rollout: FlagRollout | undefined, nowMs: number): number {
  if (!rollout) return PERCENT_SCALE;
  if ('percentage' in rollout) return rollout.percentage;
  const { fromPercentage, toPercentage, startAt, endAt } = rollout.ramp;
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (nowMs <= start) return fromPercentage;
  if (nowMs >= end) return toPercentage;
  const progress = (nowMs - start) / (end - start);
  return fromPercentage + (toPercentage - fromPercentage) * progress;
}

function bucketSubjectId(rule: FlagRule, subject: FlagSubject): string | null {
  return rule.bucketBy === 'workspace' ? subject.workspaceId : subject.userId;
}

function servedVariant(key: string, rule: FlagRule, bucketId: string): string {
  if (rule.variant !== undefined) return rule.variant;
  const arms = rule.split ?? [];
  const total = arms.reduce((sum, arm) => sum + arm.weight, 0);
  const point = stableBucket(`${key}:split:${rule.id}:${bucketId}`) * total;
  let cumulative = 0;
  for (const arm of arms) {
    cumulative += arm.weight;
    if (point < cumulative) return arm.variant;
  }
  return arms[arms.length - 1]?.variant ?? FLAG_OFF_VARIANT;
}

function isLive(expiresAt: string | null, nowMs: number): boolean {
  return expiresAt === null || Date.parse(expiresAt) > nowMs;
}

function result(
  definition: FlagDefinition,
  variant: string,
  reason: FlagEvaluationReason,
  ruleId: string | null = null,
): FlagEvaluation {
  return {
    key: definition.key,
    variant,
    enabled: variant !== FLAG_OFF_VARIANT,
    reason,
    ruleId,
    version: definition.version,
  };
}

export interface SubjectOverrides {
  user?: FlagOverride;
  workspace?: FlagOverride;
}

/**
 * Precedence, strongest first: the kill switch, expiry, a user override, a
 * workspace override, the first rule whose conditions match and whose rollout
 * bucket includes the subject, and finally the default variant.
 *
 * The bucket is a stable hash of the flag key, the rule id and the subject, so
 * a subject keeps its answer as a percentage only grows, and two flags ramped
 * to the same percentage do not select the same population.
 */
export function evaluateFlag(
  definition: FlagDefinition,
  subject: FlagSubject,
  overrides: SubjectOverrides,
  nowMs: number,
): FlagEvaluation {
  if (definition.killSwitch) return result(definition, FLAG_OFF_VARIANT, 'kill_switch');
  if (definition.expiresAt !== null && !isLive(definition.expiresAt, nowMs)) {
    return result(definition, definition.defaultVariant, 'expired');
  }
  const declared = new Set(definition.variants);
  for (const [override, reason] of [
    [overrides.user, 'user_override'],
    [overrides.workspace, 'workspace_override'],
  ] as const) {
    if (override && declared.has(override.variant) && isLive(override.expiresAt, nowMs)) {
      return result(definition, override.variant, reason);
    }
  }
  for (const rule of definition.rules) {
    if (!conditionsMatch(rule.conditions, subject)) continue;
    const bucketId = bucketSubjectId(rule, subject);
    if (bucketId === null) continue;
    const bucket = stableBucket(`${definition.key}:${rule.id}:${bucketId}`) * PERCENT_SCALE;
    if (bucket >= rolloutPercentage(rule.rollout, nowMs)) continue;
    return result(definition, servedVariant(definition.key, rule, bucketId), 'rule', rule.id);
  }
  return result(definition, definition.defaultVariant, 'default');
}

export function evaluateFlags(
  definitions: readonly FlagDefinition[],
  subject: FlagSubject,
  overrides: readonly FlagOverride[],
  nowMs: number,
): Record<string, FlagEvaluation> {
  const evaluations: Record<string, FlagEvaluation> = {};
  for (const definition of definitions) {
    if (definition.archivedAt !== null) continue;
    const forFlag = overrides.filter((override) => override.flagKey === definition.key);
    evaluations[definition.key] = evaluateFlag(
      definition,
      subject,
      {
        user: forFlag.find(
          (override) => override.subject === 'user' && override.subjectId === subject.userId,
        ),
        workspace: forFlag.find(
          (override) =>
            override.subject === 'workspace' && override.subjectId === subject.workspaceId,
        ),
      },
      nowMs,
    );
  }
  return evaluations;
}
