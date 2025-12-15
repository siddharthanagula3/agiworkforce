import { z } from 'zod';

export const authenticatedUserSchema = z
  .object({
    userId: z.string().min(1),
    email: z.string().email(),
  })
  .transform(({ userId, email }) => ({ userId, email }));

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
