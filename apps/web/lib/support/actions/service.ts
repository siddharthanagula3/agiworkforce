import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  hashActionParams,
  hashConfirmationToken,
  mintConfirmationToken,
  SUPPORT_CONFIRMATION_TOKEN_TTL_MS,
  digestsMatch,
} from './confirmation-token';
import { EXCLUDED_SUPPORT_ACTIONS, isExcludedSupportAction } from './excluded';
import { executeHandoff } from './executors/handoffs';
import { assertApiKeyOwned, executeRegenerateApiKey } from './executors/regenerate-api-key';
import { assertConnectorRevocable, executeRevokeConnector } from './executors/revoke-connector';
import {
  claimProposal,
  countRecentProposals,
  finalizeProposal,
  insertProposal,
} from './proposal-store';
import { getSupportAction, SUPPORT_ACTIONS, type SupportActionDefinition } from './registry';
import { recordSupportActionAttempt, recordSupportActionRefusal } from './record';
import {
  SupportActionRefusal,
  SUPPORT_ACTION_IDS,
  type SupportActionId,
  type SupportActionOption,
  type SupportActionProposalView,
  type SupportActionResult,
  type SupportActionSurface,
} from './types';

export interface ProposeInput {
  db: DatabaseAdapter;
  userId: string;
  actionId: string;
  params: unknown;
  surface: SupportActionSurface;
  conversationRef: string | null;
  request?: Request;
}

export interface ProposeOutput {
  proposal: SupportActionProposalView;
  confirmationToken: string;
}

export interface ConfirmInput {
  db: DatabaseAdapter;
  userId: string;
  proposalId: string;
  confirmationToken: string;
  surface: SupportActionSurface;
  request?: Request;
}

async function assertTargetOwned(
  db: DatabaseAdapter,
  userId: string,
  actionId: SupportActionId,
  params: Record<string, unknown>,
): Promise<void> {
  switch (actionId) {
    case 'revoke_connector':
      await assertConnectorRevocable(db, userId, String(params['connectorId']));
      return;
    case 'regenerate_api_key':
      await assertApiKeyOwned(db, userId, String(params['keyId']));
      return;
    case 'resend_verification_email':
    case 'export_account_data':
    case 'open_billing_portal':
      return;
    default: {
      const exhaustive: never = actionId;
      throw new Error(`Unhandled support action: ${String(exhaustive)}`);
    }
  }
}

function parseParams(
  definition: SupportActionDefinition,
  params: unknown,
): Record<string, unknown> {
  const parsed = definition.paramsSchema.safeParse(params ?? {});
  if (!parsed.success) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_INVALID_PARAMS',
      400,
      'That request is missing something the action needs, so nothing was done.',
    );
  }
  return (parsed.data ?? {}) as Record<string, unknown>;
}

function assertNotExcluded(actionId: string, userId: string, surface: SupportActionSurface): void {
  if (!isExcludedSupportAction(actionId)) return;
  recordSupportActionRefusal({
    userId,
    requestedActionId: actionId,
    reason: 'excluded',
    surface,
  });
  const excluded = EXCLUDED_SUPPORT_ACTIONS[actionId];
  throw new SupportActionRefusal('SUPPORT_ACTION_EXCLUDED', 400, excluded.reason, {
    control: { ...excluded.control },
    explain: excluded.reason,
  });
}

export function listAvailableSupportActions(): {
  actions: SupportActionOption[];
  unavailable: { id: SupportActionId; reason: string }[];
  excluded: { id: string; reason: string; control: { label: string; href: string } }[];
} {
  const actions: SupportActionOption[] = [];
  const unavailable: { id: SupportActionId; reason: string }[] = [];

  for (const id of SUPPORT_ACTION_IDS) {
    const definition = SUPPORT_ACTIONS[id];
    const availability = definition.resolveAvailability();
    if (availability.available) {
      actions.push({ id, title: definition.title, description: definition.description });
    } else {
      unavailable.push({ id, reason: availability.reason ?? 'Not available in this deployment.' });
    }
  }

  return {
    actions,
    unavailable,
    excluded: Object.values(EXCLUDED_SUPPORT_ACTIONS).map((e) => ({
      id: e.id,
      reason: e.reason,
      control: { ...e.control },
    })),
  };
}

