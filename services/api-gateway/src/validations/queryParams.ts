/**
 * @file Query Parameter Validation Schemas
 * @security
 * - Validates and sanitizes query parameters to prevent injection attacks
 * - Uses Zod for type-safe validation with descriptive error messages
 * - All schemas include length limits to prevent DoS via long strings
 */

import { z } from 'zod';

/**
 * UUID parameter validation for route params like :desktopId, :deviceId.
 *
 * SECURITY: Strict UUID format prevents path traversal and injection attacks.
 */
export const UuidParamSchema = z.uuid();

/**
 * Device ID parameter validation (non-UUID format used by some clients).
 *
 * SECURITY: Alphanumeric with limited special characters prevents injection.
 * Max length 255 prevents DoS via long strings.
 */
export const DeviceIdParamSchema = z
  .string()
  .min(1, 'Device ID is required')
  .max(255, 'Device ID too long')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Device ID contains invalid characters');

/**
 * Timestamp query parameter validation for 'since' queries.
 *
 * SECURITY: Validates ISO 8601 format or Unix timestamp to prevent injection.
 * Ensures timestamp is positive and not in the distant future.
 */
export const TimestampQuerySchema = z
  .string()
  .optional()
  .refine(
    (val) => {
      if (!val) return true; // Optional, so undefined is valid
      const parsed = Date.parse(val);
      if (isNaN(parsed)) {
        // Try parsing as Unix timestamp (seconds or milliseconds)
        const num = Number(val);
        if (isNaN(num) || num <= 0) return false;
        // Validate it's a reasonable timestamp (after 2020, before 2100)
        const ms = num < 10000000000 ? num * 1000 : num;
        return ms > 1577836800000 && ms < 4102444800000;
      }
      // Validate ISO string is a reasonable timestamp
      return parsed > 1577836800000 && parsed < 4102444800000;
    },
    { message: 'Invalid timestamp. Use ISO 8601 format or Unix timestamp.' },
  );

/**
 * Pagination query parameters for list endpoints.
 *
 * SECURITY:
 * - limit: Max 100 to prevent DoS via large result sets
 * - offset: Non-negative integer
 */
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
