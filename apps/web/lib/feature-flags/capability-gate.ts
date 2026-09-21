import 'server-only';

import type { CapabilityDenialReason } from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { recordCapabilityDenial } from '@/lib/observability/denials';

import type { FlagEvaluation, FlagSubject } from './evaluate-flags';
import { evaluateFlagsForSubject } from './flag-evaluation-service';
import { getActiveFlagDefinitions } from './flag-store';
import { versionDisableReason } from './version-disable';
import {
  ALL_KILL_SWITCH_CAPABILITIES,
  KILL_SWITCH_PREFIXES,
  TENANT_LOCKDOWN_FLAG_KEY,
  capabilityKillSwitchKey,
  isGateOpen,
  modelKillSwitchKey,
  providerKillSwitchKey,
  type KillSwitchCapability,
} from './kill-switches';

export interface KillSwitchGate {
  capabilityAllowed: (capability: KillSwitchCapability) => boolean;
  modelAllowed: (modelId: string) => boolean;
  providerAllowed: (providerId: string) => boolean;
  tenantLockedDown: boolean;
  closedCapabilities: KillSwitchCapability[];
}

function killSwitchGate(evaluations: Readonly<Record<string, FlagEvaluation>>): KillSwitchGate {
  return {
    capabilityAllowed: (capability) => isGateOpen(evaluations, capabilityKillSwitchKey(capability)),
    modelAllowed: (modelId) => isGateOpen(evaluations, modelKillSwitchKey(modelId)),
    providerAllowed: (providerId) => isGateOpen(evaluations, providerKillSwitchKey(providerId)),
    tenantLockedDown: !isGateOpen(evaluations, TENANT_LOCKDOWN_FLAG_KEY),
    closedCapabilities: ALL_KILL_SWITCH_CAPABILITIES.filter(
      (capability) => !isGateOpen(evaluations, capabilityKillSwitchKey(capability)),
    ),
  };
}

/**
 * The switches that apply to one request, read once. Every surface asks the
 * same question of the same flags, so a capability disabled here is disabled on
 * web, desktop, mobile and the API within the definition cache's lifetime and
 * without a release of any of them.
 */
export async function readKillSwitchGate(
  subject: FlagSubject,
  nowMs: number = Date.now(),
): Promise<KillSwitchGate> {
  return killSwitchGate(
    await evaluateFlagsForSubject(subject, { keyPrefixes: KILL_SWITCH_PREFIXES }, nowMs),
  );
}

export async function assertCapabilityAvailable(
  subject: FlagSubject,
  capability: KillSwitchCapability,
  label: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const gate = await readKillSwitchGate(subject, nowMs);
  const denied = (reason: CapabilityDenialReason): void => {
    recordCapabilityDenial({
      layer: 'capability',
      reason,
      surface: subject.surface,
      organizationId: subject.workspaceId,
    });
  };
  if (gate.tenantLockedDown) {
    denied('disabled_by_organization');
    throw createError.forbidden(
      'This workspace is locked down while an incident is investigated. Contact support.',
    );
  }
  if (!gate.capabilityAllowed(capability)) {
    denied('temporarily_unavailable');
    throw createError.serviceUnavailable(await closedMessage(capability, label, nowMs));
  }
}

/**
 * What the caller is told. When an operator closed this capability for a range
 * of builds they wrote down why and which incident it belongs to, and that is
 * the sentence to say: a person told only "unavailable" has no next step and
 * support has nothing to look up.
 */
async function closedMessage(
  capability: KillSwitchCapability,
  label: string,
  nowMs: number,
): Promise<string> {
  const generic = `${label} is temporarily switched off while we investigate a problem with it.`;
  const definitions = await getActiveFlagDefinitions(nowMs).catch(() => []);
  const reason = versionDisableReason(definitions, capability);
  return reason === null ? generic : `${label} is switched off for this version. ${reason}`;
}
