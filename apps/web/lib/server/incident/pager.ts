import 'server-only';

import { logger } from '@/lib/logger';

export const PAGER_WEBHOOK_ENV = 'PAGER_WEBHOOK_URL';
export const INCIDENT_CHANNEL_WEBHOOK_ENV = 'INCIDENT_CHANNEL_WEBHOOK_URL';

const PAGER_TIMEOUT_MS = 5_000;

export type AlertSeverity = 'critical' | 'warning';

export type PageOutcome = 'paged' | 'unconfigured' | 'failed';

export interface PageTarget {
  handle: string;
  email: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

export function alertHtml(text: string): string {
  return `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`;
}

async function post(
  webhook: string,
  payload: Readonly<Record<string, unknown>>,
  what: string,
): Promise<PageOutcome> {
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PAGER_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error({ status: response.status, what }, 'Incident webhook rejected the alert');
      return 'failed';
    }
    return 'paged';
  } catch (error) {
    logger.error({ error, what }, 'Incident webhook could not be reached');
    return 'failed';
  }
}

/**
 * Posts the alert to a pager webhook when one is configured. Email alone waits
 * for someone to read it; a health probe firing at 06:15 needs to wake a
 * person. Best-effort by design, a pager that is down must not stop the email
 * from going out, so this never throws.
 */
export async function pageOnCall(
  severity: AlertSeverity,
  subject: string,
  text: string,
  target?: PageTarget,
  source = 'health-probe',
): Promise<PageOutcome> {
  const webhook = process.env[PAGER_WEBHOOK_ENV];
  if (!webhook) return 'unconfigured';
  return post(
    webhook,
    { severity, subject, text, source, ...(target ? { target: target.handle } : {}) },
    'pager',
  );
}

/**
 * The shared channel an incident is worked in, so the second responder sees
 * the first one's context instead of a second copy of the alert.
 */
export async function postToIncidentChannel(
  severity: AlertSeverity,
  subject: string,
  text: string,
  target?: PageTarget,
): Promise<PageOutcome> {
  const webhook = process.env[INCIDENT_CHANNEL_WEBHOOK_ENV];
  if (!webhook) return 'unconfigured';
  return post(
    webhook,
    {
      severity,
      subject,
      text: target ? `${text}\n\nOn call: ${target.handle}` : text,
      source: 'incident-channel',
    },
    'incident channel',
  );
}
