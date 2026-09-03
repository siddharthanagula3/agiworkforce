import 'server-only';

import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import type { PushDeliveryResult, PushMessage } from './push-notification-service';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_SENDS = 10;
const NOTIFICATION_TTL_SECONDS = 3_600;
const URGENCY = 'normal';

const CURVE = 'prime256v1';
const PUBLIC_KEY_BYTES = 65;
const PRIVATE_KEY_BYTES = 32;
const AUTH_SECRET_BYTES = 16;
const SALT_BYTES = 16;
const CONTENT_ENCODING = 'aes128gcm';
const RECORD_SIZE = 4_096;
const RECORD_SIZE_FIELD_BYTES = 4;
const KEY_ID_LENGTH_FIELD_BYTES = 1;
const IKM_BYTES = 32;
const CEK_BYTES = 16;
const NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const HKDF_COUNTER = 0x01;
const INFO_TERMINATOR = 0x00;
const PAD_DELIMITER = 0x02;
const PAD_DELIMITER_BYTES = 1;
const JWT_LIFETIME_SECONDS = 12 * 60 * 60;

/** Statuses a push service returns for an endpoint that will never work again. */
const GONE_STATUSES = new Set([404, 410]);

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function decodeKeyMaterial(value: string, expectedBytes: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === expectedBytes ? decoded : null;
}

/**
 * A registration is only usable if the endpoint is an absolute https URL and
 * both key values decode to the exact sizes RFC 8291 fixes. Checking here means
 * a corrupted row is dropped locally instead of turning into a request that a
 * push service rejects on every future run.
 */
export function isDeliverableSubscription(subscription: WebPushSubscription): boolean {
  if (decodeKeyMaterial(subscription.p256dh, PUBLIC_KEY_BYTES) === null) return false;
  if (decodeKeyMaterial(subscription.auth, AUTH_SECRET_BYTES) === null) return false;
  try {
    return new URL(subscription.endpoint).protocol === 'https:';
  } catch {
    return false;
  }
}

interface VapidCredentials {
  publicKey: Buffer;
  privateKey: KeyObject;
  subject: string;
}

let credentials: VapidCredentials | null | undefined;

/**
 * The three names are spelled out as literals rather than reached through
 * exported constants so `scripts/env-doctor.mjs --check-examples` can see
 * them. Its source scanner matches only a literally-named read, and a key it
 * cannot see is a key that can be missing from every deployed environment
 * without any check going red.
 */
function readVapidCredentials(): VapidCredentials | null {
  if (credentials !== undefined) return credentials;

  const rawPublic = process.env['WEB_PUSH_VAPID_PUBLIC_KEY']?.trim();
  const rawPrivate = process.env['WEB_PUSH_VAPID_PRIVATE_KEY']?.trim();
  const subject = process.env['WEB_PUSH_VAPID_SUBJECT']?.trim();

  if (!rawPublic || !rawPrivate || !subject) {
    credentials = null;
    return credentials;
  }

  const publicKey = decodeKeyMaterial(rawPublic, PUBLIC_KEY_BYTES);
  const privateScalar = decodeKeyMaterial(rawPrivate, PRIVATE_KEY_BYTES);

  if (!publicKey || !privateScalar) {
    logger.warn(
      '[web-push] WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY are not a base64url P-256 pair; web delivery is off',
    );
    credentials = null;
    return credentials;
  }

  try {
    credentials = {
      publicKey,
      subject,
      privateKey: createPrivateKey({
        format: 'jwk',
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: base64UrlEncode(publicKey.subarray(1, 33)),
          y: base64UrlEncode(publicKey.subarray(33, PUBLIC_KEY_BYTES)),
          d: base64UrlEncode(privateScalar),
        },
      }),
    };
  } catch (error) {
    logger.warn({ error }, '[web-push] VAPID private key could not be imported');
    credentials = null;
  }
  return credentials;
}

export function resetWebPushCredentialCache(): void {
  credentials = undefined;
}

export function isWebPushConfigured(): boolean {
  return readVapidCredentials() !== null;
}

export function getWebPushPublicKey(): string | null {
  const configured = readVapidCredentials();
  return configured ? base64UrlEncode(configured.publicKey) : null;
}

function hmacSha256(key: Buffer, value: Buffer): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  return hmacSha256(prk, Buffer.concat([info, Buffer.from([HKDF_COUNTER])])).subarray(0, length);
}

function encodingInfo(label: string): Buffer {
  return Buffer.concat([
    Buffer.from(`Content-Encoding: ${label}`, 'utf8'),
    Buffer.from([INFO_TERMINATOR]),
  ]);
}

