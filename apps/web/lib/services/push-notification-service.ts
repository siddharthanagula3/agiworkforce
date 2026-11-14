import 'server-only';

import { randomUUID } from 'node:crypto';

import { enqueueJob } from '@/lib/jobs/job-service';
import { logger } from '@/lib/logger';
import { recordNotificationDelivery, type NotificationChannel } from '@/lib/observability/metrics';
import { getNeonDb } from '@/lib/server/neon-db';
import { sendWebPushToUser } from './web-push-service';
import { QuietHoursUnreadableError, heldByQuietHours } from './quiet-hours-service';
import {
  MobilePushPreferencesSchema,
  isOptInPushEvent,
  mobilePushWantsEvent,
} from '@agiworkforce/cloud-contracts';
import {
  isDateWithinQuietHours,
  isQuietHoursExemptNotification,
  normalizeTimeFocusPreferences,
} from '@agiworkforce/types';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TOKENS_PER_REQUEST = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  quietHoursType?: string;
}

export interface PushDeliveryResult {
  sent: number;
  invalidated: number;
  error?: string;
  deferred?: boolean;
  transportFailures?: number;
}

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token) || /^[a-f0-9-]{36}$/i.test(token);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function deviceAcceptsNotice(
  preferences: unknown,
  notificationType: string | undefined,
  now: Date,
  quietHoursType: string | undefined = notificationType,
): boolean {
  const optIn = isOptInPushEvent(notificationType);
  if (preferences === null || preferences === undefined) return !optIn;
  const parsed = MobilePushPreferencesSchema.safeParse(preferences);
  if (!parsed.success) return !optIn;
  if (!mobilePushWantsEvent(parsed.data, notificationType)) return false;
  if (isQuietHoursExemptNotification(quietHoursType)) return true;
  const { quietHours } = normalizeTimeFocusPreferences(
    { quietHours: parsed.data.quietHours },
    parsed.data.timezone,
  );
  return !isDateWithinQuietHours(now, quietHours);
}

export async function getPushTokensForUser(
  userId: string,
  notificationType?: string,
  now: Date = new Date(),
  quietHoursType: string | undefined = notificationType,
): Promise<string[]> {
  const rows = await getNeonDb().query<{ push_token: string; push_preferences: unknown }>(
    `select push_token, push_preferences
       from public.mobile_devices
      where user_id = $1
        and push_token is not null
        and push_token <> ''`,
    [userId],
  );
  return rows
    .filter((row) =>
      deviceAcceptsNotice(row.push_preferences, notificationType, now, quietHoursType),
    )
    .map((row) => row.push_token)
    .filter(isExpoPushToken);
}

async function invalidateTokens(tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await getNeonDb().execute(
      `update public.mobile_devices
          set push_token = null, updated_at = now()
        where push_token = any($1::text[])`,
      [tokens],
    );
  } catch (error) {
    logger.warn({ error, count: tokens.length }, '[push] failed to clear invalidated tokens');
  }
}

async function sendExpoPushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushDeliveryResult> {
  let tokens: string[];
  try {
    tokens = await getPushTokensForUser(
      userId,
      message.data?.['type'],
      new Date(),
      message.quietHoursType,
    );
  } catch (error) {
    logger.warn({ error, userId }, '[push] could not load device tokens');
    return { sent: 0, invalidated: 0, error: 'token_lookup_failed' };
  }

  if (tokens.length === 0) return { sent: 0, invalidated: 0 };

  let sent = 0;
  let transportFailures = 0;
  const invalid: string[] = [];

  for (const batch of chunk(tokens, MAX_TOKENS_PER_REQUEST)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            ...(message.data ? { data: message.data } : {}),
            sound: 'default',
          })),
        ),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn({ status: response.status, userId }, '[push] Expo rejected the batch');
        transportFailures += 1;
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          sent += 1;
          return;
        }
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = batch[index];
          if (token) invalid.push(token);
        }
      });
    } catch (error) {
      logger.warn({ error, userId }, '[push] send failed');
      transportFailures += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  await invalidateTokens(invalid);
  return {
    sent,
    invalidated: invalid.length,
    ...(transportFailures > 0 ? { transportFailures } : {}),
  };
}

const NO_DELIVERY: PushDeliveryResult = { sent: 0, invalidated: 0 };
const TRANSPORT_THREW: PushDeliveryResult = { sent: 0, invalidated: 0, transportFailures: 1 };

function recordPushDelivery(
  channel: NotificationChannel,
  attempted: boolean,
  result: PushDeliveryResult,
): void {
  if (!attempted) return;
  recordNotificationDelivery({ channel, outcome: 'delivered', count: result.sent });
  recordNotificationDelivery({
    channel,
    outcome: 'failed',
    reason: result.error ?? 'device_not_registered',
    count: result.invalidated + (result.error ? 1 : 0),
  });
}

