/**
 * License claims — the signed payload of an `.agilicense` file.
 *
 * Mirrors `docs/enterprise/enterprise-local-design.md` §2.1 exactly. The claims
 * are a plain JSON document; the `.agilicense` container (see `container.ts`)
 * wraps them with a detached Ed25519 signature.
 *
 * Design invariants encoded here:
 *   - `features[]` is an OPEN string array. This package deliberately does NOT
 *     enumerate product capability flags — the concrete flag list is a founder
 *     pricing/edition decision (design §4.1) populated out-of-band by the
 *     issuer. Verification treats them as opaque strings.
 *   - `edition` is the only closed enum (`team` | `enterprise`), per the design.
 *   - `issuedAt` / `expiresAt` are Unix epoch MILLISECONDS as integers. Integer
 *     epochs are chosen over ISO strings so the Rust `agiworkforce-licensing`
 *     crate can replay the same fixture corpus without date-parsing ambiguity.
 *   - `policyKeys[]` are base64-encoded 32-byte raw Ed25519 public keys that are
 *     authorized to sign org policy (design §2.2 — the license is the root of
 *     trust for policy).
 */

import { z } from 'zod';

/** License editions. The only closed enum in the claims (design §2.1). */
export const EditionSchema = z.enum(['team', 'enterprise']);
export type Edition = z.infer<typeof EditionSchema>;

/**
 * `LicenseClaims` — the exact claim set from design §2.1.
 *
 * Note on `features`/`edition`/`seats` VALUES: the mechanism is defined here,
 * but which features each edition grants, the seat semantics, and the price are
 * founder-gated (design §4). This schema validates SHAPE only; it never asserts
 * that any particular feature flag exists.
 */
export const LicenseClaimsSchema = z
  .object({
    /** Stable unique id for this issued license. */
    licenseId: z.string().min(1),
    /** Organization this license binds to (also binds org policy — see §2.2). */
    orgId: z.string().min(1),
    /** Human-readable org name for display in-app. */
    orgName: z.string().min(1),
    /** Closed enum per design. */
    edition: EditionSchema,
    /** Honor-count seat number (offline; not server-enforced — design §2.1). */
    seats: z.number().int().nonnegative(),
    /** Unix epoch milliseconds when the license was issued. */
    issuedAt: z.number().int(),
    /** Unix epoch milliseconds when the paid term ends (grace applies after). */
    expiresAt: z.number().int(),
    /** Extra days after `expiresAt` before enterprise features degrade. */
    graceDays: z.number().int().nonnegative(),
    /**
     * OPEN capability flags. Opaque strings — do not enumerate here. The
     * founder owns this list (design §4.1); verification never interprets them.
     */
    features: z.array(z.string()),
    /**
     * Base64-encoded 32-byte raw Ed25519 public keys authorized to sign org
     * policy for this org. The license is the root of trust for policy.
     */
    policyKeys: z.array(z.string()),
  })
  .strict();

export type LicenseClaims = z.infer<typeof LicenseClaimsSchema>;
