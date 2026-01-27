import { z } from 'zod';

// Zod v4: Use top-level format validators for better performance
export const authenticatedUserSchema = z
  .object({
    userId: z.string().min(1),
    email: z.email(),
  })
  .transform(({ userId, email }) => ({ userId, email }));

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
