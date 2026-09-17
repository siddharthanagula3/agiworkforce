import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  isNotificationCategory,
  isNotificationSeverity,
  notificationTargetHref,
  type NotificationCategory,
  type NotificationFeedItem,
  type NotificationSeverity,
  type NotificationTarget,
} from '@/features/notifications/lib/notification-target';

const MAX_TITLE_CHARS = 200;
const MAX_MESSAGE_CHARS = 1000;
const MAX_DEDUPE_KEY_CHARS = 200;
export const DEFAULT_FEED_LIMIT = 30;
export const MAX_FEED_LIMIT = 100;

export interface NotificationInput {
  userId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  target?: NotificationTarget | null;
  dedupeKey?: string | null;
}

interface NotificationRow {
  id: string;
  category: string | null;
  type: string;
  title: string;
  message: string;
  target_kind: string | null;
  target_id: string | null;
  is_read: boolean;
  created_at: string | Date;
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function recordNotification(
  db: DatabaseAdapter,
  input: NotificationInput,
): Promise<{ recorded: boolean }> {
  const userId = input.userId?.trim();
  const title = clamp(input.title ?? '', MAX_TITLE_CHARS);
  const message = clamp(input.message ?? '', MAX_MESSAGE_CHARS);
  if (!userId || !title) return { recorded: false };

  const target =
    input.target && notificationTargetHref(input.target.kind, input.target.id)
      ? input.target
      : null;
  const dedupeKey = input.dedupeKey?.trim().slice(0, MAX_DEDUPE_KEY_CHARS) || null;

  try {
    const rows = await db.query<{ id: string }>(
      `insert into public.notifications
         (user_id, category, type, title, message, target_kind, target_id, dedupe_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
       returning id`,
      [
        userId,
        input.category,
        input.severity,
        title,
        message,
        target?.kind ?? null,
        target?.id ?? null,
        dedupeKey,
      ],
    );
    return { recorded: rows.length > 0 };
  } catch (error) {
    logger.warn(
      { error, userId, category: input.category },
      '[notifications] in-app notification could not be recorded',
    );
    return { recorded: false };
  }
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toFeedItem(row: NotificationRow): NotificationFeedItem {
  return {
    id: row.id,
    category: isNotificationCategory(row.category) ? row.category : 'general',
    severity: isNotificationSeverity(row.type) ? row.type : 'info',
    title: row.title,
    message: row.message,
    href: notificationTargetHref(row.target_kind, row.target_id),
    read: row.is_read,
    createdAt: toIso(row.created_at),
  };
}

export async function listNotifications(
  db: DatabaseAdapter,
  userId: string,
  options: { limit?: number; before?: string | null; unreadOnly?: boolean } = {},
): Promise<{ notifications: NotificationFeedItem[]; unreadCount: number }> {
  const limit = Math.min(
    MAX_FEED_LIMIT,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_FEED_LIMIT)),
  );
  const params: unknown[] = [userId];
  const clauses: string[] = [];
  if (options.before) {
    params.push(options.before);
    clauses.push(`and created_at < $${params.length}::timestamptz`);
  }
  if (options.unreadOnly) clauses.push('and is_read = false');
  params.push(limit);

  const [rows, counts] = await Promise.all([
    db.query<NotificationRow>(
      `select id, category, type, title, message, target_kind, target_id, is_read, created_at
         from public.notifications
        where user_id = $1
          ${clauses.join('\n          ')}
        order by created_at desc, id desc
        limit $${params.length}`,
      params,
    ),
    db.query<{ unread: number | string }>(
      `select count(*) as unread
         from public.notifications
        where user_id = $1 and is_read = false`,
      [userId],
    ),
  ]);

  return {
    notifications: rows.map(toFeedItem),
    unreadCount: Number(counts[0]?.unread ?? 0),
  };
}

export async function markNotificationsRead(
  db: DatabaseAdapter,
  userId: string,
  selection: { ids: readonly string[] } | { all: true },
): Promise<number> {
  if ('all' in selection) {
    const rows = await db.query<{ id: string }>(
      `update public.notifications
          set is_read = true, read_at = now()
        where user_id = $1 and is_read = false
        returning id`,
      [userId],
    );
    return rows.length;
  }
  if (selection.ids.length === 0) return 0;
  const rows = await db.query<{ id: string }>(
    `update public.notifications
        set is_read = true, read_at = now()
      where user_id = $1 and is_read = false and id = any($2::uuid[])
      returning id`,
    [userId, [...selection.ids]],
  );
  return rows.length;
}
