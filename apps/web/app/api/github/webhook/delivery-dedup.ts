import 'server-only';

import { logger } from '@/lib/logger';

/**
 * GitHub webhook delivery replay protection (migration 0106).
 *
 * GitHub retries deliveries and operators can redeliver manually; both carry
 * the same `X-GitHub-Delivery` id with a valid HMAC. The unique constraint on
 * `github_webhook_deliveries.delivery_id` is the arbiter: exactly one request
 * per delivery id observes `first`; every replay observes `duplicate`.
 *
 * Failure policy: `unavailable` (Neon outage, missing header) fails OPEN —
 * processing continues without replay protection for that request. The
 * downstream review pipeline keeps its own debounce, and dropping legitimate
 * webhooks on a transient DB error would be strictly worse.
 */

export interface DeliveryDedupDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface DeliveryDescriptor {
  deliveryId: string | null;
  event: string;
  action: string | null;
  installationId: number | null;
}

export type DeliveryOutcome = 'first' | 'duplicate' | 'unavailable';

const MAX_DELIVERY_ID_LENGTH = 128;
const MAX_EVENT_LENGTH = 64;

export async function recordDeliveryOnce(
  db: DeliveryDedupDb,
  descriptor: DeliveryDescriptor,
): Promise<DeliveryOutcome> {
  const deliveryId = descriptor.deliveryId?.trim() ?? '';
  if (deliveryId === '' || deliveryId.length > MAX_DELIVERY_ID_LENGTH) {
    logger.warn(
      { deliveryIdLength: deliveryId.length, event: descriptor.event },
      'GitHub webhook without a usable delivery id · replay protection skipped',
    );
    return 'unavailable';
  }

  try {
    const rows = await db.query<{ id: string }>(
      `insert into github_webhook_deliveries (delivery_id, event, action, installation_id)
       values ($1, $2, $3, $4)
       on conflict (delivery_id) do nothing
       returning id`,
      [
        deliveryId,
        descriptor.event.slice(0, MAX_EVENT_LENGTH),
        descriptor.action ? descriptor.action.slice(0, MAX_EVENT_LENGTH) : null,
        descriptor.installationId,
      ],
    );
    return rows.length > 0 ? 'first' : 'duplicate';
  } catch (error) {
    logger.warn(
      { error, deliveryId, event: descriptor.event },
      'GitHub webhook delivery dedup unavailable · proceeding without replay protection',
    );
    return 'unavailable';
  }
}
