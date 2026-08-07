/**
 * @file resend-client.ts
 *
 * The repo's FIRST transactional email path.
 *
 * VERIFIED BEFORE WRITING THIS: there is no `resend` (or sendgrid/postmark/
 * nodemailer) dependency anywhere in this repo — `lib/services/organization-
 * invitation-service.ts` documents the same absence and ships copy-a-link
 * instead of sending mail. So this calls the Resend REST API over `fetch`
 * rather than adding an npm dependency (lockfile edits are blocked by the
 * repo's hooks anyway, and one HTTP POST does not justify an SDK).
 *
 * # It never throws into the request path
 *
 * A support escalation must not 500 because an email provider had a bad
 * minute. Every failure is returned as a typed value, and the caller downgrades
 * the response mode (`email` → `unavailable`) rather than losing the user's
 * escalation. The row is already persisted by then, so a human sweeping the
 * table can still find it.
 *
 * # SSRF surface: none
 *
 * `RESEND_ENDPOINT` is a module constant. No part of it is derived from a
 * request. The only user-influenced values are the recipient (`reply_to`, from a
 * validated email) and the body (redacted upstream by transcript.ts).
 */

import 'server-only';

import { logger } from '@/lib/logger';
import { getHandoffConfig, isValidEmail } from './config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

export type SendEmailResult =
  | { delivered: true; providerMessageId: string | null }
  | {
      delivered: false;
      reason: 'not_configured' | 'invalid_recipient' | 'rejected' | 'timeout' | 'network';
      detail: string;
    };

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** So a human can hit reply and reach the user. Half the async channel. */
  replyTo?: string;
}

/** `SendEmailInput` plus the sender identity, for callers outside support. */
export interface TransactionalEmailInput extends SendEmailInput {
  /** Verified sending address. Support and notifications use DIFFERENT ones. */
  from: string;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function postOnce(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; id: string | null } | { ok: false; retryable: boolean; detail: string }> {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        retryable: isRetryable(response.status),
        // Truncate: a provider error body is not a place to store an essay.
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

/**
 * The shared transport: one POST, one retry, one error taxonomy.
 *
 * Extracted so a second email channel does not copy this logic. Two divergent
 * senders is the same drift that produced two secret-pattern lists and three
 * keyboard-shortcut lists elsewhere in this repo — the copy always falls behind
 * on retries, timeouts, or truncation, and nobody notices until mail stops.
 *
 * The API KEY is shared (one Resend account); the FROM address is not, because
 * a product notification arriving from the support mailbox trains users to
 * reply to the wrong place and muddies deliverability reputation between an
 * address a human watches and one nobody does.
 */
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

  const payload: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html,
    ...(isValidEmail(input.replyTo) ? { reply_to: [input.replyTo] } : {}),
  };

  let last = await postOnce(apiKey, payload);
  if (!last.ok && last.retryable) {
    // One retry with jitter. More than one and a slow provider turns into a
    // hung request handler.
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 500)));
    last = await postOnce(apiKey, payload);
  }

  if (last.ok) return { delivered: true, providerMessageId: last.id };

  const reason = last.detail.startsWith('timeout:')
    ? 'timeout'
    : /^\d{3}\s/u.test(last.detail)
      ? 'rejected'
      : 'network';
  return { delivered: false, reason, detail: last.detail.slice(0, 500) };
}

export async function sendSupportEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = getHandoffConfig();

  if (!config.resendApiKey || !config.emailConfigured) {
    // Honest, not silent: the caller surfaces this to the user as "nothing was
    // sent", with a mailto fallback.
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
