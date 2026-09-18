import 'server-only';

import { logger } from '@/lib/logger';

import type { AlertSeverity, PageOutcome, PageTarget } from './pager';

export const OUT_OF_BAND_WEBHOOK_ENV = 'INCIDENT_OUT_OF_BAND_WEBHOOK_URL';
export const OUT_OF_BAND_TOKEN_ENV = 'INCIDENT_OUT_OF_BAND_TOKEN';
export const STATUS_MIRROR_URL_ENV = 'AGI_STATUS_MIRROR_URL';
export const STATUS_MIRROR_WRITE_URL_ENV = 'AGI_STATUS_MIRROR_WRITE_URL';
export const STATUS_MIRROR_TOKEN_ENV = 'AGI_STATUS_MIRROR_TOKEN';

const OUT_OF_BAND_TIMEOUT_MS = 5_000;

export type MirrorOutcome = 'published' | 'unconfigured' | 'failed';

export interface StatusMirrorSnapshot {
  publishedAt: string;
  status: 'operational' | 'degraded' | 'disrupted';
  headline: string;
  detail?: string;
}

async function send(
  url: string,
  init: RequestInit,
  what: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(OUT_OF_BAND_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error({ status: response.status, what }, 'Out-of-band incident transport rejected it');
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ error, what }, 'Out-of-band incident transport could not be reached');
    return false;
  }
}

/**
 * The path that does not go through the email vendor. It exists because every
 * other channel shares a dependency with the thing that is down: email is one
 * SaaS, and the pager and the channel webhook are reached by the same app
 * whose outage is being reported.
 */
export async function sendOutOfBandAlert(
  input: {
    severity: AlertSeverity;
    subject: string;
    text: string;
    target?: PageTarget | undefined;
    source: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PageOutcome> {
  const webhook = process.env[OUT_OF_BAND_WEBHOOK_ENV];
  if (!webhook) return 'unconfigured';
  const token = process.env[OUT_OF_BAND_TOKEN_ENV];
  const delivered = await send(
    webhook,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        severity: input.severity,
        subject: input.subject,
        text: input.text,
        source: input.source,
        ...(input.target ? { target: input.target.handle } : {}),
      }),
    },
    'out-of-band',
    fetchImpl,
  );
  return delivered ? 'paged' : 'failed';
}

/** Where a user reads status when this application cannot serve a page at all. */
export function statusMirrorUrl(): string | undefined {
  return process.env[STATUS_MIRROR_URL_ENV]?.trim() || undefined;
}

/**
 * Pushes the current state to an origin this deployment does not serve. A
 * status page hosted by the app it reports on says nothing during the outage it
 * exists for.
 */
export async function publishStatusMirror(
  snapshot: StatusMirrorSnapshot,
  fetchImpl: typeof fetch = fetch,
): Promise<MirrorOutcome> {
  const target = process.env[STATUS_MIRROR_WRITE_URL_ENV]?.trim();
  if (!target) return 'unconfigured';
  const token = process.env[STATUS_MIRROR_TOKEN_ENV];
  const published = await send(
    target,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(snapshot),
    },
    'status-mirror',
    fetchImpl,
  );
  return published ? 'published' : 'failed';
}
