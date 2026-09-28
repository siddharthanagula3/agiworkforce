import 'server-only';

import { z } from 'zod';

import { createError } from '@/lib/errors';
import {
  DEVELOPER_WEBHOOK_EVENT_TYPES,
  isDeveloperWebhookEventType,
  type DeveloperWebhookEventType,
} from '@/lib/developer-api/webhook-events';

export const WEBHOOK_URL_MAX = 2048;
export const WEBHOOK_DESCRIPTION_MAX = 200;

const EventTypesSchema = z
  .array(z.string())
  .min(1)
  .max(DEVELOPER_WEBHOOK_EVENT_TYPES.length)
  .refine((types) => types.every(isDeveloperWebhookEventType))
  .refine((types) => new Set(types).size === types.length)
  .transform((types) => types as DeveloperWebhookEventType[]);

export const CreateWebhookSchema = z.object({
  url: z.string().trim().min(1).max(WEBHOOK_URL_MAX),
  description: z.string().trim().max(WEBHOOK_DESCRIPTION_MAX).nullish(),
  eventTypes: EventTypesSchema,
});

export const UpdateWebhookSchema = z
  .object({
    url: z.string().trim().min(1).max(WEBHOOK_URL_MAX).optional(),
    description: z.string().trim().max(WEBHOOK_DESCRIPTION_MAX).nullable().optional(),
    eventTypes: EventTypesSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined));

export const WEBHOOK_BODY_MESSAGE = `An endpoint needs an https URL of up to ${WEBHOOK_URL_MAX} characters, an optional description of up to ${WEBHOOK_DESCRIPTION_MAX}, and one or more of these events: ${DEVELOPER_WEBHOOK_EVENT_TYPES.join(', ')}.`;

const IdSchema = z.string().uuid();

export function readRouteId(value: string | undefined, notFound: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw createError.notFound(notFound);
  return parsed.data;
}
