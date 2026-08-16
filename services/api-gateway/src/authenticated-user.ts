import { z } from 'zod';

export const authenticatedUserSchema = z
  .object({
    userId: z.string().min(1),
    email: z.email().or(z.literal('')).optional().default(''),
  })
  .transform(({ userId, email }) => ({ userId, email }));

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export type CloudSurfaceClass = 'app' | 'developer';

export type AuthenticatedRequestUser = AuthenticatedUser & {
  token: string;
  surface: CloudSurfaceClass;
};
