import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { AppNotification, NotificationType } from '@/types/saas';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export class NotificationService {
  /**
   * Send a notification to a user
   */
  static async send(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = 'info',
    link?: string,
  ): Promise<void> {
    const supabase = getSupabaseClient();

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
   * Get user's notifications
   */
  static async getUserNotifications(
    userId: string,
    unreadOnly = false,
  ): Promise<AppNotification[]> {
    const supabase = getSupabaseClient();

    let query = supabase
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
   * Mark as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
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
   * Mark all as read
   */
  static async markAllAsRead(userId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId);

    if (error) {
      logger.error({ error, userId }, 'Failed to mark all notifications as read');
      throw error;
    }
  }
}
