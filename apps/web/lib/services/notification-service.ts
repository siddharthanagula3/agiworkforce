/**
 * @file notification-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * SERVICE-CONTEXT methods:
 *   `send()` - System writes notifications (after Stripe events, etc.) where no
 *   user JWT is available. Uses `getServiceClient()` internally.
 *
 * USER-CONTEXT methods (`getUserNotifications`, `markAsRead`, `markAllAsRead`)
 *   accept a `client: SupabaseClient` parameter. Callers pass `getUserClient(jwt)`.
 *
 * Never add a private `getSupabaseClient()` here. See lib/services/README.md.
 */
import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { AppNotification, NotificationType } from '@/types/saas';

export class NotificationService {
  /**
   * Send a notification to a user.
   * SERVICE-CONTEXT: the server sends notifications to users; the notification
   * writer is the system, not the user themselves. No user JWT required for the
   * write. Service-role is appropriate here.
   */
  static async send(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = 'info',
    link?: string,
  ): Promise<void> {
    // SECURITY: service-role required because notifications are written by the system
    // (e.g., after a Stripe event) where no user JWT is available.
    const supabase = getServiceClient();

    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      link,
    });

    if (error) {
      logger.error({ error, userId }, 'Failed to send notification');
    }
  }

  /**
   * Get user's notifications.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only the
   * requesting user's notifications are returned.
   */
  static async getUserNotifications(
    client: SupabaseClient,
    userId: string,
    unreadOnly = false,
  ): Promise<AppNotification[]> {
    let query = client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch notifications');
      throw error;
    }

    return data as AppNotification[];
  }

  /**
   * Mark as read.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only the
   * requesting user can mark their own notifications as read.
   */
  static async markAsRead(
    client: SupabaseClient,
    notificationId: string,
    userId: string,
  ): Promise<void> {
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, notificationId }, 'Failed to mark notification as read');
      throw error;
    }
  }

  /**
   * Mark all as read.
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only the
   * requesting user's notifications are updated.
   */
  static async markAllAsRead(client: SupabaseClient, userId: string): Promise<void> {
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, userId }, 'Failed to mark all notifications as read');
      throw error;
    }
  }
}
