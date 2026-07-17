/**
 * Cloud contract — the server-authoritative capability handshake (six-app
 * report finding A). Wire schema for the `EffectiveCapabilityDocument` TS
 * contract owned by `@agiworkforce/types` (`capability-handshake/types.ts`):
 * the intersection of model, tier, surface, and settings policy layers for
 * one session.
 *
 * Contract rules:
 *   - This schema is the WIRE boundary; `@agiworkforce/types`
 *     `EffectiveCapabilityDocument` is the strict in-process TS contract.
 *     They are kept in sync by test
 *     (`__tests__/capability-handshake.test.ts`), not by `z.infer` in this
 *     file, because `@agiworkforce/types` cannot depend on `zod` (it is the
 *     lowest-level shared package; `cloud-contracts` depends on `types`,
 *     never the reverse).
 *   - `granted`/`deniedBy` keys are validated as `z.string()`, not a closed
 *     enum of `PlatformCapability` values. This mirrors the existing
 *     `me.ts` `MePlanSchema.tier: z.string()` precedent ("wire value;
 *     normalize client-side") for the same reason: the closed
 *     `PlatformCapability` union lives in `@agiworkforce/types` and evolves
 *     there; the wire boundary must tolerate a server that is a deploy
 *     ahead of an older client (forward-compat), so it stays loose and lets
 *     the TS type do the precise narrowing in-process.
 *   - `layer` values ARE validated as a closed enum (`CAPABILITY_LAYERS`,
 *     imported from `@agiworkforce/types` so the two stay in sync by
 *     construction) — the four policy layers are an architectural constant
 *     ("model ∩ tier ∩ surface ∩ settings"), not an open, growing set like
 *     capability ids.
 *   - Clients narrow (read a subset of fields); they never widen. A future
 *     server route serving this schema is the enforcement anchor once it
 *     exists — see `docs/plans/restructure-execution-program-2026-07-15.md`
 *     W5 stage 2 for the `/api/me`-adjacent handshake route this schema is
 *     designed for. Not wired to a live route in this stage.
 */

import { z } from 'zod';
import { CAPABILITY_LAYERS } from '@agiworkforce/types';

/** `/api/me`-adjacent handshake endpoint path (stage-2 wiring; not mounted yet). */
export const CAPABILITY_HANDSHAKE_PATH = '/api/me/capabilities';

export const CapabilityLayerSchema = z.enum(CAPABILITY_LAYERS);

export const EffectiveCapabilityDocumentSchema = z.object({
  sessionId: z.string().min(1),
  /** Monotonic per-session version/hash — bump on any input-layer change. */
  version: z.string().min(1),
  computedAt: z.string().min(1),
  sources: z.object({
    model: z.string(),
    tier: z.string(),
    surface: z.string(),
    settings: z.string(),
  }),
  /** Capability ids granted by all four layers. See module doc for why this is `z.string()`, not a closed enum. */
  granted: z.array(z.string()),
  /** Capability id -> the layers that withheld it. Only ids at least one layer mentioned appear here. */
  deniedBy: z.record(z.string(), z.array(CapabilityLayerSchema)),
});

export type EffectiveCapabilityDocumentWire = z.infer<typeof EffectiveCapabilityDocumentSchema>;

/**
 * Parse an untrusted capability-handshake payload. Throws `ZodError` on
 * contract mismatch — callers should treat a throw as "re-run the
 * handshake," never as "proceed with a partial/guessed document" (that
 * would reintroduce the silent-downgrade failure mode the handshake exists
 * to close).
 */
export function parseEffectiveCapabilityDocument(data: unknown): EffectiveCapabilityDocumentWire {
  return EffectiveCapabilityDocumentSchema.parse(data);
}
