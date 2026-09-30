import { z } from 'zod';

export const MOBILE_PUSH_TOKEN_PATH = '/api/mobile/push-token';

const MAX_PREFERENCE_KEYS = 64;

const PreferenceFlagsSchema = z
  .record(z.string().min(1).max(64), z.boolean())
  .refine((value) => Object.keys(value).length <= MAX_PREFERENCE_KEYS, 'too many entries');

export const MobilePushQuietHoursSchema = z.object({
  enabled: z.boolean(),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  timezone: z.string().min(1).max(100),
});

export const MobilePushPreferencesSchema = z.object({
  version: z.number().int().positive(),
  timezone: z.string().min(1).max(100),
  categories: PreferenceFlagsSchema,
  eventTypes: PreferenceFlagsSchema,
  quietHours: MobilePushQuietHoursSchema,
  quietHoursExemptEventTypes: z
    .array(z.string().min(1).max(64))
    .max(MAX_PREFERENCE_KEYS)
    .optional(),
  updatedAt: z.string().max(40).optional(),
});
export type MobilePushPreferences = z.infer<typeof MobilePushPreferencesSchema>;

export function mobilePushWantsEvent(
  preferences: MobilePushPreferences,
  eventType: string | undefined,
): boolean {
  if (!eventType) return true;
  return preferences.eventTypes[eventType] !== false;
}
