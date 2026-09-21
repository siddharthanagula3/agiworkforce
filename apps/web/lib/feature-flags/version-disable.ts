import type { FlagDefinition, FlagDefinitionInput } from './flag-definition';
import {
  ALL_KILL_SWITCH_CAPABILITIES,
  capabilityKillSwitchKey,
  clientVersionKillRule,
  killSwitchDefinition,
  type KillSwitchCapability,
} from './kill-switches';

/**
 * One broken build, switched off from the server.
 *
 * Without this the only answer to a capability that crashes on one release is
 * to switch it off for everybody, which punishes every working build, or to
 * force an update, which a store review can hold for days. A range closes the
 * gate for exactly the builds that are broken and leaves every other build
 * alone.
 *
 * `reason` is written for the person who hits it, not for the operator: it is
 * the sentence the server says back when their client asks, so it says what
 * happened and that it is being worked on. `incident` is how support finds the
 * rest of the story.
 */
export interface FeatureVersionDisable {
  capability: KillSwitchCapability;
  /** Empty means every surface; a broken iOS build does not close the web app. */
  surfaces: readonly string[];
  minVersion: string | null;
  maxVersion: string | null;
  reason: string;
  incident: string;
}

const INCIDENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,48}$/;
const VERSION_PATTERN = /^\d{1,6}(\.\d{1,6}){0,2}$/;
const SHORTEST_REASON = 20;
const INCIDENT_MARK = 'incident ';

export function versionDisableRuleId(incident: string): string {
  return `disabled-${incident.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 64);
}

/**
 * The sentence stored on the flag and said back to whoever hits the gate. The
 * incident reference is part of the sentence rather than a second column,
 * because the only place it has to survive is where somebody reads it.
 */
export function versionDisableDescription(disable: FeatureVersionDisable): string {
  return `${disable.reason.trim()} (${INCIDENT_MARK}${disable.incident})`;
}

export function versionDisableIncident(description: string): string | null {
  return new RegExp(`\\(${INCIDENT_MARK}([^)]+)\\)\\s*$`).exec(description)?.[1] ?? null;
}

/** Why this disable may not be written as asked. */
export function versionDisableBlockers(disable: FeatureVersionDisable): string[] {
  const blockers: string[] = [];
  if (!ALL_KILL_SWITCH_CAPABILITIES.includes(disable.capability)) {
    blockers.push(`${disable.capability} is not a capability with a switch`);
  }
  if (!INCIDENT_PATTERN.test(disable.incident)) {
    blockers.push('A disable carries the incident reference support will be asked for');
  }
  if (disable.reason.trim().length < SHORTEST_REASON) {
    blockers.push('The reason is said back to the person who hits the gate, so it is a sentence');
  }
  for (const version of [disable.minVersion, disable.maxVersion]) {
    if (version !== null && !VERSION_PATTERN.test(version)) {
      blockers.push(`${version} is not a client version`);
    }
  }
  if (disable.minVersion === null && disable.maxVersion === null) {
    blockers.push(
      'A disable with no version range closes the capability for every build, which is the global ' +
        'switch rather than this one',
    );
  }
  return blockers;
}

/**
 * The flag that carries it. A disable is an ordinary kill-switch flag with a
 * version rule, so it is evaluated by the one evaluator every surface already
 * reads and reaches a client on its next request rather than its next release.
 */
export function versionDisableDefinition(disable: FeatureVersionDisable): FlagDefinitionInput {
  const blockers = versionDisableBlockers(disable);
  if (blockers.length > 0) throw new Error(blockers[0]);
  return killSwitchDefinition(
    capabilityKillSwitchKey(disable.capability),
    versionDisableDescription(disable),
    [
      clientVersionKillRule(
        versionDisableRuleId(disable.incident),
        {
          ...(disable.minVersion === null ? {} : { min: disable.minVersion }),
          ...(disable.maxVersion === null ? {} : { max: disable.maxVersion }),
        },
        disable.surfaces,
      ),
    ],
  );
}

/**
 * A second incident on the same capability adds a range; it does not replace
 * the first one's. Two builds can be broken at once, and the write that closes
 * the second must not quietly reopen the first.
 */
export function withVersionDisable(
  existing: FlagDefinition | null,
  disable: FeatureVersionDisable,
): FlagDefinitionInput {
  const added = versionDisableDefinition(disable);
  if (existing === null) return added;
  const ruleId = versionDisableRuleId(disable.incident);
  const kept = existing.rules.filter((rule) => rule.id !== ruleId);
  return {
    ...added,
    description: versionDisableDescription(disable),
    killSwitch: existing.killSwitch,
    variants: existing.variants,
    defaultVariant: existing.defaultVariant,
    rules: [...kept, ...added.rules],
    expiresAt: existing.expiresAt,
    ...(existing.owner === undefined ? {} : { owner: existing.owner }),
  };
}

/**
 * Lift one incident's range back off without touching any other. Returns null
 * when that incident held nothing, so a mistaken clear changes nothing.
 */
export function withoutVersionDisable(
  existing: FlagDefinition,
  incident: string,
): FlagDefinitionInput | null {
  const ruleId = versionDisableRuleId(incident);
  const kept = existing.rules.filter((rule) => rule.id !== ruleId);
  if (kept.length === existing.rules.length) return null;
  return {
    key: existing.key,
    description: existing.description,
    killSwitch: existing.killSwitch,
    variants: existing.variants,
    defaultVariant: existing.defaultVariant,
    rules: kept,
    expiresAt: existing.expiresAt,
    ...(existing.owner === undefined ? {} : { owner: existing.owner }),
  };
}

/**
 * What to say to a caller whose build has been switched off. An absent or
 * unexplained switch yields nothing rather than an invented sentence, so a
 * capability closed for some other reason is not attributed to an incident.
 */
export function versionDisableReason(
  definitions: readonly FlagDefinition[],
  capability: KillSwitchCapability,
): string | null {
  const key = capabilityKillSwitchKey(capability);
  const definition = definitions.find(
    (candidate) => candidate.key === key && candidate.archivedAt === null,
  );
  if (definition === undefined) return null;
  const description = definition.description.trim();
  return versionDisableIncident(description) === null ? null : description;
}
