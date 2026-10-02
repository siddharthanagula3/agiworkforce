import { describe, expect, it } from 'vitest';
import { getProviderOfferings, modelsCatalog } from '../model-catalog';
import { providerOfferingDisplayName, providerOfferingLabel } from '../provider-offering-label';

const DATED_ID = /^(.+)-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/;
const SHORT_STAMP = /-(\d{2})(\d{2})$/;
const FULL_STAMP = /-(\d{4})-?(\d{2})-?(\d{2})$/;
const LEAD = /^([a-z]+)-?([a-z]?)(\d+(?:\.\d+)*)(?=-|$)/;
const MODE = /^[a-z]+\d[a-z]+$/;
const GENERATION_WORD = /^[a-z]?\d+(\.\d+)*$/i;
const SIZE_WORD = /^a?\d+(\.\d+)?[bkmt]$/i;
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

function leadSpelling(name: string, id: string): string | null {
  const lead = LEAD.exec(id);
  const at = lead ? name.indexOf(lead[3]!) : -1;
  return lead && at > 0 ? name.slice(0, at) : null;
}

function lineKey(id: string): string {
  return (DATED_ID.exec(id)?.[1] ?? id).replace(LEAD, (_lead, word: string) => word);
}

const datedWithRegistryBase = uncurated.flatMap(([key, offering]) => {
  const base = DATED_ID.exec(offering.providerModelId!)?.[1];
  const name = base ? registryName(base) : undefined;
  return base && name && !registryName(offering.providerModelId!)
    ? [{ key, id: offering.providerModelId!, base, name }]
    : [];
});

