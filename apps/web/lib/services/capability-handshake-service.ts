/**
 * @file capability-handshake-service.ts
 *
 * Builds the server-authoritative `EffectiveCapabilityDocument` (six-app
 * report finding A) for `GET /api/me` — the first real consumer of
 * `@agiworkforce/types` `capability-handshake/` (W5 discipline wave 1 stage
 * 2, `docs/plans/restructure-execution-program-2026-07-15.md`).
 *
 * Pure function: no DB access, no network I/O. Every input is either passed
 * in by the caller (tier, surface, the deployment E2B flag the route already
 * resolves) or read from the static model catalog. This intentionally does
 * NOT reuse `lib/services/README.md`'s `DatabaseAdapter` pattern — it has no
 * user-scoped query to make; the route resolves `subscription.plan_tier` via
 * the existing `SubscriptionService` and passes the primitive value in.
 *
 * ## Layer sourcing (real data only — no fabricated capabilities)
 *
 *   - `model`  — `@agiworkforce/types` `modelsCatalog` (the same
 *     `models.json` every surface already reads). A capability is granted
 *     only when at least one catalog model advertises it AND, for cloud
 *     execution specifically, the deployment's E2B loop is reachable (the
 *     SAME `e2bCutoverEnabled()` value `route.ts` already computes for
 *     `feature_flags.code_execution` — passed in, not re-resolved, so the
 *     two can never disagree).
 *   - `tier`   — `getTierPolicy(tier)` from `@agiworkforce/types`, the SAME
 *     entitlement source `route.ts` already calls via
 *     `canAccessManualModelSelection`. No new entitlement source invented.
 *   - `surface` — `getPlatformCapabilities(surface)`, the existing PLATFORM
 *     capability matrix (`../capabilities.ts`) — not a parallel vocabulary.
 *   - `settings` — no per-capability user-settings store exists for web
 *     today (checked: `profiles.routing_preferences` is a routing/geo
 *     preference, not a capability toggle; `useChatStream`'s
 *     `webSearchEnabled` is a per-turn composer choice, not a persisted
 *     account setting). Honest default: this layer imposes NO restriction
 *     (grants everything) rather than fabricating a denial with no backing
 *     data. Replace with a real per-capability read once such a store
 *     exists — see the module-level TODO below.
 *
 * Every layer starts from "grant everything" (`ALL_PLATFORM_CAPABILITIES`)
 * and SUBTRACTS only the specific ids it has real evidence to restrict. This
 * is deliberate: most `PlatformCapability` ids (`canChat`, `canUploadFiles`,
 * `canUseMarketplace`, ...) have no tier- or model-specific gate anywhere in
 * this codebase, and defaulting them to denied would be a capability-honesty
 * violation in the other direction (falsely claiming a restriction that does
 * not exist) — free users obviously can chat.
 *
 * TODO(web-settings): once a real per-capability user-settings store exists,
 * replace `buildSettingsLayerGrant` with a genuine read instead of the
 * grant-everything default.
 */
import 'server-only';

