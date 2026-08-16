
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
