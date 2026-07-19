import { describe, expect, it } from 'vitest';
import { modelsCatalog } from '../model-catalog';
import type { Provider } from '../provider';

type BannedProviderId =
  | 'ai21'
  | 'azure'
  | 'cerebras'
  | 'cohere'
  | 'deepinfra'
  | 'fireworks'
  | 'sambanova'
  | 'together';

type AssertNever<T extends never> = T;
export type BannedProvidersAreNotCanonical = AssertNever<Extract<Provider, BannedProviderId>>;

describe('banned provider policy', () => {
  it('keeps banned providers out of the generated provider catalog', () => {
    const providerIds = Object.keys(modelsCatalog.providers);

    expect(providerIds).not.toEqual(
      expect.arrayContaining([
        'ai21',
        'azure',
        'cerebras',
        'cohere',
        'deepinfra',
        'fireworks',
        'sambanova',
        'together',
      ]),
    );
  });
});
