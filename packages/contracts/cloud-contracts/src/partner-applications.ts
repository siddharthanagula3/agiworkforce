import { z } from 'zod';

export const PARTNER_APPLICATION_PATH = '/api/partners/apply';

export const PARTNER_APPLICATION_KINDS = ['integration', 'delivery', 'runtime', 'other'] as const;

export type PartnerApplicationKind = (typeof PARTNER_APPLICATION_KINDS)[number];

export const PARTNER_APPLICATION_KIND_LABELS: Readonly<Record<PartnerApplicationKind, string>> = {
  integration: 'An integration, MCP server or plugin',
  delivery: 'Implementation or delivery for clients',
  runtime: 'A local runtime or model ecosystem',
  other: 'Something else',
};

export const PARTNER_APPLICATION_MAX_MESSAGE_LENGTH = 3_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const PartnerApplicationRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().min(1).max(160),
  website: optionalText(300),
  kind: z.enum(PARTNER_APPLICATION_KINDS),
  message: z.string().trim().min(20).max(PARTNER_APPLICATION_MAX_MESSAGE_LENGTH),
});

export type PartnerApplicationRequest = z.input<typeof PartnerApplicationRequestSchema>;

export const PartnerApplicationResponseSchema = z.object({
  reference: z.string().min(1),
});

export type PartnerApplicationResponse = z.infer<typeof PartnerApplicationResponseSchema>;
