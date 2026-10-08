import 'server-only';

import {
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
  getTierPolicy,
} from '@agiworkforce/types';

import { createError, type AppError } from '@/lib/errors';
import { readKillSwitchGate } from '@/lib/feature-flags/capability-gate';
import type { FlagSubject } from '@/lib/feature-flags/evaluate-flags';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { logger } from '@/lib/logger';
import { managedCloudDataRegion } from '@/lib/server/data-region';

export function connectorsComingSoonError(): AppError {
  return createError.forbidden(CONNECTORS_COMING_SOON_MESSAGE).asUserSafe();
}

export function assertConnectorsReleased(): void {
  if (!connectorsReleased()) throw connectorsComingSoonError();
}

async function connectorSwitchOpen(subject: FlagSubject): Promise<boolean> {
  return readKillSwitchGate(subject).then(
    (gate) => gate.capabilityAllowed('canUseConnectors'),
    (gateError: unknown) => {
      logger.error(
        { error: gateError, userId: subject.userId },
        'Kill-switch gate unreadable; connector tools withheld',
      );
      return false;
    },
  );
}

export async function connectorsAllowedForTurn(
  request: Request,
  userId: string,
  turn: {
    organizationId?: string | null;
    subscriptionTier?: string | undefined;
    chatSurface: string;
  },
): Promise<boolean> {
  if (!connectorsReleased()) return false;
  if (!getTierPolicy(turn.subscriptionTier).allowMCP) return false;
  return connectorSwitchOpen(
    buildFlagSubject(request, {
      userId,
      workspaceId: turn.organizationId ?? null,
      role: null,
      plan: turn.subscriptionTier ?? null,
      surface: turn.chatSurface,
    }),
  );
}

export async function connectorsAllowedWithoutRequest(input: {
  userId: string;
  organizationId: string | null | undefined;
  planTier: string | null | undefined;
  surface?: string | null;
}): Promise<boolean> {
  if (!connectorsReleased()) return false;
  if (!getTierPolicy(input.planTier).allowMCP) return false;
  return connectorSwitchOpen({
    userId: input.userId,
    workspaceId: input.organizationId ?? null,
    role: null,
    plan: input.planTier ?? null,
    surface: input.surface ?? null,
    region: managedCloudDataRegion(),
    country: null,
    clientVersion: null,
    internalStaff: false,
  });
}
