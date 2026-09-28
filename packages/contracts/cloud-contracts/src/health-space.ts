import { z } from 'zod';

export const HEALTH_SPACE_PATH = '/api/health-space';

export const HEALTH_SPACE_UNAVAILABLE_REASONS = ['not_configured', 'region', 'workspace'] as const;
export const HealthSpaceUnavailableReasonSchema = z.enum(HEALTH_SPACE_UNAVAILABLE_REASONS);
export type HealthSpaceUnavailableReason = z.infer<typeof HealthSpaceUnavailableReasonSchema>;

export const HealthSpaceResponseSchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('unavailable'), reason: HealthSpaceUnavailableReasonSchema })
    .strict(),
  z.object({ status: z.literal('available'), projectId: z.string().uuid().nullable() }).strict(),
]);
export type HealthSpaceResponse = z.infer<typeof HealthSpaceResponseSchema>;

export function parseHealthSpaceResponse(value: unknown): HealthSpaceResponse | null {
  const parsed = HealthSpaceResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
