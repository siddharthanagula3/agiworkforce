import { z } from 'zod';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_SEVERITIES } from '@agiworkforce/types';

export const NOTIFICATIONS_PATH = '/api/notifications';
export const NOTIFICATION_FEED_MAX_LIMIT = 100;

export const NotificationFeedItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(NOTIFICATION_CATEGORIES),
  severity: z.enum(NOTIFICATION_SEVERITIES),
  title: z.string(),
  message: z.string(),
  href: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationFeedItemWire = z.infer<typeof NotificationFeedItemSchema>;

export const NotificationFeedResponseSchema = z.object({
  notifications: z.array(NotificationFeedItemSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationFeedResponseWire = z.infer<typeof NotificationFeedResponseSchema>;

export const NotificationMarkReadRequestSchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(NOTIFICATION_FEED_MAX_LIMIT) }).strict(),
]);
export type NotificationMarkReadRequest = z.infer<typeof NotificationMarkReadRequestSchema>;

export const NotificationMarkReadResponseSchema = z.object({
  updated: z.number().int().nonnegative(),
});
export type NotificationMarkReadResponse = z.infer<typeof NotificationMarkReadResponseSchema>;
