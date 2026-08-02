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
 * Android AICore). A row supported by nothing else cannot be downloaded, and
 * the picker cannot offer it until async tier-1 detection makes the catalog
 * reactive — see the backlog note on `isSystemRuntimeOnlyModel`.
 */
export const SYSTEM_RUNTIME_ONLY = new Set(['apple-foundation-models', 'aicore']);

// Backlog: this always excludes system-runtime-only rows rather than showing them
// once native async capability detection confirms the runtime is actually active.
// Making the catalog reactive to that detection is a separate scope item, not done here.
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
 * row like the qwen3-vl vision pack never reaches it in production listing,
 * regardless of what it returns.
 */
export function isSelectableLocalCatalogModel(model: OnDeviceModel): boolean {
  if (isSystemRuntimeOnlyModel(model)) return false;
  if (model.fileSizeBytes <= 0) return true;
  if (model.executorchPreset) return true;
  return hasRunnableGgufArtifacts(model);
}
