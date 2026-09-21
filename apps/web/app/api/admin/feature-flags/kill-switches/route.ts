import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getModelRegistryFacts, providerLabels } from '@agiworkforce/types';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import {
  clearFeatureVersionDisable,
  disableFeatureForVersions,
  engageKillSwitch,
} from '@/lib/feature-flags/flag-admin-service';
import { listFlagDefinitions } from '@/lib/feature-flags/flag-store';
import {
  ALL_KILL_SWITCH_CAPABILITIES,
  CAPABILITY_FLAG_PREFIX,
  activeKillSwitches,
  capabilityForKillSwitchKey,
  capabilityFlagSuffix,
  capabilityKillSwitchKey,
  modelKillSwitchKey,
  providerKillSwitchKey,
} from '@/lib/feature-flags/kill-switches';
import { listLockedDownTenants } from '@/lib/feature-flags/tenant-lockdown';
import type { FeatureVersionDisable } from '@/lib/feature-flags/version-disable';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * A range narrows the switch to the builds that are broken. `reason` is said
 * back to whoever hits the gate, so it is a sentence and not an operator note;
 * `incident` is how support finds the rest of the story and how one incident's
 * range is lifted without touching another's.
 */
const RangeSchema = z
  .object({
    min: z.string().trim().min(1).max(32).optional(),
    max: z.string().trim().min(1).max(32).optional(),
    surfaces: z.array(z.string().trim().min(1).max(64)).max(16).optional(),
    reason: z.string().trim().min(1).max(500),
    incident: z.string().trim().min(1).max(64),
  })
  .strict();

const EngageSchema = z
  .object({
    scope: z.enum(['capability', 'model', 'provider']),
    subject: z.string().trim().min(1).max(200),
    engaged: z.boolean(),
    range: RangeSchema.optional(),
  })
  .strict();

const ClearSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    incident: z.string().trim().min(1).max(64),
  })
  .strict();

type EngageInput = z.infer<typeof EngageSchema>;
type RangeInput = z.infer<typeof RangeSchema>;

function capabilityNamed(subject: string) {
  const capability = capabilityForKillSwitchKey(`${CAPABILITY_FLAG_PREFIX}${subject}`);
  if (!capability) throw createError.badRequest('No capability by that name');
  return capability;
}

function versionDisable(input: EngageInput, range: RangeInput): FeatureVersionDisable {
  if (input.scope !== 'capability') {
    throw createError.badRequest('Only a capability can be closed for a range of builds');
  }
  if (!input.engaged) {
    throw createError.badRequest(
      'A range closes a capability. Lift one with DELETE, which names the incident it belongs to.',
    );
  }
  return {
    capability: capabilityNamed(input.subject),
    surfaces: range.surfaces ?? [],
    minVersion: range.min ?? null,
    maxVersion: range.max ?? null,
    reason: range.reason,
    incident: range.incident,
  };
}

function switchTarget(input: EngageInput): { key: string; description: string } {
  if (input.scope === 'capability') {
    const capability = capabilityForKillSwitchKey(`${CAPABILITY_FLAG_PREFIX}${input.subject}`);
    if (!capability) throw createError.badRequest('No capability by that name');
    return {
      key: capabilityKillSwitchKey(capability),
      description: `Open unless the ${input.subject} capability is switched off.`,
    };
  }
  if (input.scope === 'model') {
    if (!getModelRegistryFacts(input.subject)) {
      throw createError.badRequest('No model by that id');
    }
    return {
      key: modelKillSwitchKey(input.subject),
      description: `Open unless ${input.subject} is switched off.`,
    };
  }
  if (!providerLabels[input.subject]) throw createError.badRequest('No provider by that id');
  return {
    key: providerKillSwitchKey(input.subject),
    description: `Open unless the ${input.subject} provider is switched off.`,
  };
}

/**
 * The one place that answers "what is switched off right now": every active
 * kill switch with what it covers and who it covers, plus the workspaces held
 * off by a lockdown. Without it an operator has to remember which of a hundred
 * flags were kill switches.
 */
async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const definitions = await listFlagDefinitions();
  return NextResponse.json(
    {
      active: activeKillSwitches(definitions),
      lockedDownTenants: await listLockedDownTenants(),
      capabilities: ALL_KILL_SWITCH_CAPABILITIES.map((capability) =>
        capabilityFlagSuffix(capability),
      ),
    },
    { headers: NO_STORE },
  );
}

async function handleEngage(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = EngageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid kill switch request', parsed.error.flatten());
  }
  const { range } = parsed.data;
  if (range) {
    const flag = await disableFeatureForVersions(
      { userId, request },
      versionDisable(parsed.data, range),
    );
    return NextResponse.json({ flag }, { headers: NO_STORE });
  }
  const target = switchTarget(parsed.data);
  const flag = await engageKillSwitch(
    { userId, request },
    target.key,
    target.description,
    parsed.data.engaged,
  );
  return NextResponse.json({ flag }, { headers: NO_STORE });
}

/**
 * Lift one incident's range. Every other range on the same switch stays closed,
 * because two builds can be broken at once and clearing one is not clearing
 * both.
 */
async function handleClear(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = ClearSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid kill switch request', parsed.error.flatten());
  }
  const flag = await clearFeatureVersionDisable(
    { userId, request },
    capabilityKillSwitchKey(capabilityNamed(parsed.data.subject)),
    parsed.data.incident,
  );
  return NextResponse.json({ flag }, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleEngage);
export const DELETE = withErrorHandler(handleClear);
