import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const EVENT_TRIGGER_SIGNING_SECRET_ENV = 'EVENT_TRIGGER_SIGNING_SECRET';
export const SLACK_SIGNING_SECRET_ENV = 'SLACK_SIGNING_SECRET';
export const GMAIL_PUBSUB_AUDIENCE_ENV = 'GMAIL_PUBSUB_AUDIENCE';
export const GMAIL_PUBSUB_SERVICE_ACCOUNT_ENV = 'GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL';
export const GOOGLE_CALENDAR_CHANNEL_SECRET_ENV = 'GOOGLE_CALENDAR_CHANNEL_SECRET';

export const SIGNATURE_WINDOW_SECONDS = 300;

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function derive(secret: string, label: string, value: string): string {
  return createHmac('sha256', secret).update(`${label}:${value}`).digest('hex');
}

export function verifySlackSignature(input: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  nowSeconds: number;
}): { ok: true } | { ok: false; reason: 'not_configured' | 'stale' | 'invalid' } {
  const secret = input.secret?.trim();
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!input.timestamp || !input.signature) return { ok: false, reason: 'invalid' };
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid' };
  if (Math.abs(input.nowSeconds - timestamp) > SIGNATURE_WINDOW_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const expected = `v0=${createHmac('sha256', secret)
    .update(`v0:${input.timestamp}:${input.body}`)
    .digest('hex')}`;
  return constantTimeEquals(expected, input.signature)
    ? { ok: true }
    : { ok: false, reason: 'invalid' };
}

export function connectorTriggerSecret(triggerId: string): string | null {
  const secret = process.env[EVENT_TRIGGER_SIGNING_SECRET_ENV]?.trim();
  if (!secret) return null;
  return derive(secret, 'connector-trigger', triggerId);
}

export function verifyConnectorTriggerSignature(input: {
  triggerId: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  nowSeconds: number;
}): { ok: true } | { ok: false; reason: 'not_configured' | 'stale' | 'invalid' } {
  const secret = connectorTriggerSecret(input.triggerId);
  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!input.timestamp || !input.signature) return { ok: false, reason: 'invalid' };
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid' };
  if (Math.abs(input.nowSeconds - timestamp) > SIGNATURE_WINDOW_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const expected = `sha256=${createHmac('sha256', secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest('hex')}`;
  return constantTimeEquals(expected, input.signature)
    ? { ok: true }
    : { ok: false, reason: 'invalid' };
}

export function googleCalendarChannelToken(channelId: string): string | null {
  const secret = process.env[GOOGLE_CALENDAR_CHANNEL_SECRET_ENV]?.trim();
  if (!secret) return null;
  return derive(secret, 'calendar-channel', channelId);
}

export function verifyGoogleCalendarChannelToken(
  channelId: string,
  token: string | null,
): { ok: true } | { ok: false; reason: 'not_configured' | 'invalid' } {
  const expected = googleCalendarChannelToken(channelId);
  if (!expected) return { ok: false, reason: 'not_configured' };
  if (!token || !constantTimeEquals(expected, token)) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

export function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
}
