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
 * Trusted surface class for a managed-cloud caller. Derived from the verified
 * token ISSUER (auth.ts `verifyGatewayOrClerkToken`), never from a caller
 * header: first-party gateway (device-authorization) tokens are the CLI/IDE
 * developer surfaces, and Clerk tokens are the first-party app surfaces
 * (desktop/mobile). Managed developer access requires Pro or higher
 * (`developer_surfaces`); app surfaces require `managed_chat`. Local/BYOK never
 * reach a managed gate, so this classification does not affect them.
 */
export type CloudSurfaceClass = 'app' | 'developer';

/**
 * req.user's real shape. `token` and `surface` are NOT validated JWT claims, so
 * they can't live inside authenticatedUserSchema (which validates the decoded
 * payload) — they are attached separately by authenticateToken
 * (middleware/auth.ts). Required, not optional: every request that reaches a
 * route handler went through authenticateToken first, which always sets them.
 * `token` is consumed by getUserScopedClient() (lib/neonClients.ts) to bind
 * Postgres RLS via NeonDatabaseAdapter.withUser(token).
 */
export type AuthenticatedRequestUser = AuthenticatedUser & {
  token: string;
  surface: CloudSurfaceClass;
};
