import 'server-only';

import { logger } from '@/lib/logger';
import { getHandoffConfig, isValidEmail } from './config';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { buildHandoffAccountContext } from './account-context';
import { generateReferenceId } from './reference-id';
import { resolveHumanAvailability, clearAvailabilityCache } from './presence-service';
import { sendEscalationEmail } from './escalation-email';
import {
  cancelSessionForOwner,
  claimExpiredWaitingBatch,
  claimExpiredWaitingSession,
  claimSessionForAgent,
  closeIdleConnectedSessions,
  getSessionForOwner,
  insertHandoffSession,
  listWaitingQueue,
  purgeOldHandoffSessions,
  recordEmailOutcome,
  type HandoffSessionRow,
} from './store';
import {
  normalizeAttemptedActions,
  normalizeCitations,
  normalizeSummary,
  normalizeTranscript,
} from './transcript';
import type {
  HandoffClaimResponse,
  HandoffCreateRequest,
  HandoffCreateResponse,
  HandoffNextStep,
  HandoffQueueEntry,
  HandoffStatusResponse,
} from './types';

export interface EscalateInput extends HandoffCreateRequest {
  ownerDb: DatabaseAdapter | null;
  ownerUserId: string | null;
  ownerSessionKey: string;
  verifiedEmail?: string | null;
}

export class MissingContactEmailError extends Error {
  constructor() {
    super('A contact email is required to escalate without a signed-in account');
    this.name = 'MissingContactEmailError';
  }
}

function mailtoHref(address: string, referenceId: string, summary: string): string {
  const subject = encodeURIComponent(`Support request ${referenceId}`);
  const body = encodeURIComponent(
    `Reference: ${referenceId}\n\n${summary}\n\n(Please keep the reference so support can find the details.)`,
  );
  return `mailto:${address}?subject=${subject}&body=${body}`;
}

function resolveContactEmail(input: EscalateInput): string {
  if (input.ownerUserId && isValidEmail(input.verifiedEmail)) {
    return input.verifiedEmail.trim();
  }
  if (isValidEmail(input.contactEmail)) {
    return input.contactEmail.trim();
  }
  throw new MissingContactEmailError();
}

function emailNextStep(): HandoffNextStep {
  return { kind: 'email_sent', label: 'Close this and watch your inbox' };
}

export async function escalateToHuman(input: EscalateInput): Promise<HandoffCreateResponse> {
  const config = getHandoffConfig();
  const contactEmail = resolveContactEmail(input);

  const { turns, droppedTurns } = normalizeTranscript(input.transcript);
  const accountContext = await buildHandoffAccountContext(input.ownerDb, input.ownerUserId);

  const availability = await resolveHumanAvailability({ skipCache: true });

  const referenceId = generateReferenceId();
  const waitExpiresAt = availability.live
    ? new Date(Date.now() + config.waitTimeoutSeconds * 1000).toISOString()
    : null;

  const row = await insertHandoffSession({
    referenceId,
    ownerUserId: input.ownerUserId,
    ownerSessionKey: input.ownerSessionKey,
    surface: input.surface,
    reason: input.reason,
    status: availability.live ? 'waiting' : 'emailed',
    contactEmail,
    summary: normalizeSummary(input.summary),
    transcript: turns,
    attemptedActions: normalizeAttemptedActions(input.attemptedActions),
    citations: normalizeCitations(input.citations),
    accountContext,
    pagePath: input.pagePath ?? null,
    locale: input.locale ?? null,
    waitExpiresAt,
  });

  if (!row) {
    throw new Error('Failed to persist support handoff session');
  }

  if (availability.live && waitExpiresAt) {
    return {
      mode: 'live',
      sessionId: row.id,
      referenceId,
      status: 'waiting',
      waitExpiresAt,
      waitTimeoutSeconds: config.waitTimeoutSeconds,
      pollIntervalMs: config.pollIntervalMs,
      onTimeout: 'email_fallback',
      headline: 'Connecting you to someone now',
      detail:
        `They'll see this whole conversation, so you don't have to repeat yourself. ` +
        `If nobody picks up within ${config.waitTimeoutSeconds} seconds, we'll email it to the ` +
        `support team instead and you'll get a reference number.`,
      nextStep: { kind: 'wait', label: 'Waiting for someone to pick up' },
    };
  }

  const send = await sendEscalationEmail(row, { droppedTurns });

  if (send.delivered) {
    await recordEmailOutcome({
      sessionId: row.id,
      status: 'emailed',
      providerMessageId: send.providerMessageId,
      errorDetail: null,
    });
    return {
      mode: 'email',
      referenceId,
      status: 'emailed',
      emailedTo: config.fallbackEmail,
      expectedReply: config.expectedReplyCopy,
      headline: 'No one is available right now',
      detail:
        `I've emailed this conversation, including what I already tried and your plan details, ` +
        `to ${config.fallbackEmail}. Someone will reply to ${contactEmail} ${config.expectedReplyCopy}. ` +
        `Your reference is ${referenceId}.`,
      nextStep: emailNextStep(),
    };
  }

  await recordEmailOutcome({
    sessionId: row.id,
    status: 'undeliverable',
    providerMessageId: null,
    errorDetail: `${send.reason}: ${send.detail}`.slice(0, 1_000),
  });
  logger.error(
    { referenceId, reason: send.reason },
    'Support escalation could not be emailed · returning degraded mode',
  );

  return {
    mode: 'unavailable',
    referenceId,
    status: 'undeliverable',
    headline: 'No one is available, and I could not send this automatically',
    detail:
      `Nobody is on live chat, and the support mailbox could not be reached just now, so nothing ` +
      `was sent on your behalf. Please email ${config.fallbackEmail} directly and quote ` +
      `${referenceId}, your conversation is saved under that reference.`,
    mailtoHref: mailtoHref(config.fallbackEmail, referenceId, input.summary),
    nextStep: {
      kind: 'contact',
      label: `Email ${config.fallbackEmail}`,
      href: mailtoHref(config.fallbackEmail, referenceId, input.summary),
    },
  };
}

