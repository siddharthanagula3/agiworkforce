/**
 * Intent Store
 *
 * Zustand store for managing intent detection and tool routing, including:
 * - Synchronous intent detection (pattern-based)
 * - LLM-enhanced intent detection
 * - Routing plan creation
 * - Quick-win optimization checks
 * - Entity extraction
 * - Available categories and complexity levels
 * - Batch detection
 * - Detector configuration
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, isTauri } from '@/lib/tauri-mock';

// Types matching Rust backend (intent.rs)

export interface RequiredServerResponse {
  name: string;
  required: boolean;
  priority: number;
  tools: string[];
}

export interface DetectedIntentResponse {
  prompt: string;
  primaryCategory: string;
  secondaryCategories: string[];
  complexity: string;
  confidence: number;
  categoryConfidence: number;
  toolConfidence: number;
  requiredTools: string[];
  requiredServers: RequiredServerResponse[];
  entities: Record<string, string>;
  isQuickWin: boolean;
  suggestedAction: string;
  matchedKeywords: string[];
  requiresNetwork: boolean;
}

export interface ToolSelectionResponse {
  toolId: string;
  reason: string;
  confidence: number;
  estimatedTimeMs: number;
  isMcpTool: boolean;
  serverName: string | null;
  priority: number;
  dependencies: string[];
}

export interface RoutingPlanResponse {
  intent: DetectedIntentResponse;
  tools: ToolSelectionResponse[];
  serversToStart: RequiredServerResponse[];
  serversRunning: string[];
  estimatedTimeMs: number;
  skipPlanning: boolean;
  isOptimized: boolean;
  optimizationStrategies: string[];
  parallelGroups: string[][];
  directAnswer: string | null;
}

export interface OptimizationResultResponse {
  isQuickWin: boolean;
  optimizedTools: ToolSelectionResponse[];
  optimizedComplexity: string;
  estimatedTimeMs: number;
  strategiesApplied: string[];
  skipPlanning: boolean;
  directAnswer: string | null;
}

export interface IntentCategoryInfo {
  id: string;
  description: string;
}

export interface ComplexityInfo {
  id: string;
  minDurationSecs: number;
  maxDurationSecs: number;
  maxSteps: number;
}

export interface IntentDetectorConfigRequest {
  minPatternConfidence?: number;
  useLlmFallback?: boolean;
  llmConfidenceThreshold?: number;
  maxSecondaryCategories?: number;
}

interface IntentState {
  // Last detection result
  lastIntent: DetectedIntentResponse | null;

  // Last routing plan
  lastRoutingPlan: RoutingPlanResponse | null;

  // Last optimization result
  lastOptimization: OptimizationResultResponse | null;

  // Available categories and complexity levels (from backend)
  categories: IntentCategoryInfo[];
  complexityLevels: ComplexityInfo[];

  // Loading states
  isDetecting: boolean;
  isRouting: boolean;
  isOptimizing: boolean;
}

interface IntentActions {
  // Detection (pattern-based, fast)
  detect: (prompt: string) => Promise<DetectedIntentResponse>;

  // Detection (LLM-enhanced, for ambiguous prompts)
  detectWithLlm: (prompt: string) => Promise<DetectedIntentResponse>;

  // Routing plan
  createRoutingPlan: (prompt: string) => Promise<RoutingPlanResponse>;

  // Quick-win check
  checkQuickWin: (prompt: string) => Promise<OptimizationResultResponse>;

  // Entity extraction
  extractEntities: (prompt: string) => Promise<Record<string, string>>;

  // Categories and complexity
  loadCategories: () => Promise<IntentCategoryInfo[]>;
  loadComplexityLevels: () => Promise<ComplexityInfo[]>;

  // Batch detection
  detectBatch: (prompts: string[]) => Promise<DetectedIntentResponse[]>;

  // Configuration
  configure: (config: IntentDetectorConfigRequest) => Promise<void>;

  // Initialization
  initialize: () => Promise<void>;
}

export const useIntentStore = create<IntentState & IntentActions>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      lastIntent: null,
      lastRoutingPlan: null,
      lastOptimization: null,
      categories: [],
      complexityLevels: [],
      isDetecting: false,
      isRouting: false,
      isOptimizing: false,

      // Detection (pattern-based)
      detect: async (prompt: string) => {
        set((state) => {
          state.isDetecting = true;
        });

        try {
          const intent = await invoke<DetectedIntentResponse>('intent_detect', { prompt });
          set((state) => {
            state.lastIntent = intent;
            state.isDetecting = false;
          });
          return intent;
        } catch (error) {
          console.error('Failed to detect intent:', error);
          set((state) => {
            state.isDetecting = false;
          });
          throw error;
        }
      },

      // Detection (LLM-enhanced)
      detectWithLlm: async (prompt: string) => {
        set((state) => {
          state.isDetecting = true;
        });

        try {
          const intent = await invoke<DetectedIntentResponse>('intent_detect_with_llm', {
            prompt,
          });
          set((state) => {
            state.lastIntent = intent;
            state.isDetecting = false;
          });
          return intent;
        } catch (error) {
          console.error('Failed to detect intent with LLM:', error);
          set((state) => {
            state.isDetecting = false;
          });
          throw error;
        }
      },

      // Routing plan
      createRoutingPlan: async (prompt: string) => {
        set((state) => {
          state.isRouting = true;
        });

        try {
          const plan = await invoke<RoutingPlanResponse>('intent_create_routing_plan', { prompt });
          set((state) => {
            state.lastRoutingPlan = plan;
            state.lastIntent = plan.intent;
            state.isRouting = false;
          });
          return plan;
        } catch (error) {
          console.error('Failed to create routing plan:', error);
          set((state) => {
            state.isRouting = false;
          });
          throw error;
        }
      },

      // Quick-win check
      checkQuickWin: async (prompt: string) => {
        set((state) => {
          state.isOptimizing = true;
        });

        try {
          const result = await invoke<OptimizationResultResponse>('intent_check_quick_win', {
            prompt,
          });
          set((state) => {
            state.lastOptimization = result;
            state.isOptimizing = false;
          });
          return result;
        } catch (error) {
          console.error('Failed to check quick win:', error);
          set((state) => {
            state.isOptimizing = false;
          });
          throw error;
        }
      },

      // Entity extraction
      extractEntities: async (prompt: string) => {
        try {
          const entities = await invoke<Record<string, string>>('intent_extract_entities', {
            prompt,
          });
          return entities;
        } catch (error) {
          console.error('Failed to extract entities:', error);
          throw error;
        }
      },

      // Categories
      loadCategories: async () => {
        try {
          const categories = await invoke<IntentCategoryInfo[]>('intent_get_categories');
          set((state) => {
            state.categories = categories;
          });
          return categories;
        } catch (error) {
          console.error('Failed to load intent categories:', error);
          return [];
        }
      },

      // Complexity levels
      loadComplexityLevels: async () => {
        try {
          const levels = await invoke<ComplexityInfo[]>('intent_get_complexity_levels');
          set((state) => {
            state.complexityLevels = levels;
          });
          return levels;
        } catch (error) {
          console.error('Failed to load complexity levels:', error);
          return [];
        }
      },

      // Batch detection
      detectBatch: async (prompts: string[]) => {
        try {
          const results = await invoke<DetectedIntentResponse[]>('intent_detect_batch', {
            prompts,
          });
          return results;
        } catch (error) {
          console.error('Failed to batch detect intents:', error);
          throw error;
        }
      },

      // Configuration
      configure: async (config: IntentDetectorConfigRequest) => {
        try {
          await invoke('intent_configure', { config });
        } catch (error) {
          console.error('Failed to configure intent detector:', error);
          throw error;
        }
      },

      // Initialization
      initialize: async () => {
        if (!isTauri) return;

        await Promise.all([get().loadCategories(), get().loadComplexityLevels()]);
      },
    })),
    { name: 'IntentStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectLastIntent = (state: IntentState) => state.lastIntent;
export const selectLastRoutingPlan = (state: IntentState) => state.lastRoutingPlan;
export const selectLastOptimization = (state: IntentState) => state.lastOptimization;
export const selectCategories = (state: IntentState) => state.categories;
export const selectComplexityLevels = (state: IntentState) => state.complexityLevels;
export const selectIsDetecting = (state: IntentState) => state.isDetecting;
export const selectIsRouting = (state: IntentState) => state.isRouting;

export default useIntentStore;