import {
  ALL_PLATFORM_CAPABILITIES,
  buildEffectiveCapabilityDocument,
  getPlatformCapabilities,
  getTierPolicy,
  modelsCatalog,
  type CapabilityLayerGrant,
  type EffectiveCapabilityDocument,
  type ModelCapabilities,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import type { EffectiveCapabilityDocumentWire } from '@agiworkforce/cloud-contracts';

type CatalogModelCapabilityKey = Extract<
  keyof ModelCapabilities,
  'search' | 'research' | 'codeExecution'
>;

/** True when at least one model in the (static, already-loaded) catalog advertises `key`. */
function catalogHasModelWithCapability(key: CatalogModelCapabilityKey): boolean {
  return Object.values(modelsCatalog.models).some((model) => model.capabilities[key] === true);
}

function allCapabilities(): Set<PlatformCapability> {
  return new Set<PlatformCapability>(ALL_PLATFORM_CAPABILITIES);
}

/** Model layer: what's technically possible given the current model fleet + deployment config — independent of this user's plan. */
function buildModelLayerGrant(cloudExecutionDeploymentEnabled: boolean): CapabilityLayerGrant {
  const granted = allCapabilities();
  if (!(cloudExecutionDeploymentEnabled && catalogHasModelWithCapability('codeExecution'))) {
    granted.delete('canUseCloudExecution');
  }
  if (!catalogHasModelWithCapability('search')) granted.delete('canUseWebSearch');
  if (!catalogHasModelWithCapability('research')) granted.delete('canUseDeepResearch');
  return { layer: 'model', sourceId: `models.json@${modelsCatalog.version}`, granted };
}

/** Tier layer: subtracts exactly the capabilities `TierPolicy` says this tier lacks. */
function buildTierLayerGrant(tier: string | null | undefined): CapabilityLayerGrant {
  const policy = getTierPolicy(tier);
  const granted = allCapabilities();
  if (!policy.allowSearch) granted.delete('canUseWebSearch');
  if (!policy.allowDeepResearch) granted.delete('canUseDeepResearch');
  if (!policy.allowVoice) granted.delete('canUseVoice');
  if (!policy.allowMCP) granted.delete('canUseConnectors');
  return { layer: 'tier', sourceId: `tier:${policy.tier}`, granted };
}

/** Surface layer: literally the existing platform capability matrix, not a fork of it. */
function buildSurfaceLayerGrant(surface: SyncedAppSurface): CapabilityLayerGrant {
  const row = getPlatformCapabilities(surface);
  const granted = new Set<PlatformCapability>(
    ALL_PLATFORM_CAPABILITIES.filter((capabilityId) => row[capabilityId]),
  );
  return { layer: 'surface', sourceId: `surface:${surface}`, granted };
}

/** Settings layer: no restriction until a real per-capability settings store exists — see module doc. */
function buildSettingsLayerGrant(): CapabilityLayerGrant {
  return { layer: 'settings', sourceId: 'settings:none-configured', granted: allCapabilities() };
}

export interface BuildMeCapabilityHandshakeInput {
  /** No per-chat-session id exists at account-handshake time; the user id stands in for the account-level document. A real chat session gets its own document at session-bootstrap time (see `apps/web` chat session labeling). */
  userId: string;
  tier: string | null | undefined;
  surface: SyncedAppSurface;
  /** The SAME value `route.ts` computes via `e2bCutoverEnabled()` for `feature_flags.code_execution` — passed in so the two fields can never disagree. */
  cloudExecutionDeploymentEnabled: boolean;
  /** Injectable for deterministic tests; defaults to `new Date().toISOString()`. */
  computedAt?: string;
}

/** `/api/me` capability-handshake document schema/logic version (bump when the layer-composition rules above change, not per-request). */
export const ME_CAPABILITY_HANDSHAKE_VERSION = 'me-handshake-v1';

export function buildMeCapabilityHandshake(
  input: BuildMeCapabilityHandshakeInput,
): EffectiveCapabilityDocument {
  return buildEffectiveCapabilityDocument({
    sessionId: input.userId,
    version: ME_CAPABILITY_HANDSHAKE_VERSION,
    computedAt: input.computedAt,
    layers: {
      model: buildModelLayerGrant(input.cloudExecutionDeploymentEnabled),
      tier: buildTierLayerGrant(input.tier),
      surface: buildSurfaceLayerGrant(input.surface),
      settings: buildSettingsLayerGrant(),
    },
  });
}

/**
 * Normalizes the in-process `EffectiveCapabilityDocument` (readonly arrays —
 * `@agiworkforce/types` `capability-handshake/` is frozen; this does not
 * change it) into the JSON-serializable shape `MeResponseSchema` validates
 * (`@agiworkforce/cloud-contracts` infers mutable arrays from the Zod
 * schema). `NextResponse.json()` would serialize either shape identically —
 * this exists purely to satisfy `tsc`'s readonly/mutable array variance at
 * the wire boundary, not to change any value.
 */
export function toWireCapabilityHandshake(
  document: EffectiveCapabilityDocument,
): EffectiveCapabilityDocumentWire {
  return {
    ...document,
    granted: [...document.granted],
    deniedBy: Object.fromEntries(
      Object.entries(document.deniedBy).map(([capabilityId, layers]) => [
        capabilityId,
        [...(layers ?? [])],
      ]),
    ),
  };
}
