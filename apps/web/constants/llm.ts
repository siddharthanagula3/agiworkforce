export const _stub = true;
export default {} as any;
// specific exports for tests
export const LLM_MODELS = [];
export const PLAN_MODELS = [];
export const ThemeProvider = ({ children }: any) => children;
export const useTheme = () => ({ theme: 'dark', setTheme: () => {} });
export const supabase = {} as any;

export type ModelMetadata = {
  id?: string;
  name: string;
  provider: string;
  maxTokens?: number;
  modelType?: string;
  qualityTier?: string;
  contextWindow?: number;
  inputCost?: number;
  outputCost?: number;
  search?: boolean;
  capabilities?: Record<string, boolean>;
  bestFor?: string[];
  [key: string]: any;
};

export const getModelMetadata = (modelId?: string): ModelMetadata => ({
  id: modelId,
  name: modelId || 'unknown',
  provider: 'unknown',
  maxTokens: 4096,
  modelType: 'chat',
  qualityTier: 'standard',
  contextWindow: 4096,
  inputCost: 0,
  outputCost: 0,
  capabilities: {
    streaming: true,
    tools: false,
    vision: false,
    json: true,
    thinking: false,
    computerUse: false,
    agentic: false,
    imageGen: false,
    videoGen: false,
    search: false,
  },
  bestFor: [],
});

// Missing named exports from constants/llm stub
export const PROVIDER_LABELS: Record<string, string> = {};
export const PROVIDERS_IN_ORDER: string[] = [];
export const THINKING_MODEL_VARIANTS: Record<string, string> = {};
export const isModelAllowedForTier = (_modelId: string, _tier: string): boolean => true;
