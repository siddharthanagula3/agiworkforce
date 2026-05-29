/**
 * features/model-picker/ — Model picker UI + state.
 *
 * Phase 6 reorg: moved from services/modelConstants.ts and services/modelMetrics.ts.
 */
export {
  MODEL_PICKER_OPTIONS,
  MODEL_CONTEXT_LIMITS,
  MODEL_COST_RATES,
  MODEL_COST_BLENDED,
  DEFAULT_BLENDED_RATE,
  CHARS_PER_TOKEN,
  normalizeConfiguredModelId,
  buildGroupedQuickPickItems,
  getModelProviderInfo,
  type ModelPickerOption,
  type GroupedQuickPickItem,
  type ModelProviderInfo,
} from './modelConstants';
export {
  getModelMetrics,
  initModelMetrics,
  ModelMetricsPanel,
  type ModelMetricsEntry,
} from './modelMetrics';