function encryptPayload(
  plaintext: Buffer,
  clientPublicKey: Buffer,
  clientAuthSecret: Buffer,
): Buffer {
  const ecdh = createECDH(CURVE);
  const serverPublicKey = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(clientPublicKey);

  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info', 'utf8'),
    Buffer.from([INFO_TERMINATOR]),
    clientPublicKey,
    serverPublicKey,
  ]);
  const inputKeyMaterial = hkdfExpand(
    hmacSha256(clientAuthSecret, sharedSecret),
    keyInfo,
    IKM_BYTES,
  );

  const salt = randomBytes(SALT_BYTES);
  const pseudoRandomKey = hmacSha256(salt, inputKeyMaterial);
  const contentKey = hkdfExpand(pseudoRandomKey, encodingInfo(CONTENT_ENCODING), CEK_BYTES);
  const nonce = hkdfExpand(pseudoRandomKey, encodingInfo('nonce'), NONCE_BYTES);

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([PAD_DELIMITER])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(SALT_BYTES + RECORD_SIZE_FIELD_BYTES + KEY_ID_LENGTH_FIELD_BYTES);
  salt.copy(header);
  header.writeUInt32BE(RECORD_SIZE, SALT_BYTES);
  header.writeUInt8(serverPublicKey.length, SALT_BYTES + RECORD_SIZE_FIELD_BYTES);

  return Buffer.concat([header, serverPublicKey, ciphertext]);
}

function vapidAuthorization(endpoint: string, vapid: VapidCredentials): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
  const claims = base64UrlEncode(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + JWT_LIFETIME_SECONDS,
        sub: vapid.subject,
      }),
      'utf8',
    ),
  );
  const signingInput = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: vapid.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${base64UrlEncode(vapid.publicKey)}`;
}

export async function getWebPushSubscriptionsForUser(
  userId: string,
): Promise<WebPushSubscription[]> {
  const rows = await getNeonDb().query<SubscriptionRow>(
    `select endpoint, p256dh, auth
       from public.web_push_subscriptions
      where user_id = $1`,
    [userId],
  );
  return rows
    .map((row) => ({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }))
    .filter(isDeliverableSubscription);
}

async function pruneSubscriptions(endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  try {
    await getNeonDb().execute(
      `delete from public.web_push_subscriptions
        where endpoint = any($1::text[])`,
      [endpoints],
    );
  } catch (error) {
    logger.warn({ error, count: endpoints.length }, '[web-push] failed to prune dead endpoints');
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

type DeliveryOutcome = 'sent' | 'gone' | 'failed';

async function deliverOne(
  subscription: WebPushSubscription,
  body: Buffer,
  vapid: VapidCredentials,
): Promise<DeliveryOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(subscription.endpoint, vapid),
        'Content-Encoding': CONTENT_ENCODING,
        'Content-Type': 'application/octet-stream',
        TTL: String(NOTIFICATION_TTL_SECONDS),
        Urgency: URGENCY,
      },
      body: new Uint8Array(body),
      signal: controller.signal,
    });

    if (response.ok) return 'sent';
    if (GONE_STATUSES.has(response.status)) return 'gone';
    logger.warn(
      { status: response.status, origin: new URL(subscription.endpoint).origin },
      '[web-push] push service rejected the notification',
    );
    return 'failed';
  } catch (error) {
    logger.warn({ error }, '[web-push] send failed');
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWebPushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushDeliveryResult> {
  const vapid = readVapidCredentials();
  if (!vapid) return { sent: 0, invalidated: 0 };

  let subscriptions: WebPushSubscription[];
  try {
    subscriptions = await getWebPushSubscriptionsForUser(userId);
  } catch (error) {
    logger.warn({ error, userId }, '[web-push] could not load subscriptions');
    return { sent: 0, invalidated: 0, error: 'subscription_lookup_failed' };
  }

  if (subscriptions.length === 0) return { sent: 0, invalidated: 0 };

  const plaintext = Buffer.from(
    JSON.stringify({
      title: message.title,
      body: message.body,
      ...(message.data ? { data: message.data } : {}),
    }),
    'utf8',
  );

  if (plaintext.length + PAD_DELIMITER_BYTES + GCM_TAG_BYTES > RECORD_SIZE) {
    logger.warn({ userId, bytes: plaintext.length }, '[web-push] payload exceeds one record');
    return { sent: 0, invalidated: 0, error: 'payload_too_large' };
  }

  let sent = 0;
  const gone: string[] = [];

  for (const batch of chunk(subscriptions, MAX_CONCURRENT_SENDS)) {
    const outcomes = await Promise.all(
      batch.map(async (subscription) => {
        try {
          const body = encryptPayload(
            plaintext,
            Buffer.from(subscription.p256dh, 'base64url'),
            Buffer.from(subscription.auth, 'base64url'),
          );
          return await deliverOne(subscription, body, vapid);
        } catch (error) {
          logger.warn({ error }, '[web-push] could not encrypt for a subscription');
          return 'failed' as DeliveryOutcome;
        }
      }),
    );

    outcomes.forEach((outcome, index) => {
      if (outcome === 'sent') {
        sent += 1;
        return;
      }
      if (outcome === 'gone') {
        const endpoint = batch[index]?.endpoint;
        if (endpoint) gone.push(endpoint);
      }
    });
  }

  await pruneSubscriptions(gone);
  return { sent, invalidated: gone.length };
}
