import { describe, it, expect } from 'vitest';
import { isLocalProvider, LOCAL_PROVIDER_IDS } from '../../types/provider';
import { getAllModels } from '../../constants/llm';

const RUST_DISCOVERED_LOCAL_PROVIDER_IDS = ['ollama', 'lmstudio', 'llamacpp', 'vllm'] as const;

describe('local provider classification (shared by computerUseStore + App.tsx)', () => {
  it.each(RUST_DISCOVERED_LOCAL_PROVIDER_IDS)(
    'classifies the Rust-discovered provider id %s as on-device',
    (providerId) => {
      expect(isLocalProvider(providerId)).toBe(true);
    },
  );

  it('classifies the generic discovery id "local" as on-device', () => {
    expect(isLocalProvider('local')).toBe(true);
  });

  it('has no member beyond the Rust-discovered ids and the generic alias', () => {
    expect([...LOCAL_PROVIDER_IDS].sort()).toEqual(
      [...RUST_DISCOVERED_LOCAL_PROVIDER_IDS, 'local'].sort(),
    );
  });

  it('classifies no managed-catalog provider as on-device', () => {
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
    expect(isLocalProvider('LMStudio')).toBe(true);
    expect(isLocalProvider('Ollama')).toBe(true);
  });

  it('treats absent values as not on-device', () => {
    expect(isLocalProvider(null)).toBe(false);
    expect(isLocalProvider(undefined)).toBe(false);
    expect(isLocalProvider('')).toBe(false);
  });
});
