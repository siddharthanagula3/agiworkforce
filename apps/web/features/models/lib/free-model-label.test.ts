import { describe, expect, it } from 'vitest';
import { getProviderOfferings, modelsCatalog } from '@agiworkforce/types';
import { findSelectableModel } from '@shared/stores/model-store';
import { freeModelDisplayName, freeModelLabel } from './free-model-label';

const DATED_ID = /^(.+)-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/;
const offerings = Object.entries(getProviderOfferings());

function registryName(id: string): string | undefined {
  return Object.entries(modelsCatalog.models).find(
    ([modelId, model]) => modelId === id || model.apiModelId === id,
  )?.[1].name;
}

const uncurated = offerings.filter(
  ([, offering]) =>
    offering.providerModelId !== null && offering.displayName === offering.providerModelId,
);

const datedWithRegistryBase = uncurated.flatMap(([key, offering]) => {
  const base = DATED_ID.exec(offering.providerModelId!)?.[1];
  const name = base ? registryName(base) : undefined;
  return base && name && !registryName(offering.providerModelId!)
    ? [{ key, id: offering.providerModelId!, base, name }]
    : [];
});

describe('free model labels', () => {
  it('never labels a dated snapshot with its raw id when the registry names the model', () => {
    expect(datedWithRegistryBase.length).toBeGreaterThan(0);
    for (const { key, id, name } of datedWithRegistryBase) {
      const label = freeModelLabel(key)!;
      expect(label.name).toBe(name);
      expect(label.version).not.toBeNull();
      expect(label.displayName).not.toContain(id);
      if (getProviderOfferings()[key]?.quotaProbeProtocol) {
        expect(findSelectableModel(key)?.name).toBe(label.displayName);
      }
    }
  });

  it('takes the registry name for an offering the registry knows by its exact id', () => {
    const known = uncurated.filter(([, offering]) => registryName(offering.providerModelId!));
    expect(known.length).toBeGreaterThan(0);
    for (const [key, offering] of known) {
      expect(freeModelLabel(key)).toMatchObject({
        name: registryName(offering.providerModelId!),
        version: null,
      });
    }
  });

  it('keeps a name the catalogue already curated', () => {
    const curated = offerings.filter(
      ([, offering]) => offering.displayName !== offering.providerModelId,
    );
    expect(curated.length).toBeGreaterThan(0);
    for (const [key, offering] of curated) {
      expect(freeModelDisplayName(key)).toBe(offering.displayName);
    }
  });

  it('never shows a raw provider id as the name of a chat offering', () => {
    for (const [key, offering] of offerings) {
      if (offering.category !== 'chat' || !offering.providerModelId) continue;
      const label = freeModelLabel(key)!;
      expect(label.name).not.toBe(offering.providerModelId);
      expect(label.displayName).not.toBe(offering.providerModelId);
    }
  });

  it('files a snapshot under the same family and generation as its base model', () => {
    const pairs = datedWithRegistryBase.flatMap(({ key, base }) => {
      const baseKey = offerings.find(([, offering]) => offering.providerModelId === base)?.[0];
      return baseKey ? [[key, baseKey] as const] : [];
    });
    expect(pairs.length).toBeGreaterThan(0);
    for (const [snapshotKey, baseKey] of pairs) {
      const snapshot = freeModelLabel(snapshotKey)!;
      const base = freeModelLabel(baseKey)!;
      expect(snapshot.family).toBe(base.family);
      expect(snapshot.generation).toEqual(base.generation);
      expect(snapshot.name).toBe(base.name);
    }
  });

  it('has no label for an offering the registry does not know', () => {
    expect(freeModelLabel('fixture-unknown-offering')).toBeNull();
    expect(freeModelDisplayName('fixture-unknown-offering')).toBeNull();
  });
});
