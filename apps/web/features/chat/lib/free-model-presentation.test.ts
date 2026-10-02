import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { freeModelLabel } from '@/features/models/lib/free-model-label';
import type {
  FreeQuotaCatalogue,
  FreeQuotaModel,
  FreeQuotaStatus,
} from '@/features/models/lib/free-quota-types';
import { presentFreeModels } from './free-model-presentation';

const ISSUER = 'Fixture Cloud';

const servableChat = Object.entries(getProviderOfferings())
  .filter(([, offering]) => offering.category === 'chat' && offering.quotaProbeProtocol === 'chat')
  .map(([key]) => key);

const families = new Map<string, string[]>();
for (const key of servableChat) {
  const family = freeModelLabel(key)!.family;
  families.set(family, [...(families.get(family) ?? []), key]);
}
const [familyA, familyB] = [...families.values()]
  .filter((keys) => keys.length >= 2)
  .sort((left, right) => right.length - left.length);

function model(key: string, status: FreeQuotaStatus = 'ready'): FreeQuotaModel {
  const offering = getProviderOfferings()[key]!;
  return {
    key,
    displayName: offering.displayName,
    providerModelId: offering.providerModelId,
    category: offering.category,
    limit: null,
    unit: null,
    consumedApproximate: null,
    expiresOn: null,
    status,
  };
}

function catalogue(models: FreeQuotaModel[], issuer = ISSUER): FreeQuotaCatalogue {
  return {
    issuer,
    observedOn: '2026-10-01',
    evidenceUrl: 'https://provider.example/free',
    reportedEligible: models.length,
    reportedUnavailable: 0,
    models,
  };
}

function compareGeneration(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function keysOf(entries: readonly { model: FreeQuotaModel }[]): string[] {
  return entries.map((entry) => entry.model.key);
}

describe('presentFreeModels', () => {
  it('features one ready model per family and keeps the rest behind More models', () => {
    expect(familyA!.length).toBeGreaterThanOrEqual(2);
    expect(familyB!.length).toBeGreaterThanOrEqual(2);
    const models = [...familyA!, ...familyB!].map((key) => model(key));
    const view = presentFreeModels([catalogue(models)], { category: null, selectedId: 'auto' });
    const [pool] = view.pools;

    expect(view.category).toBe('chat');
    expect(pool!.featured).toHaveLength(2);
    expect(new Set(pool!.featured.map((entry) => entry.label.family)).size).toBe(2);
    expect(pool!.more).toHaveLength(models.length - 2);
    expect(pool!.unavailable).toEqual([]);
    expect(pool!.pause).toBeNull();
    for (const featured of pool!.featured) {
      const siblings = pool!.more.filter((entry) => entry.label.family === featured.label.family);
      for (const sibling of siblings) {
        const order = compareGeneration(featured.label.generation, sibling.label.generation);
        expect(order).toBeGreaterThanOrEqual(0);
        if (order === 0 && sibling.label.version === null)
          expect(featured.label.version).toBeNull();
      }
    }
  });

  it('keeps unavailable models out of the main list', () => {
    const ready = familyA!.map((key) => model(key));
    const unavailable = familyB!.map((key) => model(key, 'unavailable'));
    const [pool] = presentFreeModels([catalogue([...ready, ...unavailable])], {
      category: null,
      selectedId: 'auto',
    }).pools;

    expect(keysOf([...pool!.featured, ...pool!.more]).sort()).toEqual([...familyA!].sort());
    expect(keysOf(pool!.unavailable).sort()).toEqual([...familyB!].sort());
  });

  it('pauses a pool with no ready model instead of listing every model', () => {
    const paused = presentFreeModels(
      [catalogue(servableChat.map((key) => model(key, 'unavailable')))],
      { category: null, selectedId: 'auto' },
    ).pools[0]!;
    expect(paused.pause).toBe('paused');
    expect([...paused.featured, ...paused.more, ...paused.unavailable]).toEqual([]);

    const spent = presentFreeModels(
      [
        catalogue([
          model(familyA![0]!, 'exhausted'),
          model(familyA![1]!, 'expired'),
          model(familyB![0]!, 'exhausted'),
        ]),
      ],
      { category: null, selectedId: 'auto' },
    ).pools[0]!;
    expect(spent.pause).toBe('used_up');
  });

  it('pins the selected model when it would otherwise be hidden', () => {
    const selected = familyB![0]!;
    const unavailableView = presentFreeModels(
      [catalogue([...familyA!.map((key) => model(key)), model(selected, 'unavailable')])],
      { category: null, selectedId: selected },
    );
    expect(unavailableView.pinned?.model.key).toBe(selected);
    expect(keysOf(unavailableView.pools[0]!.unavailable)).not.toContain(selected);

    const pausedView = presentFreeModels([catalogue([model(selected, 'exhausted')])], {
      category: null,
      selectedId: selected,
    });
    expect(pausedView.pinned?.model.key).toBe(selected);
    expect(pausedView.pools[0]!.pause).toBe('used_up');

    const ready = catalogue(familyA!.map((key) => model(key)));
    const hidden = presentFreeModels([ready], { category: null, selectedId: 'auto' }).pools[0]!
      .more[0]!.model.key;
    const readyView = presentFreeModels([ready], { category: null, selectedId: hidden });
    expect(readyView.pinned?.model.key).toBe(hidden);
    expect(keysOf(readyView.pools[0]!.more)).not.toContain(hidden);

    const featured = presentFreeModels([ready], { category: null, selectedId: 'auto' }).pools[0]!
      .featured[0]!.model.key;
    expect(presentFreeModels([ready], { category: null, selectedId: featured }).pinned).toBeNull();
  });

  it('never offers a model the chat route cannot serve', () => {
    const unservable = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.category === 'chat' && !offering.quotaProbeProtocol,
    )![0];
    const view = presentFreeModels([catalogue([model(unservable), model(familyA![0]!)])], {
      category: null,
      selectedId: unservable,
    });
    const listed = view.pools.flatMap((pool) => [
      ...pool.featured,
      ...pool.more,
      ...pool.unavailable,
    ]);
    expect(keysOf(listed)).toEqual([familyA![0]]);
    expect(view.pinned).toBeNull();
  });

  it('keeps each issuer in its own pool', () => {
    const view = presentFreeModels(
      [catalogue([model(familyA![0]!)]), catalogue([model(familyB![0]!)], 'Second Fixture')],
      { category: null, selectedId: 'auto' },
    );
    expect(view.pools.map((pool) => pool.issuer)).toEqual([ISSUER, 'Second Fixture']);
  });
});
