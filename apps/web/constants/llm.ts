export const _stub = true;
export default {} as any;
// specific exports for tests
export const LLM_MODELS = [];
export const PLAN_MODELS = [];
export const ThemeProvider = ({ children }: any) => children;
export const useTheme = () => ({ theme: 'dark', setTheme: () => {} });
export const supabase = {} as any;

export const getModelMetadata = (modelId?: string) => ({
  name: modelId || 'unknown',
  provider: 'unknown',
  maxTokens: 4096,
});