export async function proposeSupportAction(input: ProposeInput): Promise<ProposeOutput> {
  const { userId, surface } = input;
  if (!userId) throw new Error('proposeSupportAction requires an authenticated user id');

  assertNotExcluded(input.actionId, userId, surface);

  const definition = getSupportAction(input.actionId);
  if (!definition) {
    recordSupportActionRefusal({
      userId,
      requestedActionId: input.actionId,
      reason: 'unknown_action',
      surface,
    });
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNKNOWN',
      404,
      'The assistant cannot do that. It only performs a short list of safe, reversible actions.',
    );
  }
  const actionId = definition.id;

  const availability = definition.resolveAvailability();
  if (!availability.available) {
    await recordSupportActionAttempt({
      userId,
      actionId,
      phase: 'propose',
      outcome: 'denied',
      proposalId: null,
      surface,
      ...(input.request ? { request: input.request } : {}),
      reason: 'unavailable',
    });
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNAVAILABLE',
      409,
      availability.reason ?? 'That action is not available right now.',
    );
  }

  const params = parseParams(definition, input.params);

  const recentCount = await countRecentProposals({ userId, actionId });
  if (recentCount >= definition.perDayLimit) {
    await recordSupportActionAttempt({
      userId,
      actionId,
      phase: 'propose',
      outcome: 'denied',
      proposalId: null,
      surface,
      ...(input.request ? { request: input.request } : {}),
      reason: 'per_action_daily_limit',
    });
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_RATE_LIMITED',
      429,
      'You have done this too many times in the last day. Try again later, or ask for a person.',
    );
  }

  try {
    await assertTargetOwned(input.db, userId, actionId, params);
  } catch (error) {
    await recordSupportActionAttempt({
      userId,
      actionId,
      phase: 'propose',
      outcome: 'denied',
      proposalId: null,
      surface,
      ...(input.request ? { request: input.request } : {}),
      reason: error instanceof SupportActionRefusal ? error.code : 'ownership_check_failed',
    });
    throw error;
  }

  const { raw, hash } = mintConfirmationToken();
  const expiresAt = new Date(Date.now() + SUPPORT_CONFIRMATION_TOKEN_TTL_MS);
  const { id } = await insertProposal({
    userId,
    actionId,
    params,
    paramsHash: hashActionParams(params),
    tokenHash: hash,
    surface,
    conversationRef: input.conversationRef,
    expiresAt,
  });

  await recordSupportActionAttempt({
    userId,
    actionId,
    phase: 'propose',
    outcome: 'success',
    proposalId: id,
    surface,
    ...(input.request ? { request: input.request } : {}),
  });

  const described = definition.describe(params);
  return {
    proposal: {
      id,
      actionId,
      title: definition.title,
      summary: described.summary,
      effects: [...described.effects, described.reversibleNote],
      reversible: true,
      expiresAt: expiresAt.toISOString(),
    },
    confirmationToken: raw,
  };
}

export async function confirmSupportAction(input: ConfirmInput): Promise<{
  actionId: SupportActionId;
  result: SupportActionResult;
}> {
  const { userId, surface } = input;
  if (!userId) throw new Error('confirmSupportAction requires an authenticated user id');

  const claimed = await claimProposal({
    proposalId: input.proposalId,
    userId,
    tokenHash: hashConfirmationToken(input.confirmationToken),
  });

  if (!claimed) {
    logger.warn(
      {
        event: 'support_action_claim_rejected',
        userId,
        proposalId: input.proposalId,
        surface,
      },
      'Support action confirmation could not be claimed',
    );
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_PROPOSAL_SPENT',
      410,
      'That confirmation is no longer valid. Ask again and confirm the new proposal.',
    );
  }

  const definition = getSupportAction(claimed.action_id);
  if (!definition) {
    await finalizeProposal({ proposalId: claimed.id, userId, outcome: 'denied' });
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNKNOWN',
      404,
      'That action is no longer supported.',
    );
  }
  const actionId = definition.id;

  const fail = async (reason: string, outcome: 'failure' | 'denied') => {
    await finalizeProposal({ proposalId: claimed.id, userId, outcome });
    await recordSupportActionAttempt({
      userId,
      actionId,
      phase: 'confirm',
      outcome,
      proposalId: claimed.id,
      surface,
      ...(input.request ? { request: input.request } : {}),
      reason,
    });
  };

  const storedParams = (claimed.params ?? {}) as Record<string, unknown>;

  if (!digestsMatch(hashActionParams(storedParams), claimed.params_hash)) {
    await fail('params_hash_mismatch', 'denied');
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_INVALID_PARAMS',
      409,
      'That confirmation no longer matches what was proposed, so nothing was done.',
    );
  }

  const params = (() => {
    const parsed = definition.paramsSchema.safeParse(storedParams);
    return parsed.success ? ((parsed.data ?? {}) as Record<string, unknown>) : null;
  })();
  if (!params) {
    await fail('stored_params_invalid', 'denied');
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_INVALID_PARAMS',
      409,
      'That confirmation no longer matches what was proposed, so nothing was done.',
    );
  }

  const availability = definition.resolveAvailability();
  if (!availability.available) {
    await fail('unavailable', 'denied');
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_UNAVAILABLE',
      409,
      availability.reason ?? 'That action is not available right now.',
    );
  }

  try {
    await assertTargetOwned(input.db, userId, actionId, params);
  } catch (error) {
    await fail(
      error instanceof SupportActionRefusal ? error.code : 'ownership_check_failed',
      'denied',
    );
    throw error;
  }

  let result: SupportActionResult;
  try {
    result = await executeAction(input.db, definition, userId, params);
  } catch (error) {
    await fail(
      error instanceof SupportActionRefusal ? error.code : 'execution_failed',
      error instanceof SupportActionRefusal ? 'denied' : 'failure',
    );
    throw error;
  }

  await finalizeProposal({ proposalId: claimed.id, userId, outcome: 'success' });
  await recordSupportActionAttempt({
    userId,
    actionId,
    phase: 'confirm',
    outcome: 'success',
    proposalId: claimed.id,
    surface,
    ...(input.request ? { request: input.request } : {}),
  });

  return { actionId, result };
}

async function executeAction(
  db: DatabaseAdapter,
  definition: SupportActionDefinition,
  userId: string,
  params: Record<string, unknown>,
): Promise<SupportActionResult> {
  switch (definition.id) {
    case 'revoke_connector':
      return executeRevokeConnector({ db, userId, connectorId: String(params['connectorId']) });
    case 'regenerate_api_key':
      return executeRegenerateApiKey({ db, userId, keyId: String(params['keyId']) });
    case 'export_account_data':
    case 'open_billing_portal':
      return executeHandoff(definition);
    case 'resend_verification_email':
      throw new SupportActionRefusal(
        'SUPPORT_ACTION_UNAVAILABLE',
        409,
        'This deployment cannot send verification email yet.',
      );
    default: {
      const exhaustive: never = definition.id;
      throw new Error(`Unhandled support action: ${String(exhaustive)}`);
    }
  }
}
