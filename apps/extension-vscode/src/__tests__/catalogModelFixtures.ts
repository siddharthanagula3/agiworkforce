import { getCoreManualModelOptions } from '@agiworkforce/types';

type CatalogModelOption = ReturnType<typeof getCoreManualModelOptions>[number];

/**
 * Resolve test inputs from the canonical catalog so model releases do not
 * require fixture edits in the extension suite.
 */
export function requireCatalogModel(provider?: string, index = 0): CatalogModelOption {
  const candidates = getCoreManualModelOptions().filter(
    (model) => provider === undefined || String(model.provider) === provider,
  );
  const model = candidates[index];
  if (!model) {
    throw new Error(
      provider === undefined
        ? `The catalog must expose at least ${index + 1} manual model(s)`
        : `The catalog must expose at least ${index + 1} manual model(s) for ${provider}`,
    );
  }
  return model;
}

/** Return a live catalog model whose provider is not supported by a test path. */
export function requireCatalogModelOutside(
  supportedProviders: ReadonlySet<string>,
): CatalogModelOption {
  const model = getCoreManualModelOptions().find(
    (candidate) => !supportedProviders.has(String(candidate.provider)),
  );
  if (!model) {
    throw new Error('The catalog must expose a model outside the supported provider set');
  }
  return model;
}

/** Provider-neutral protocol fixture; deliberately not a real catalog ID. */
export const SYNTHETIC_LOCAL_MODEL_ID = 'fixture-local-model-alpha';

/** Second provider-neutral protocol fixture for multi-model discovery tests. */
export const SYNTHETIC_LOCAL_MODEL_ID_SECONDARY = 'fixture-local-model-beta';