function statusCopy(
  row: HandoffSessionRow,
  config: ReturnType<typeof getHandoffConfig>,
): { headline: string; detail: string; nextStep: HandoffNextStep } {
  switch (row.status) {
    case 'waiting':
      return {
        headline: 'Waiting for someone to pick up',
        detail: `If nobody joins by ${row.wait_expires_at ?? 'the deadline'}, this gets emailed to the support team automatically.`,
        nextStep: { kind: 'wait', label: 'Waiting for someone to pick up' },
      };
    case 'connected':
      return {
        headline: `${row.agent_display_name ?? 'Someone from support'} is here`,
        detail: 'They can see the whole conversation, so start wherever you like.',
        nextStep: { kind: 'wait', label: 'Chatting with support' },
      };
    case 'emailed':
    case 'timed_out_emailed':
      return {
        headline:
          row.status === 'timed_out_emailed'
            ? 'Nobody picked up, so I emailed it instead'
            : 'Sent to the support team',
        detail: `Someone will reply to ${row.contact_email} ${config.expectedReplyCopy}. Your reference is ${row.reference_id}.`,
        nextStep: emailNextStep(),
      };
    case 'undeliverable':
      return {
        headline: 'I could not send this automatically',
        detail: `Please email ${config.fallbackEmail} and quote ${row.reference_id}.`,
        nextStep: {
          kind: 'contact',
          label: `Email ${config.fallbackEmail}`,
          href: mailtoHref(config.fallbackEmail, row.reference_id, row.summary),
        },
      };
    case 'cancelled':
      return {
        headline: 'You cancelled this request',
        detail: 'Nothing further will happen. You can ask again whenever you like.',
        nextStep: { kind: 'retry', label: 'Ask again' },
      };
    case 'closed':
      return {
        headline: 'This conversation is closed',
        detail: `Reference ${row.reference_id}. Start a new one if you still need help.`,
        nextStep: { kind: 'closed', label: 'Start a new request' },
      };
  }
}

function toStatusResponse(
  row: HandoffSessionRow,
  config: ReturnType<typeof getHandoffConfig>,
): HandoffStatusResponse {
  const copy = statusCopy(row, config);
  return {
    sessionId: row.id,
    referenceId: row.reference_id,
    status: row.status,
    ...(row.agent_display_name ? { agentDisplayName: row.agent_display_name } : {}),
    ...(row.status === 'waiting' && row.wait_expires_at
      ? { waitExpiresAt: row.wait_expires_at }
      : {}),
    pollIntervalMs: config.pollIntervalMs,
    headline: copy.headline,
    detail: copy.detail,
    nextStep: copy.nextStep,
    ...(row.status === 'emailed' || row.status === 'timed_out_emailed'
      ? { emailedTo: config.fallbackEmail, expectedReply: config.expectedReplyCopy }
      : {}),
  };
}

