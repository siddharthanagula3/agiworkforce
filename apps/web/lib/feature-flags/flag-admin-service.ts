import 'server-only';

import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';

import type { FlagDefinition, FlagDefinitionInput, FlagOverrideInput } from './flag-definition';
import {
  archiveFlagDefinition,
  deleteFlagOverride,
  ensureFlagDefinition,
  getFlagDefinition,
  insertFlagDefinition,
  setFlagKillSwitch,
  updateFlagDefinition,
  upsertFlagOverride,
} from './flag-store';
import { killSwitchDefinition } from './kill-switches';
import { archivableStaleFlags, findStaleFlags, type StaleFlag } from './stale-flags';
import {
  versionDisableBlockers,
  versionDisableDescription,
  withVersionDisable,
  withoutVersionDisable,
  type FeatureVersionDisable,
} from './version-disable';

const FLAG_RESOURCE_TYPE = 'feature_flag';
const FLAG_ADMIN_SURFACE = 'operator';

interface AdminActor {
  userId: string;
  request: Request;
}

const COMPARED_FIELDS = [
  'description',
  'killSwitch',
  'variants',
  'defaultVariant',
  'rules',
  'expiresAt',
  'maturity',
  'channel',
  'availability',
  'owner',
] as const satisfies readonly (keyof FlagDefinitionInput)[];

function changedFields(before: FlagDefinition, after: FlagDefinitionInput): string[] {
  return COMPARED_FIELDS.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
}

async function auditFlagChange(
  actor: AdminActor,
  definition: FlagDefinition,
  status: string,
  changedKeys: readonly string[],
): Promise<void> {
  await recordAuditEvent({
    userId: actor.userId,
    eventType: 'feature_flag_changed',
    severity: definition.killSwitch || status === 'archived' ? 'warning' : 'info',
    request: actor.request,
    surface: FLAG_ADMIN_SURFACE,
    detail: {
      resourceType: FLAG_RESOURCE_TYPE,
      resourceId: definition.key,
      status,
      changedKeys: [...changedKeys],
      enabled: !definition.killSwitch,
      version: String(definition.version),
    },
  });
}

export async function createFlag(
  actor: AdminActor,
  input: FlagDefinitionInput,
): Promise<FlagDefinition> {
  const created = await insertFlagDefinition(input);
  if (!created) throw createError.conflict(`A flag named ${input.key} already exists`);
  await auditFlagChange(actor, created, 'created', COMPARED_FIELDS);
  return created;
}

export async function updateFlag(
  actor: AdminActor,
  input: FlagDefinitionInput,
  expectedVersion: number,
): Promise<FlagDefinition> {
  const before = await getFlagDefinition(input.key);
  if (!before || before.archivedAt !== null)
    throw createError.notFound('No active flag by that name');
  const updated = await updateFlagDefinition(input, expectedVersion);
  if (!updated) {
    throw createError.conflict('The flag changed since it was loaded. Reload it and try again.');
  }
  await auditFlagChange(actor, updated, 'updated', changedFields(before, input));
  return updated;
}

export async function toggleFlagKillSwitch(
  actor: AdminActor,
  key: string,
  killSwitch: boolean,
): Promise<FlagDefinition> {
  const updated = await setFlagKillSwitch(key, killSwitch);
  if (!updated) throw createError.notFound('No active flag by that name');
  await auditFlagChange(actor, updated, killSwitch ? 'killed' : 'restored', ['killSwitch']);
  return updated;
}

/**
 * Flip a named kill switch whether or not anybody created the flag first. An
 * incident is the wrong moment to discover that the switch for the capability
 * you need off was never defined, so the definition is created open and closed
 * in the same request.
 */
export async function engageKillSwitch(
  actor: AdminActor,
  key: string,
  description: string,
  engaged: boolean,
): Promise<FlagDefinition> {
  const definition = await ensureFlagDefinition(killSwitchDefinition(key, description));
  if (!definition) {
    throw createError.internal('The switch could not be prepared. Nothing was changed.');
  }
  if (definition.killSwitch === engaged) return definition;
  return toggleFlagKillSwitch(actor, key, engaged);
}

/**
 * Close one capability for one range of builds. This is the response to a
 * release that shipped broken: the affected builds stop being offered the
 * thing, every other build keeps it, and nobody has to wait for a store review
 * or a forced update. The switch is created open if it did not exist, so an
 * incident is not the moment to discover nobody defined it.
 */
