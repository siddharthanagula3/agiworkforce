/**
 * Anthropic model catalog.
 *
 * Canonical membership, metadata, and ordering come from
 * `@agiworkforce/model-registry`; `@agiworkforce/types` projects that data
 * into the provider-adapter catalog shape.
 *
 * (The Anthropic API does not expose a `/v1/models` discovery endpoint,
 * so the generated catalog is also the runtime fallback for `adapter.catalog()`.)
 */

import { getProviderModelCatalog, type ModelInfo } from '@agiworkforce/types';

export const ANTHROPIC_MODEL_CATALOG: readonly ModelInfo[] = getProviderModelCatalog('anthropic');
