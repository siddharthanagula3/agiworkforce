
import { z } from 'zod';

export const UuidParamSchema = z.uuid();

export const DeviceIdParamSchema = z
  .string()
  .min(1, 'Device ID is required')
  .max(255, 'Device ID too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Device ID contains invalid characters');

export const TimestampQuerySchema = z
  .string()
  .optional()
  .refine(
    (val) => {
      if (!val) return true;
      const parsed = Date.parse(val);
      if (isNaN(parsed)) {
        const num = Number(val);
        if (isNaN(num) || num <= 0) return false;
        const ms = num < 10000000000 ? num * 1000 : num;
        return ms > 1577836800000 && ms < 4102444800000;
      }
      return parsed > 1577836800000 && parsed < 4102444800000;
    },
    { message: 'Invalid timestamp. Use ISO 8601 format or Unix timestamp.' },
  );

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * Helper to validate route params and return typed result.
 *
 * @param params - Express req.params object
 * @param schema - Zod schema for validation
 * @returns Validated and typed params
 * @throws ZodError if validation fails
 */
export function validateParams<T extends z.ZodTypeAny>(
  params: Record<string, string>,
  schema: T,
): z.infer<T> {
  return schema.parse(params);
}

/**
 * Helper to validate query params and return typed result.
 *
 * @param query - Express req.query object
 * @param schema - Zod schema for validation
 * @returns Validated and typed query params
 * @throws ZodError if validation fails
 */
export function validateQuery<T extends z.ZodTypeAny>(
  query: Record<string, unknown>,
  schema: T,
): z.infer<T> {
  return schema.parse(query);
}
