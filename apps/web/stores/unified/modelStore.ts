export {
  AVAILABLE_MODELS,
  useModelStore,
  type AIModel,
  type RoutingDecision,
} from '../../shared/stores/model-store';
export { type ModelMetadata } from '@/constants/llm';

import { useModelStore } from '../../shared/stores/model-store';

export default useModelStore;

export const selectLastRoutingDecision = (state: ReturnType<typeof useModelStore.getState>) =>
  state.lastRoutingDecision;