async function settle(
  transport: string,
  delivery: Promise<PushDeliveryResult>,
): Promise<PushDeliveryResult> {
  try {
    return await delivery;
  } catch (error) {
    logger.warn({ error, transport }, '[push] transport threw instead of reporting');
    return TRANSPORT_THREW;
  }
}

/**
 * Which transports this notice is allowed to use.
 *
 * The two are consented to separately, the mobile app registers a device and
 * carries its own per-event preferences, a browser registers itself through
 * the settings toggle, so a caller that has checked one opt-in has not
 * checked the other and must say which one it checked.
 */
export interface PushTransports {
  expo?: boolean;
  web?: boolean;
}

/**
 * Fans one notice out to every permitted transport the account has registered.
 *
 * The transports are independent on purpose: a user with a phone and a browser
 * must still hear about the run when one of the two providers is down, so a
 * failure is folded into the returned counts rather than raised. An `error` is
 * reported only when a transport could not even look up its registrations.
 * an unconfigured transport is an absent one, not a failed delivery.
 */
export async function sendPushToUser(
  userId: string,
  message: PushMessage,
  transports: PushTransports = {},
): Promise<PushDeliveryResult> {
  const { expo: toExpo = true, web: toWeb = true } = transports;
  if (toExpo || toWeb) {
    try {
      if (await heldByQuietHours(getNeonDb(), userId, pushQuietHoursType(message))) {
        return NO_DELIVERY;
      }
    } catch (error) {
      if (!(error instanceof QuietHoursUnreadableError)) throw error;
      return deferUntilQuietHoursReadable(userId, message, { expo: toExpo, web: toWeb });
    }
  }
  return fanOutPush(userId, message, { expo: toExpo, web: toWeb });
}

function pushQuietHoursType(message: PushMessage): string | undefined {
  return message.quietHoursType ?? message.data?.['type'];
}

async function deferUntilQuietHoursReadable(
  userId: string,
  message: PushMessage,
  transports: Required<PushTransports>,
): Promise<PushDeliveryResult> {
  try {
    await enqueueJob(getNeonDb(), {
      kind: 'notifications.deferred-push',
      userId,
      idempotencyKey: `push-quiet-hours:${randomUUID()}`,
      payload: { message, transports },
    });
    return { sent: 0, invalidated: 0, deferred: true };
  } catch (error) {
    logger.error(
      { error, userId },
      '[push] could not queue a notice held for unreadable quiet hours',
    );
    return { sent: 0, invalidated: 0, error: 'quiet_hours_unreadable' };
  }
}

export async function resumeDeferredPush(
  userId: string,
  message: PushMessage,
  transports: Required<PushTransports>,
  isFinalAttempt: boolean,
): Promise<Record<string, unknown>> {
  try {
    if (await heldByQuietHours(getNeonDb(), userId, pushQuietHoursType(message))) {
      return { held: true };
    }
  } catch (error) {
    if (!(error instanceof QuietHoursUnreadableError) || !isFinalAttempt) throw error;
    logger.error(
      { error, userId },
      '[push] quiet hours stayed unreadable; the notice stays in the feed',
    );
    if (transports.expo) {
      recordNotificationDelivery({
        channel: 'push_expo',
        outcome: 'failed',
        reason: 'quiet_hours_unreadable_expired',
      });
    }
    if (transports.web) {
      recordNotificationDelivery({
        channel: 'push_web',
        outcome: 'failed',
        reason: 'quiet_hours_unreadable_expired',
      });
    }
    return { dropped: 'quiet_hours_unreadable' };
  }
  const result = await fanOutPush(userId, message, transports);
  return { ...result };
}

async function fanOutPush(
  userId: string,
  message: PushMessage,
  { expo: toExpo, web: toWeb }: Required<PushTransports>,
): Promise<PushDeliveryResult> {
  const [expo, web] = await Promise.all([
    toExpo ? settle('expo', sendExpoPushToUser(userId, message)) : NO_DELIVERY,
    toWeb ? settle('web', sendWebPushToUser(userId, message)) : NO_DELIVERY,
  ]);

  recordPushDelivery('push_expo', toExpo, expo);
  recordPushDelivery('push_web', toWeb, web);

  const error = expo.error ?? web.error;
  const transportFailures = (expo.transportFailures ?? 0) + (web.transportFailures ?? 0);
  return {
    sent: expo.sent + web.sent,
    invalidated: expo.invalidated + web.invalidated,
    ...(error ? { error } : {}),
    ...(transportFailures > 0 ? { transportFailures } : {}),
  };
}
