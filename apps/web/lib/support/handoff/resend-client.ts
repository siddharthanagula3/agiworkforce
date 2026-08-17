import 'server-only';

import { logger } from '@/lib/logger';
import { getHandoffConfig, isValidEmail } from './config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

export type SendEmailFailureReason =
  | 'not_configured'
  | 'invalid_recipient'
  | 'rejected'
  | 'timeout'
  | 'network';

export type SendEmailResult =
  | { delivered: true; providerMessageId: string | null }
  | {
      delivered: false;
      reason: SendEmailFailureReason;
      detail: string;
    };

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  idempotencyKey?: string;
}

export interface TransactionalEmailInput extends SendEmailInput {
  from: string;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function postOnce(
  apiKey: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ ok: true; id: string | null } | { ok: false; retryable: boolean; detail: string }> {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        retryable: isRetryable(response.status),
        detail: `${response.status} ${detail.slice(0, 500)}`.trim(),
      };
    }

    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return { ok: true, id: typeof body?.id === 'string' ? body.id : null };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      retryable: true,
      detail: name === 'TimeoutError' || name === 'AbortError' ? `timeout: ${detail}` : detail,
    };
  }
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env['RESEND_API_KEY']?.trim() || null;
  if (!apiKey || !isValidEmail(input.from)) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and a valid sender address are required',
    };
  }
  if (!isValidEmail(input.to)) {
    return {
      delivered: false,
      reason: 'invalid_recipient',
      detail: 'recipient is not a valid address',
    };
  }
  const idempotencyKey = input.idempotencyKey?.trim();
  if (idempotencyKey && (idempotencyKey.length > 256 || !/^[\x21-\x7e]+$/u.test(idempotencyKey))) {
    return {
      delivered: false,
      reason: 'rejected',
      detail: 'idempotency key must be 1-256 visible ASCII characters',
    };
  }

  const payload: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html,
    ...(isValidEmail(input.replyTo) ? { reply_to: [input.replyTo] } : {}),
  };

  let last = await postOnce(apiKey, payload, idempotencyKey);
  if (!last.ok && last.retryable) {
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 500)));
    last = await postOnce(apiKey, payload, idempotencyKey);
  }

  if (last.ok) return { delivered: true, providerMessageId: last.id };

  const reason = last.detail.startsWith('timeout:')
    ? 'timeout'
    : /^\d{3}\s/u.test(last.detail)
      ? 'rejected'
      : 'network';
  return { delivered: false, reason, detail: last.detail.slice(0, 500) };
}

export type BulkRecipientOutcome = {
  to: string;
  attempt: number;
} & (
  | { delivered: true; providerMessageId: string | null }
  | { delivered: false; reason: SendEmailFailureReason; detail: string }
);

export interface SendBulkEmailInput {
  from: string;
  recipients: readonly string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  campaignId: string;
  maxPerSecond?: number;
  onOutcome?: (outcome: BulkRecipientOutcome) => void | Promise<void>;
}

export interface SendBulkEmailResult {
  campaignId: string;
  attempted: number;
  delivered: number;
  failed: number;
  outcomes: BulkRecipientOutcome[];
}

const CAMPAIGN_ID_RE = /^[\x21-\x7e]{1,128}$/u;
const DEFAULT_SENDS_PER_SECOND = 2;
const MAX_SENDS_PER_SECOND = 10;

function normalizeRecipients(recipients: readonly string[]): { to: string; key: string }[] {
  const seen = new Set<string>();
  const ordered: { to: string; key: string }[] = [];
  for (const raw of recipients) {
    const to = typeof raw === 'string' ? raw.trim() : '';
    if (!to) continue;
    const key = to.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ to, key });
  }
  return ordered;
}

async function recipientIdempotencyKey(campaignId: string, recipientKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recipientKey));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${campaignId}:${hex.slice(0, 32)}`;
}

/**
 * Mass notification for an arbitrary recipient list (DPDP §5 individual
 * intimation). Sends are sequential and throttled because Resend rate-limits
 * per second and a 429 storm loses notices; a per-recipient failure is recorded
 * and the run continues, so one bad address cannot silently truncate the list.
 * Idempotency keys are derived from `campaignId` + recipient, so re-running the
 * same campaign after a partial failure does not double-send.
 */
export async function sendBulkTransactionalEmail(
  input: SendBulkEmailInput,
): Promise<SendBulkEmailResult> {
  const campaignId = input.campaignId.trim();
  const outcomes: BulkRecipientOutcome[] = [];
  const result = (): SendBulkEmailResult => ({
    campaignId,
    attempted: outcomes.length,
    delivered: outcomes.filter((outcome) => outcome.delivered).length,
    failed: outcomes.filter((outcome) => !outcome.delivered).length,
    outcomes,
  });

  const recipients = normalizeRecipients(input.recipients);

  if (!CAMPAIGN_ID_RE.test(campaignId) || !isValidEmail(input.from)) {
    const detail = !CAMPAIGN_ID_RE.test(campaignId)
      ? 'campaignId must be 1-128 visible ASCII characters'
      : 'a valid sender address is required';
    for (const { to } of recipients) {
      outcomes.push({ to, attempt: 0, delivered: false, reason: 'not_configured', detail });
    }
    logger.error({ campaignId, detail }, 'Bulk notification refused before sending');
    return result();
  }

  const perSecond = Math.min(
    MAX_SENDS_PER_SECOND,
    Math.max(1, Math.floor(input.maxPerSecond ?? DEFAULT_SENDS_PER_SECOND)),
  );
  const minIntervalMs = Math.ceil(1000 / perSecond);

  let index = 0;
  for (const { to, key } of recipients) {
    index += 1;
    if (index > 1) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs));
    }

    const sent = await sendTransactionalEmail({
      from: input.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
      idempotencyKey: await recipientIdempotencyKey(campaignId, key),
    });

    const outcome: BulkRecipientOutcome = sent.delivered
      ? { to, attempt: index, delivered: true, providerMessageId: sent.providerMessageId }
      : { to, attempt: index, delivered: false, reason: sent.reason, detail: sent.detail };
    outcomes.push(outcome);

    if (!outcome.delivered) {
      logger.error(
        { campaignId, reason: outcome.reason, detail: outcome.detail },
        'Bulk notification recipient not reached',
      );
    }
    await input.onOutcome?.(outcome);
  }

  const summary = result();
  logger.info(
    {
      campaignId,
      attempted: summary.attempted,
      delivered: summary.delivered,
      failed: summary.failed,
    },
    'Bulk notification run finished',
  );
  return summary;
}

export async function sendSupportEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = getHandoffConfig();

  if (!config.resendApiKey || !config.emailConfigured) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail:
        'RESEND_API_KEY and a valid AGI_SUPPORT_FROM_EMAIL/AGI_SUPPORT_FALLBACK_EMAIL are required',
    };
  }

  if (!isValidEmail(input.to)) {
    return {
      delivered: false,
      reason: 'invalid_recipient',
      detail: 'recipient is not a valid address',
    };
  }

  const result = await sendTransactionalEmail({ ...input, from: config.fromEmail });
  if (!result.delivered) {
    logger.error({ detail: result.detail }, 'Support escalation email failed to send');
  }
  return result;
}
