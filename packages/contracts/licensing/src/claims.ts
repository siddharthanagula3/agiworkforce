
import { z } from 'zod';

export const EditionSchema = z.enum(['team', 'enterprise']);
export type Edition = z.infer<typeof EditionSchema>;

export const LicenseClaimsSchema = z
  .object({
    licenseId: z.string().min(1),
    orgId: z.string().min(1),
    orgName: z.string().min(1),
    edition: EditionSchema,
    seats: z.number().int().nonnegative(),
    issuedAt: z.number().int(),
    expiresAt: z.number().int(),
    graceDays: z.number().int().nonnegative(),
    features: z.array(z.string()),
    policyKeys: z.array(z.string()),
  })
  .strict();

export type LicenseClaims = z.infer<typeof LicenseClaimsSchema>;
