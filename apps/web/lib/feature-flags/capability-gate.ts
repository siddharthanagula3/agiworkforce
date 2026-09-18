import 'server-only';

import { createError } from '@/lib/errors';

import type { FlagEvaluation, FlagSubject } from './evaluate-flags';
import { evaluateFlagsForSubject } from './flag-evaluation-service';
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
  if (gate.tenantLockedDown) {
    throw createError.forbidden(
      'This workspace is locked down while an incident is investigated. Contact support.',
    );
  }
  if (!gate.capabilityAllowed(capability)) {
    throw createError.serviceUnavailable(
      `${label} is temporarily switched off while we investigate a problem with it.`,
    );
  }
}