export async function getHandoffStatusForOwner(
  sessionId: string,
  ownerSessionKey: string,
): Promise<HandoffStatusResponse | null> {
  const config = getHandoffConfig();
  const row = await getSessionForOwner(sessionId, ownerSessionKey);
  if (!row) return null;

  if (row.status !== 'waiting') {
    return toStatusResponse(row, config);
  }

  const expired =
    row.wait_expires_at !== null && new Date(row.wait_expires_at).getTime() <= Date.now();
  if (!expired) {
    return toStatusResponse(row, config);
  }

  const claimed = await claimExpiredWaitingSession(sessionId);
  if (!claimed) {
    const fresh = await getSessionForOwner(sessionId, ownerSessionKey);
    return fresh ? toStatusResponse(fresh, config) : null;
  }

  await deliverTimeoutEmail(claimed);
  const settled = await getSessionForOwner(sessionId, ownerSessionKey);
  return toStatusResponse(settled ?? { ...claimed, status: 'timed_out_emailed' }, config);
}

async function deliverTimeoutEmail(row: HandoffSessionRow): Promise<void> {
  const send = await sendEscalationEmail(row, { timedOut: true });
  if (send.delivered) {
    await recordEmailOutcome({
      sessionId: row.id,
      status: 'timed_out_emailed',
      providerMessageId: send.providerMessageId,
      errorDetail: null,
    });
    return;
  }
  await recordEmailOutcome({
    sessionId: row.id,
    status: 'undeliverable',
    providerMessageId: null,
    errorDetail: `${send.reason}: ${send.detail}`.slice(0, 1_000),
  });
  logger.error(
    { referenceId: row.reference_id, reason: send.reason },
    'Timed-out handoff could not be emailed',
  );
}

export async function cancelHandoffForOwner(
  sessionId: string,
  ownerSessionKey: string,
): Promise<HandoffStatusResponse | null> {
  const row = await cancelSessionForOwner(sessionId, ownerSessionKey);
  if (!row) return null;
  return toStatusResponse(row, getHandoffConfig());
}

export async function getWaitingQueue(limit = 50): Promise<HandoffQueueEntry[]> {
  const rows = await listWaitingQueue(limit);
  return rows.map((row) => ({
    sessionId: row.id,
    referenceId: row.reference_id,
    surface: row.surface,
    reason: row.reason,
    summary: row.summary,
    createdAt: row.created_at,
    waitExpiresAt: row.wait_expires_at,
    signedIn: row.owner_user_id !== null,
  }));
}

export async function claimHandoffForAgent(
  sessionId: string,
  agentUserId: string,
): Promise<HandoffClaimResponse | null> {
  const row = await claimSessionForAgent(sessionId, agentUserId);
  if (!row) return null;
  clearAvailabilityCache();
  return {
    sessionId: row.id,
    referenceId: row.reference_id,
    status: 'connected',
    summary: row.summary,
    reason: row.reason,
    surface: row.surface,
    transcript: row.transcript,
    attemptedActions: row.attempted_actions,
    citations: row.citations,
    accountContext: row.account_context,
    contactEmail: row.contact_email,
    pollIntervalMs: getHandoffConfig().pollIntervalMs,
  };
}

export interface HandoffSweepResult {
  expiredEmailed: number;
  idleClosed: number;
  purged: number;
}

export async function sweepExpiredHandoffs(batchLimit = 25): Promise<HandoffSweepResult> {
  const config = getHandoffConfig();
  const expired = await claimExpiredWaitingBatch(batchLimit);
  for (const row of expired) {
    await deliverTimeoutEmail(row);
  }
  const idleClosed = await closeIdleConnectedSessions(config.idleTimeoutSeconds);
  const purged = await purgeOldHandoffSessions(config.retentionDays);
  return { expiredEmailed: expired.length, idleClosed, purged };
}
