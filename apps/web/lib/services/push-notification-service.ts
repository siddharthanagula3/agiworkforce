import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TOKENS_PER_REQUEST = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDeliveryResult {
  sent: number;
  invalidated: number;
  error?: string;
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

export async function getPushTokensForUser(userId: string): Promise<string[]> {
  const rows = await getNeonDb().query<{ push_token: string }>(
    `select push_token
       from public.mobile_devices
      where user_id = $1
        and push_token is not null
        and push_token <> ''`,
    [userId],
  );
  return rows.map((row) => row.push_token).filter(isExpoPushToken);
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

export async function sendPushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushDeliveryResult> {
  let tokens: string[];
  try {
    tokens = await getPushTokensForUser(userId);
  } catch (error) {
    logger.warn({ error, userId }, '[push] could not load device tokens');
    return { sent: 0, invalidated: 0, error: 'token_lookup_failed' };
  }

  if (tokens.length === 0) return { sent: 0, invalidated: 0 };

  let sent = 0;
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
    } finally {
      clearTimeout(timeout);
    }
  }

  await invalidateTokens(invalid);
  return { sent, invalidated: invalid.length };
}
