import { z } from 'zod';

// Zod v4: Use top-level format validators for better performance
export const authenticatedUserSchema = z
  .object({
    userId: z.string().min(1),
    email: z.email().or(z.literal('')).optional().default(''),
  })
  .transform(({ userId, email }) => ({ userId, email }));

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

/**
 * req.user's real shape. `token` is NOT a JWT claim, so it can't live inside
 * authenticatedUserSchema (which validates the decoded payload) — it's the
 * raw, already-signature-verified bearer string attached separately by
 * authenticateToken (middleware/auth.ts). Required, not optional: every
 * request that reaches a route handler went through authenticateToken first,
 * which always sets it. Consumed by getUserScopedClient() (lib/neonClients.ts)
 * to bind Postgres RLS via NeonDatabaseAdapter.withUser(token).
 */
export type AuthenticatedRequestUser = AuthenticatedUser & { token: string };
