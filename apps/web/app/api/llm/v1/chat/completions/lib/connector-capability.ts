import 'server-only';

import { getTierPolicy } from '@agiworkforce/types';

import { readKillSwitchGate } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { logger } from '@/lib/logger';

export async function connectorsAllowedForTurn(
  request: Request,
  userId: string,
  turn: {
    organizationId?: string | null;
    subscriptionTier?: string | undefined;
    chatSurface: string;
  },
): Promise<boolean> {
  if (!getTierPolicy(turn.subscriptionTier).allowMCP) return false;
  return readKillSwitchGate(
    buildFlagSubject(request, {
      userId,
      workspaceId: turn.organizationId ?? null,
      role: null,
      plan: turn.subscriptionTier ?? null,
      surface: turn.chatSurface,
    }),
  ).then(
    (gate) => gate.capabilityAllowed('canUseConnectors'),
    (gateError: unknown) => {
      logger.error(
        { error: gateError, userId },
        'Kill-switch gate unreadable; connectors are offered as shipped',
      );
      return true;
    },
  );
}
