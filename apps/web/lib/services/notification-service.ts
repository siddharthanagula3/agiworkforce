import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { NotificationRow } from '@/lib/server/neon-types';
import { AppNotification, NotificationType } from '@shared/types/saas';

export class NotificationService {
  static async send(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = 'info',
    link?: string,
  ): Promise<void> {
    const db = getNeonDb();

    try {
      await db.execute(
        `insert into notifications (user_id, title, message, type, link)
         values ($1, $2, $3, $4, $5)`,
        [userId, title, message, type, link ?? null],
      );
    } catch (error) {
      logger.error({ error, userId }, 'Failed to send notification');
    }
  }

  static async getUserNotifications(
    db: DatabaseAdapter,
    userId: string,
    unreadOnly = false,
  ): Promise<AppNotification[]> {
    const sql = unreadOnly
      ? `select * from notifications where user_id = $1 and is_read = false
         order by created_at desc limit 20`
      : `select * from notifications where user_id = $1
         order by created_at desc limit 20`;

    const rows = await db.query<NotificationRow>(sql, [userId]);

    if (!rows) {
      logger.error({ userId }, 'Failed to fetch notifications');
      throw new Error('Failed to fetch notifications');
    }

    return rows as unknown as AppNotification[];
  }

  static async markAsRead(
    db: DatabaseAdapter,
    notificationId: string,
    userId: string,
  ): Promise<void> {
    try {
      await db.execute(`update notifications set is_read = true where id = $1 and user_id = $2`, [
        notificationId,
        userId,
      ]);
    } catch (error) {
      logger.error({ error, notificationId }, 'Failed to mark notification as read');
      throw error;
    }
  }

  static async markAllAsRead(db: DatabaseAdapter, userId: string): Promise<void> {
    try {
      await db.execute(`update notifications set is_read = true where user_id = $1`, [userId]);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to mark all notifications as read');
      throw error;
    }
  }
}