export async function disableFeatureForVersions(
  actor: AdminActor,
  disable: FeatureVersionDisable,
): Promise<FlagDefinition> {
  const [blocker] = versionDisableBlockers(disable);
  if (blocker !== undefined) throw createError.badRequest(blocker);
  const key = withVersionDisable(null, disable).key;
  const prepared = await ensureFlagDefinition(
    killSwitchDefinition(key, versionDisableDescription(disable)),
  );
  if (!prepared) {
    throw createError.internal('The switch could not be prepared. Nothing was changed.');
  }
  const updated = await updateFlagDefinition(
    withVersionDisable(prepared, disable),
    prepared.version,
  );
  if (!updated) {
    throw createError.conflict('The switch changed while it was being written. Try again.');
  }
  await auditFlagChange(actor, updated, `disabled_for_versions:${disable.incident}`, [
    'rules',
    'description',
  ]);
  return updated;
}

/**
 * Lift one incident's range. Every other range on the same switch stays closed,
 * because two builds can be broken at once and clearing one is not clearing
 * both.
 */
export async function clearFeatureVersionDisable(
  actor: AdminActor,
  key: string,
  incident: string,
): Promise<FlagDefinition> {
  const existing = await getFlagDefinition(key);
  if (!existing || existing.archivedAt !== null) {
    throw createError.notFound('No active flag by that name');
  }
  const cleared = withoutVersionDisable(existing, incident);
  if (!cleared) throw createError.notFound('That incident holds nothing off on this switch');
  const updated = await updateFlagDefinition(cleared, existing.version);
  if (!updated) {
    throw createError.conflict('The switch changed while it was being written. Try again.');
  }
  await auditFlagChange(actor, updated, `version_disable_cleared:${incident}`, ['rules']);
  return updated;
}

export async function cleanUpStaleFlags(
  actor: AdminActor,
  definitions: readonly FlagDefinition[],
  nowMs: number = Date.now(),
): Promise<{ archived: StaleFlag[]; retained: StaleFlag[] }> {
  const stale = findStaleFlags(definitions, nowMs);
  const archivable = archivableStaleFlags(stale);
  const archived: StaleFlag[] = [];
  for (const flag of archivable) {
    const definition = await archiveFlagDefinition(flag.key);
    if (!definition) continue;
    await auditFlagChange(actor, definition, `archived_stale:${flag.reason}`, []);
    archived.push(flag);
  }
  const archivedKeys = new Set(archived.map((flag) => flag.key));
  return { archived, retained: stale.filter((flag) => !archivedKeys.has(flag.key)) };
}

export async function archiveFlag(actor: AdminActor, key: string): Promise<FlagDefinition> {
  const archived = await archiveFlagDefinition(key);
  if (!archived) throw createError.notFound('No active flag by that name');
  await auditFlagChange(actor, archived, 'archived', []);
  return archived;
}

async function auditOverride(
  actor: AdminActor,
  key: string,
  status: 'set' | 'removed',
  subject: FlagOverrideInput['subject'],
  subjectId: string,
  variant?: string,
): Promise<void> {
  await recordAuditEvent({
    userId: actor.userId,
    eventType: 'feature_flag_override_changed',
    request: actor.request,
    surface: FLAG_ADMIN_SURFACE,
    ...(subject === 'workspace' ? { organizationId: subjectId } : {}),
    detail: {
      resourceType: FLAG_RESOURCE_TYPE,
      resourceId: key,
      status,
      scope: subject,
      ...(subject === 'workspace' ? { organizationId: subjectId } : { targetUserId: subjectId }),
      ...(variant ? { variant } : {}),
    },
  });
}

export async function setFlagOverride(
  actor: AdminActor,
  key: string,
  input: FlagOverrideInput,
): Promise<void> {
  const definition = await getFlagDefinition(key);
  if (!definition || definition.archivedAt !== null) {
    throw createError.notFound('No active flag by that name');
  }
  if (!definition.variants.includes(input.variant)) {
    throw createError.badRequest(`Flag ${key} declares no variant ${input.variant}`);
  }
  await upsertFlagOverride(key, input);
  await auditOverride(actor, key, 'set', input.subject, input.subjectId, input.variant);
}

export async function removeFlagOverride(
  actor: AdminActor,
  key: string,
  subject: FlagOverrideInput['subject'],
  subjectId: string,
): Promise<void> {
  const removed = await deleteFlagOverride(key, subject, subjectId);
  if (removed === 0) throw createError.notFound('No override for that subject');
  await auditOverride(actor, key, 'removed', subject, subjectId);
}
