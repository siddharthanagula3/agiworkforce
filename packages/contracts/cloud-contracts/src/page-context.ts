import { z } from 'zod';

export const MANAGED_CLOUD_PAGE_READ_PATH = '/api/page-context/read';
export const WEB_PAGE_URL_MAX_LENGTH = 2_048;
export const MANAGED_CLOUD_PAGE_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
] as const;

export const ManagedCloudPageReadRequestSchema = z
  .object({
    url: z.string().trim().min(1).max(WEB_PAGE_URL_MAX_LENGTH),
  })
  .strict();

export const UrlFetchErrorCodeSchema = z.enum([
  'invalid_tool_input',
  'url_not_allowed',
  'url_not_accessible',
  'cancelled',
  'timeout',
  'response_too_large',
  'unsupported_content_type',
  'unreadable_document',
  'too_many_redirects',
]);
export type UrlFetchErrorCode = z.infer<typeof UrlFetchErrorCodeSchema>;

export const ManagedCloudPageReadResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    url: z.string(),
    title: z.string(),
    content: z.string(),
    truncated: z.boolean(),
    snippet: z.string().optional(),
    date: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), errorCode: UrlFetchErrorCodeSchema, error: z.string() }),
]);
export type ManagedCloudPageReadResponse = z.infer<typeof ManagedCloudPageReadResponseSchema>;
