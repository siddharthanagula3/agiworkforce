/**
 * Anthropic model catalog.
 *
 * Canonical membership, metadata, and ordering come from
 * `@agiworkforce/model-registry`; `@agiworkforce/types` projects that data
 * into the provider-adapter catalog shape.
 *
 * The provider catalog deliberately uses that verified snapshot so picker
 * policy stays deterministic instead of changing with live discovery.
 */

import { getProviderModelCatalog, type ModelInfo } from '@agiworkforce/types';

export const ANTHROPIC_MODEL_CATALOG: readonly ModelInfo[] = getProviderModelCatalog('anthropic');
