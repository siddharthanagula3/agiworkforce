/**
 * Which on-device catalog rows Mobile can actually route local chat to.
 *
 * Kept in its own module — with NO module-level catalog evaluation — because
 * `service.ts` builds `LOCAL_MODEL_LIST` at import time and throws when the
 * filtered catalog is empty. First-run onboarding needs the predicate long
 * before it needs the picker's lists, and pulling the whole service in just to
 * ask "is this row selectable?" would drag that side effect into the app's
 * very first screen. `service.ts` re-exports `isSelectableLocalCatalogModel`
 * so there is still exactly one definition.
 */
import { hasRunnableGgufArtifacts } from '@agiworkforce/local-llm';
import type { OnDeviceModel } from '@agiworkforce/types';

/**
 * Runtimes that exist only as an OS-resident model (Apple Intelligence,
 * Android AICore). These rows are catalog-selectable, but their actual ready
 * state remains fail-closed in `installStore`: capability hydration enables
 * only the row matching the active native Tier-1 runtime and leaves every
 * other system row visibly unavailable.
 */
export const SYSTEM_RUNTIME_ONLY = new Set(['apple-foundation-models', 'aicore']);

export function isSystemRuntimeOnlyModel(model: OnDeviceModel): boolean {
  return model.supportedRuntimes.every((r) => SYSTEM_RUNTIME_ONLY.has(r));
}

/**
 * The catalog includes future local models before all native packages are
 * shippable on Mobile. The picker only shows rows that can actually be used:
 * system-runtime rows when their runtime is active, or downloadable rows with
 * either an ExecuTorch preset (tier 2) or verified llama-rn GGUF artifacts
 * (tier 3, incl. multimodal base+mmproj pairs).
 *
 * Note this predicate is applied to SHIPPABLE catalog rows only
 * (`getShippableModels()` already filters `shipsInV1`) — a `shipsInV1:false`
 * hidden vision-pack rows never reach it in production listing,
 * regardless of what it returns.
 */
export function isSelectableLocalCatalogModel(model: OnDeviceModel): boolean {
  // OS-resident rows must reach LOCAL_MODEL_LIST so the async capability probe
  // can mark the matching one ready. `statusForModel` is the authoritative
  // runtime gate and prevents selecting a system model that is absent on this
  // device; excluding the rows here made a detected Tier-1 runtime impossible
  // to select or auto-route to at all.
  if (isSystemRuntimeOnlyModel(model)) return model.fileSizeBytes <= 0;
  if (model.fileSizeBytes <= 0) return true;
  if (model.executorchPreset) return true;
  return hasRunnableGgufArtifacts(model);
}
