import 'server-only';

import { createHash } from 'node:crypto';

import { MOBILE_PRODUCT_UPDATE_EVENT_TYPE } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import { RELEASES, releaseSlug, type Release } from '@/lib/changelog-entries';
import { enqueueJob, PermanentJobError } from '@/lib/jobs/job-service';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { insertNotification, withdrawNotification } from './notification-service';
import { sendPushToUser, type PushDeliveryResult } from './push-notification-service';

export const PRODUCT_UPDATE_JOB_KIND = 'notifications.product-update';
export const PRODUCT_UPDATE_PAGE_SIZE = 20;
export const PRODUCT_UPDATE_PAGE_BUDGET_MS = 15_000;
const MAX_TITLE_CHARS = 120;
const MAX_RELEASE_SLUG_CHARS = 64;
const RELEASE_SLUG = /^[a-z0-9-]{1,64}$/;

export type ProductUpdateStart =
  | { status: 'started'; release: string; jobId: string }
  | { status: 'unknown_release' }
  | { status: 'already_announced'; release: string };

export interface ProductUpdatePageResult {
  release: string;
  considered: number;
  announced: number;
  pushed: number;
  next: string | null;
}

export function productUpdateDedupeKey(release: string): string {
  return `product-update:${release}`;
}

export function findAnnounceableRelease(slug: unknown): Release | null {
  if (typeof slug !== 'string' || slug.length > MAX_RELEASE_SLUG_CHARS) return null;
  if (!RELEASE_SLUG.test(slug)) return null;
  return RELEASES.find((release) => releaseSlug(release) === slug) ?? null;
}

const PUSH_BODY = 'Tap to read what is new.';

function announcementCopy(release: Release): { title: string; summary: string } {
  const headline = release.headline.trim();
  return {
    title:
      headline.length > MAX_TITLE_CHARS ? `${headline.slice(0, MAX_TITLE_CHARS - 1)}…` : headline,
    summary: release.body[0]?.trim() || PUSH_BODY,
  };
}

function pushNeverLeft(delivery: PushDeliveryResult | null): boolean {
  if (!delivery) return true;
  if (delivery.sent > 0 || delivery.deferred) return false;
  return delivery.error !== undefined || (delivery.transportFailures ?? 0) > 0;
}

export async function startProductUpdateAnnouncement(
  db: DatabaseAdapter,
  slug: unknown,
): Promise<ProductUpdateStart> {
  const release = findAnnounceableRelease(slug);
  if (!release) return { status: 'unknown_release' };
  const releaseId = releaseSlug(release);
  const job = await enqueueJob(db, {
    kind: PRODUCT_UPDATE_JOB_KIND,
    idempotencyKey: productUpdateDedupeKey(releaseId),
    payload: { release: releaseId, after: null },
  });
  if (!job.created) return { status: 'already_announced', release: releaseId };
  return { status: 'started', release: releaseId, jobId: job.id };
}

async function optedInAccounts(
  db: DatabaseAdapter,
  after: string | null,
  limit: number,
): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `select distinct device.user_id
       from public.mobile_devices device
      where device.push_token is not null
        and device.push_token <> ''
        and (device.push_preferences -> 'eventTypes' -> $1) = 'true'::jsonb
        and ($2::text is null or device.user_id > $2::text)
        and ${ownerMayRunUnattendedSql('device.user_id', 4)}
      order by device.user_id
      limit $3`,
    [MOBILE_PRODUCT_UPDATE_EVENT_TYPE, after, limit, UNATTENDED_RUN_DENIED_STATUSES],
  );
  return rows.map((row) => row.user_id);
}

function readCursor(payload: Record<string, unknown>): string | null {
  const after = payload['after'];
  if (after === null || after === undefined) return null;
  if (typeof after !== 'string' || !after.trim() || after.length > 255) {
    throw new PermanentJobError('Product update cursor is malformed');
  }
  return after;
}

export async function deliverProductUpdatePage(
  context: JobHandlerContext,
  now: () => number = Date.now,
): Promise<ProductUpdatePageResult> {
  const release = findAnnounceableRelease(context.job.payload['release']);
  if (!release) throw new PermanentJobError('Product update names no known release');
  const releaseId = releaseSlug(release);
  const after = readCursor(context.job.payload);
  const startedAt = now();
  const { title, summary } = announcementCopy(release);
  const dedupeKey = productUpdateDedupeKey(releaseId);

  const accounts = await optedInAccounts(context.db, after, PRODUCT_UPDATE_PAGE_SIZE + 1);
  const page = accounts.slice(0, PRODUCT_UPDATE_PAGE_SIZE);
  const result: ProductUpdatePageResult = {
    release: releaseId,
    considered: 0,
    announced: 0,
    pushed: 0,
    next: null,
  };

  let last: string | null = after;
  let unreached = 0;
  for (const userId of page) {
    if (context.signal.aborted) throw new Error('Product update page ran out of time');
    if (result.considered > 0 && now() - startedAt >= PRODUCT_UPDATE_PAGE_BUDGET_MS) break;
    result.considered += 1;
    const accountDb = createClaimedUserScopedDb(context.db, { userId, organizationId: null });
    const write = await insertNotification(accountDb, {
      userId,
      category: 'general',
      severity: 'info',
      title,
      message: summary,
      dedupeKey,
    });
    last = userId;
    if (write !== 'inserted') continue;

    const delivery = await pushAnnouncement(userId, title, releaseId);
    if (
      pushNeverLeft(delivery) &&
      !context.isFinalAttempt &&
      (await releaseForRetry(accountDb, userId, dedupeKey))
    ) {
      unreached += 1;
      continue;
    }
    result.announced += 1;
    result.pushed += delivery?.sent ?? 0;
  }

  const more = result.considered < page.length || accounts.length > PRODUCT_UPDATE_PAGE_SIZE;
  if (more && last !== null) {
    await enqueueJob(context.db, {
      kind: PRODUCT_UPDATE_JOB_KIND,
      idempotencyKey: `${dedupeKey}:after:${createHash('sha256').update(last).digest('hex').slice(0, 32)}`,
      payload: { release: releaseId, after: last },
    });
    result.next = last;
  }
  if (unreached > 0) {
    throw new Error(
      `Product update push did not leave for ${unreached} account(s); this page will run again for them`,
    );
  }
  return result;
}

async function pushAnnouncement(
  userId: string,
  title: string,
  release: string,
): Promise<PushDeliveryResult | null> {
  try {
    return await sendPushToUser(
      userId,
      { title, body: PUSH_BODY, data: { type: MOBILE_PRODUCT_UPDATE_EVENT_TYPE, release } },
      { expo: true, web: false },
    );
  } catch (error) {
    logger.warn({ error, userId, release }, '[notifications] product update push failed');
    return null;
  }
}

async function releaseForRetry(
  accountDb: DatabaseAdapter,
  userId: string,
  dedupeKey: string,
): Promise<boolean> {
  try {
    return await withdrawNotification(accountDb, userId, dedupeKey);
  } catch (error) {
    logger.error(
      { error, userId, dedupeKey },
      '[notifications] product update could not be released for another try; it stays in the list without a push',
    );
    return false;
  }
}
