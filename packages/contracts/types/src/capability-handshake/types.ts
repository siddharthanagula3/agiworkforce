/**
 * Server-authoritative effective-capability handshake — the six-app-report
 * finding A contract: "no effective-capability handshake" combining model
 * capabilities, tier policy, surface support, and user settings into one
 * session-scoped document a task's MANDATORY requirements can be checked
 * against without any layer silently downgrading the result.
 *
 * Deliberately named `capability-handshake/`, NOT `capabilities/` — the
 * sibling flat file `../capabilities.ts` already owns that module path (the
 * PLATFORM capability matrix: which surface exposes which product
 * capability). A same-named `capabilities/` directory next to
 * `capabilities.ts` would make `./capabilities` resolve ambiguously for
 * every future import; this module composes with that file instead of
 * colliding with it.
 *
 * ## The single-vocabulary decision
 *
 * All four policy layers below grant or omit capabilities over the SAME
 * closed vocabulary: `PlatformCapability` from `../capabilities`. This is
 * deliberate, not a simplification of convenience. The repo already has
 * THREE different capability enumerations at different layers:
 *   - `PlatformCapability` (`../capabilities`) — surface/product capability.
 *   - `IntrinsicCapability` (`@agiworkforce/routing`, package-local) — model
 *     modality/feature flags (`reasoning`, `functionCalling`, ...).
 *   - `ModelCapabilities` (`../model-catalog`) — curated per-model booleans
 *     (`vision`, `codeExecution`, ...).
 * Composing a registry that intersects sets drawn from DIFFERENT
 * vocabularies is not merely awkward — it silently corrupts the result: a
 * capability granted only in `IntrinsicCapability` terms (e.g. `reasoning`)
 * would read as denied-by-omission by a `PlatformCapability`-only layer that
 * never had an opinion on it, producing a spurious rejection that looks
 * identical to a real one. That is a capability-HONESTY bug (false denial is
 * as dishonest as false grant), not a type-safety nit.
 *
 * The fix is a single shared vocabulary, not per-layer bookkeeping of "which
 * ids did this layer even consider." `PlatformCapability` is the anchor
 * because it is already the platform's single source of truth for
 * user-facing capability gating and already lives in this package (no
 * cross-package cycle risk — `@agiworkforce/routing` depends on
 * `@agiworkforce/types`, never the reverse).
 *
 * Mapping MODEL-intrinsic capabilities (`IntrinsicCapability`,
 * `ModelCapabilities`) onto this shared `PlatformCapability` vocabulary
 * (e.g. "a model needs `functionCalling` + `imageInput` to power
 * `canUseWebSearch` with vision-grounded queries") is the CALLER's job at
 * the handshake call site (stage 2 — web `/api/me`-adjacent route, VS
 * Code/CLI app-server, mobile gate stack) — this module only composes
 * already-normalized per-layer grants. It never reads a model registry, a
 * tier table, or a settings store itself.
 *
 * Omission from a layer's `granted` set means that layer DENIES the
 * capability. Fail-closed, matching the repo's existing egress-guard and
 * generated-file trust-boundary posture (`../suite-contracts`
 * `validateGeneratedFileTrustBoundary`, `apps/desktop/src/lib/egressGuard.ts`
 * `isPrivateTrustBoundary`) — an unreadable or silent layer must never read
 * as a grant.
 *
 * @module capability-handshake/types
 */

import type { PlatformCapability } from '../capabilities';

export type { PlatformCapability };

export type CapabilityLayer = 'model' | 'tier' | 'surface' | 'settings';

export const CAPABILITY_LAYERS = [
  'model',
  'tier',
  'surface',
  'settings',
] as const satisfies readonly CapabilityLayer[];

export function isCapabilityLayer(value: string): value is CapabilityLayer {
  return (CAPABILITY_LAYERS as readonly string[]).includes(value);
}

export interface CapabilityLayerGrant {
  layer: CapabilityLayer;
  sourceId: string;
  granted: ReadonlySet<PlatformCapability>;
}

export interface CapabilityDocumentRef {
  sessionId: string;
  version: string;
  computedAt: string;
}

export const CAPABILITY_LIMIT_WINDOWS = [
  'day',
  'month',
  'billing_period',
  'rolling_five_hour',
  'rolling_weekly',
] as const;

export type CapabilityLimitWindow = (typeof CAPABILITY_LIMIT_WINDOWS)[number];

export const CAPABILITY_LIMIT_UNITS = [
  'tokens',
  'messages',
  'images',
  'video_seconds',
  'voice_minutes',
  'usage_cents',
] as const;

export type CapabilityLimitUnit = (typeof CAPABILITY_LIMIT_UNITS)[number];

export interface CapabilityLimit {
  id: string;
  capabilityId: PlatformCapability | null;
  limit: number | null;
  unit: CapabilityLimitUnit;
  window: CapabilityLimitWindow;
  resetsAt: string | null;
  policySource: string;
}

export interface EffectiveCapabilityDocument extends CapabilityDocumentRef {
  sources: Readonly<Record<CapabilityLayer, string>>;
  granted: readonly PlatformCapability[];
  deniedBy: Readonly<Partial<Record<PlatformCapability, readonly CapabilityLayer[]>>>;
  limits: readonly CapabilityLimit[];
}