describe('provider offering labels', () => {
  it('never labels a dated snapshot with its raw id when the registry names the model', () => {
    expect(datedWithRegistryBase.length).toBeGreaterThan(0);
    for (const { key, id, name } of datedWithRegistryBase) {
      const label = providerOfferingLabel(key)!;
      expect(label.name).toBe(name);
      expect(label.version).not.toBeNull();
      expect(label.displayName).not.toContain(id);
    }
  });

  it('takes the registry name for an offering the registry knows by its exact id', () => {
    const known = uncurated.filter(([, offering]) => registryName(offering.providerModelId!));
    expect(known.length).toBeGreaterThan(0);
    for (const [key, offering] of known) {
      expect(providerOfferingLabel(key)).toMatchObject({
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
      expect(providerOfferingDisplayName(key)).toBe(offering.displayName);
    }
  });

  it('never shows a raw provider id as the name of a chat offering', () => {
    for (const [key, offering] of offerings) {
      if (offering.category !== 'chat' || !offering.providerModelId) continue;
      const label = providerOfferingLabel(key)!;
      expect(label.name).not.toBe(offering.providerModelId);
      expect(label.displayName).not.toBe(offering.providerModelId);
    }
  });

  it('files a snapshot under the same family, line and generation as its base model', () => {
    const pairs = datedWithRegistryBase.flatMap(({ key, base }) => {
      const baseKey = offerings.find(([, offering]) => offering.providerModelId === base)?.[0];
      return baseKey ? [[key, baseKey] as const] : [];
    });
    expect(pairs.length).toBeGreaterThan(0);
    for (const [snapshotKey, baseKey] of pairs) {
      const snapshot = providerOfferingLabel(snapshotKey)!;
      const base = providerOfferingLabel(baseKey)!;
      expect(snapshot.family).toBe(base.family);
      expect(snapshot.line).toBe(base.line);
      expect(snapshot.generation).toEqual(base.generation);
      expect(snapshot.name).toBe(base.name);
    }
  });

  it('spells a generated name the way the registry spells the rest of its family', () => {
    const registrySpellings = new Map<string, Set<string>>();
    for (const [, offering] of uncurated) {
      const id = offering.providerModelId!;
      const name = registryName(id);
      const spelling = name ? leadSpelling(name, id) : null;
      if (!spelling) continue;
      const word = LEAD.exec(id)![1]!;
      registrySpellings.set(word, new Set([...(registrySpellings.get(word) ?? []), spelling]));
    }
    const generated = uncurated.filter(
      ([, offering]) =>
        !registryName(offering.providerModelId!) &&
        registrySpellings.has(LEAD.exec(offering.providerModelId!)?.[1] ?? ''),
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const [key, offering] of generated) {
      const id = offering.providerModelId!;
      expect(registrySpellings.get(LEAD.exec(id)![1]!)).toContain(
        leadSpelling(providerOfferingLabel(key)!.name, id),
      );
    }
  });

  it('writes a mode acronym such as text-to-video in capitals', () => {
    const modes = uncurated.flatMap(([key, offering]) =>
      offering
        .providerModelId!.split('-')
        .filter((part) => MODE.test(part))
        .map((part) => [key, part] as const),
    );
    expect(modes.length).toBeGreaterThan(0);
    for (const [key, part] of modes) {
      expect(providerOfferingLabel(key)!.name.split(' ')).toContain(part.toUpperCase());
    }
  });

  it('shows every snapshot stamp as a date, never as the raw id fragment', () => {
    const short = uncurated.flatMap(([key, offering]) => {
      const stamp = SHORT_STAMP.exec(offering.providerModelId!);
      return stamp ? [{ key, first: stamp[1]!, second: stamp[2]! }] : [];
    });
    const yearMonth = short.filter(({ first }) => Number(first) > 12);
    const monthDay = short.filter(({ first }) => Number(first) <= 12);
    expect(yearMonth.length).toBeGreaterThan(0);
    expect(monthDay.length).toBeGreaterThan(0);
    for (const { key, first, second } of yearMonth) {
      const version = providerOfferingLabel(key)!.version!;
      expect(version).toMatch(new RegExp(`^Snapshot [A-Z][a-z]{2} 20${first}$`));
      expect(version).not.toContain(`${first}${second}`);
    }
    for (const { key, first, second } of monthDay) {
      const version = providerOfferingLabel(key)!.version!;
      expect(version).toMatch(new RegExp(`^Snapshot [A-Z][a-z]{2} ${Number(second)}$`));
      expect(version).not.toContain(`${first}${second}`);
    }

    const full = uncurated.flatMap(([key, offering]) => {
      const stamp = FULL_STAMP.exec(offering.providerModelId!);
      return stamp ? [{ key, year: stamp[1]!, day: Number(stamp[3]) }] : [];
    });
    expect(full.length).toBeGreaterThan(0);
    for (const { key, year, day } of full) {
      expect(providerOfferingLabel(key)!.version).toMatch(
        new RegExp(`^Snapshot [A-Z][a-z]{2} ${day}, ${year}$`),
      );
    }
  });

  it('files each model under its line: the name without generation, size or snapshot', () => {
    const byLineKey = new Map<string, Set<string>>();
    const qwenLines = new Set<string>();
    for (const [key, offering] of uncurated) {
      const label = providerOfferingLabel(key)!;
      expect(label.line.length).toBeGreaterThan(0);
      for (const word of label.line.split(' ')) {
        expect(word).not.toMatch(GENERATION_WORD);
        expect(word).not.toMatch(SIZE_WORD);
      }
      const shared = lineKey(offering.providerModelId!);
      byLineKey.set(shared, new Set([...(byLineKey.get(shared) ?? []), label.line]));
      if (offering.provider === 'qwen' && label.family === 'qwen') qwenLines.add(label.line);
    }
    expect([...byLineKey.values()].filter((lines) => lines.size > 1)).toEqual([]);
    expect(qwenLines.size).toBeGreaterThan(1);
  });

  it('has no label for an offering the registry does not know', () => {
    expect(providerOfferingLabel('fixture-unknown-offering')).toBeNull();
    expect(providerOfferingDisplayName('fixture-unknown-offering')).toBeNull();
  });
});
