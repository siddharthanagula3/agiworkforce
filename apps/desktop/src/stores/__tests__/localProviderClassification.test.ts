/**
 * HARD-014 (narrowed). Characterization test for the single on-device-runtime
 * classification shared by `computerUseStore`'s Local trust-boundary strip and
 * `App.tsx`'s Local-mode model picker.
 *
 * WHAT THIS IS NOT. The wave-1 submission claimed a live Local-to-Managed-Cloud
 * boundary cross in the desktop tier gate. It is not reachable: every provider
 * value that reaches `useModelStore.selectModel` / `enforceModelTierRestriction`
 * / `isTaskRoutingModelAllowedForTier` is either the literal `'managed_cloud'`
 * or comes from `getModelMetadata()`, and `models.json` contains no
 * local-provider model. Those gate edits were reverted. What survives is a pure
 * de-duplication of one provider set that used to be spelled out three times.
 *
 * WHAT THIS PINS. The de-duplication is only safe while the shared set stays
 * exactly the set the copies held:
 *  - every id the Rust local-discovery commands emit must classify as local, or
 *    `App.tsx`'s Local-mode filter (App.tsx:952) drops that runtime's models out
 *    of the picker and its `isLocal` badge (App.tsx:965) goes false;
 *  - no catalog provider may classify as local, or `computerUseStore`'s
 *    `providerCrossesLocalBoundary` check stops stripping a cloud vision model
 *    inside a Local workspace.
 *
 * It lives under stores/__tests__ because computerUseStore is the consumer whose
 * trust boundary depends on the second half.
 */
import { describe, it, expect } from 'vitest';
import { isLocalProvider, LOCAL_PROVIDER_IDS } from '../../types/provider';
import { getAllModels } from '../../constants/llm';

/**
 * Provider ids the Rust side stamps onto discovered on-device models, read off
 * `Provider::as_string()` in apps/desktop/src-tauri/src/core/llm/mod.rs:710 and
 * the four discovery commands in sys/commands/llm.rs (`llm_list_ollama_models`,
 * `llm_list_lmstudio_models` :1207, `llm_list_llamacpp_models` :1214,
 * `llm_list_vllm_models` :1223). App.tsx:922-927 invokes exactly these four.
 */
const RUST_DISCOVERED_LOCAL_PROVIDER_IDS = ['ollama', 'lmstudio', 'llamacpp', 'vllm'] as const;

describe('local provider classification (shared by computerUseStore + App.tsx)', () => {
  it.each(RUST_DISCOVERED_LOCAL_PROVIDER_IDS)(
    'classifies the Rust-discovered provider id %s as on-device',
    (providerId) => {
      expect(isLocalProvider(providerId)).toBe(true);
    },
  );

  it('classifies the generic discovery id "local" as on-device', () => {
    // Emitted for an on-device runtime the discovery layer could not attribute
    // to a named product. It is deliberately not a member of `Provider`.
    expect(isLocalProvider('local')).toBe(true);
  });

  it('has no member beyond the Rust-discovered ids and the generic alias', () => {
    // Guards the other direction: an id added here that Rust never emits would
    // be an exemption nothing can reach.
    expect([...LOCAL_PROVIDER_IDS].sort()).toEqual(
      [...RUST_DISCOVERED_LOCAL_PROVIDER_IDS, 'local'].sort(),
    );
  });

  it('classifies no managed-catalog provider as on-device', () => {
    // computerUseStore strips `provider` when a Local workspace is paired with a
    // non-local provider. Every provider offered by COMPUTER_USE_MODEL_OPTIONS
    // comes from getAllModels(); if any of them classified as local the strip
    // would stop firing and OPA screenshots would egress from a Local workspace.
    const catalogProviders = [...new Set(getAllModels().map((model) => model.provider))];
    expect(catalogProviders.length).toBeGreaterThan(0);

    const misclassified = catalogProviders.filter((provider) => isLocalProvider(provider));
    expect(misclassified).toEqual([]);
  });

  it('classifies managed_cloud as not on-device', () => {
    expect(isLocalProvider('managed_cloud')).toBe(false);
    expect(isLocalProvider('managed-cloud')).toBe(false);
  });

  it('is case-insensitive', () => {
    // computerUseStore passes the raw localStorage value through without
    // lowercasing it, unlike App.tsx.
    expect(isLocalProvider('LMStudio')).toBe(true);
    expect(isLocalProvider('Ollama')).toBe(true);
  });

  it('treats absent values as not on-device', () => {
    expect(isLocalProvider(null)).toBe(false);
    expect(isLocalProvider(undefined)).toBe(false);
    expect(isLocalProvider('')).toBe(false);
  });
});
