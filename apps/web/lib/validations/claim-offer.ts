import { z } from 'zod';

export const ClaimOfferRequestSchema = z.object({
  code: z
    .string()
    .min(1, 'Invite code is required')
    .max(50, 'Invite code must be 50 characters or less')
    .regex(
      /^[A-Za-z0-9]+$/,
      'Invalid invite code format. Codes must be alphanumeric and up to 50 characters.',
    )
    .transform((val) => val.trim().toUpperCase()),
});

export type ClaimOfferRequest = z.infer<typeof ClaimOfferRequestSchema>;
