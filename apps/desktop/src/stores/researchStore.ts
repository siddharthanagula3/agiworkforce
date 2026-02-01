/**
 * Research Store
 *
 * Zustand store for managing research state, including:
 * - Active research sessions
 * - Research history
 * - Progress tracking
 * - Configuration preferences
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, isTauri } from '@/lib/tauri-mock';

// Types matching the Rust backend
export type ResearchModeId = 'quick' | 'standard' | 'deep' | 'exhaustive';
export type ResearchPhase =
  | 'initializing'
  | 'analyzing_query'
  | 'searching'
  | 'collecting_results'
  | 'synthesizing'
  | 'generating_report'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface ResearchProgress {
  session_id: string;
  phase: ResearchPhase;
  progress_percent: number;
  status_message: string;
  sources_found: number;
  iterations_completed: number;
  total_iterations: number;
  active_agents: string[];
  elapsed_secs: number;
  estimated_remaining_secs?: number;
  cancelled: boolean;
}

export interface ResearchResponse {
  session_id: string;
  query: string;
  mode: string;
  report: string;
  summary: string;
  key_findings: string[];
  citations_count: number;
  confidence: string;
  duration_secs: number;
  sources_examined: number;
  sources_cited: number;
}

export interface ResearchConfig {
  default_mode: ResearchModeId;
  enable_web_search: boolean;
  enable_document_search: boolean;
  enable_email_search: boolean;
  enable_calendar_search: boolean;
  enable_memory_search: boolean;
  min_confidence_threshold: number;
  max_concurrent_agents: number;
  show_confidence_indicators: boolean;
  generate_inline_citations: boolean;
  synthesis_model?: string;
  analysis_model?: string;
}

export interface ResearchHistoryEntry {
  id: string;
  query: string;
  mode: ResearchModeId;
  timestamp: number;
  duration_secs: number;
  sources_cited: number;
  confidence: string;
  summary: string;
  key_findings: string[];
  report?: string;
}

export interface ResearchAvailability {
  available: boolean;
  sources: {
    web_search: { enabled: boolean; status: string };
    document_search: { enabled: boolean; status: string };
    email_search: { enabled: boolean; status: string };
    calendar_search: { enabled: boolean; status: string };
    memory_search: { enabled: boolean; status: string };
  };
  default_mode: ResearchModeId;
}

interface ResearchState {
  // Current research session
  activeSession: {
    id: string | null;
    query: string;
    mode: ResearchModeId;
    status: 'idle' | 'researching' | 'complete' | 'error';
    progress: ResearchProgress | null;
    result: ResearchResponse | null;
    error: string | null;
    startedAt: number | null;
  };

  // Research history (persisted)
  history: ResearchHistoryEntry[];

  // Configuration
  config: ResearchConfig | null;
  availability: ResearchAvailability | null;

  // UI state
  isConfigLoading: boolean;
  isHistoryLoading: boolean;
}

interface ResearchActions {
  // Session actions
  startResearch: (query: string, mode?: ResearchModeId) => Promise<ResearchResponse>;
  cancelResearch: () => Promise<void>;
  resetSession: () => void;

  // Progress handling (called from event listeners)
  updateProgress: (progress: ResearchProgress) => void;
  setError: (error: string) => void;

  // History actions
  addToHistory: (result: ResearchResponse) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;

  // Configuration
  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<ResearchConfig>) => Promise<void>;
  checkAvailability: () => Promise<ResearchAvailability>;

  // Initialization
  initialize: () => Promise<void>;
}

const DEFAULT_CONFIG: ResearchConfig = {
  default_mode: 'standard',
  enable_web_search: true,
  enable_document_search: true,
  enable_email_search: true,
  enable_calendar_search: true,
  enable_memory_search: true,
  min_confidence_threshold: 0.3,
  max_concurrent_agents: 5,
  show_confidence_indicators: true,
  generate_inline_citations: true,
};

export const useResearchStore = create<ResearchState & ResearchActions>()(
  devtools(
    persist(
      immer((set, get) => ({
        // Initial state
        activeSession: {
          id: null,
          query: '',
          mode: 'standard',
          status: 'idle',
          progress: null,
          result: null,
          error: null,
          startedAt: null,
        },
        history: [],
        config: null,
        availability: null,
        isConfigLoading: false,
        isHistoryLoading: false,

        // Session actions
        startResearch: async (query: string, mode?: ResearchModeId) => {
          const researchMode = mode || get().config?.default_mode || 'standard';

          set((state) => {
            state.activeSession = {
              id: null,
              query,
              mode: researchMode,
              status: 'researching',
              progress: null,
              result: null,
              error: null,
              startedAt: Date.now(),
            };
          });

          try {
            const result = await invoke<ResearchResponse>('research_start', {
              request: {
                query,
                mode: researchMode,
              },
            });

            set((state) => {
              state.activeSession.id = result.session_id;
              state.activeSession.status = 'complete';
              state.activeSession.result = result;
            });

            // Add to history
            get().addToHistory(result);

            return result;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Research failed. Please try again.';

            set((state) => {
              state.activeSession.status = 'error';
              state.activeSession.error = errorMessage;
            });

            throw error;
          }
        },

        cancelResearch: async () => {
          const sessionId = get().activeSession.id;
          if (!sessionId) return;

          try {
            await invoke('research_cancel', { session_id: sessionId });
            set((state) => {
              state.activeSession.status = 'idle';
              state.activeSession.progress = null;
            });
          } catch (error) {
            console.error('Failed to cancel research:', error);
          }
        },

        resetSession: () => {
          set((state) => {
            state.activeSession = {
              id: null,
              query: '',
              mode: state.config?.default_mode || 'standard',
              status: 'idle',
              progress: null,
              result: null,
              error: null,
              startedAt: null,
            };
          });
        },

        // Progress handling
        updateProgress: (progress: ResearchProgress) => {
          set((state) => {
            state.activeSession.progress = progress;
            if (progress.session_id && !state.activeSession.id) {
              state.activeSession.id = progress.session_id;
            }
          });
        },

        setError: (error: string) => {
          set((state) => {
            state.activeSession.status = 'error';
            state.activeSession.error = error;
          });
        },

        // History actions
        addToHistory: (result: ResearchResponse) => {
          const entry: ResearchHistoryEntry = {
            id: result.session_id,
            query: result.query,
            mode: result.mode as ResearchModeId,
            timestamp: Date.now(),
            duration_secs: result.duration_secs,
            sources_cited: result.sources_cited,
            confidence: result.confidence,
            summary: result.summary,
            key_findings: result.key_findings,
            report: result.report,
          };

          set((state) => {
            // Keep only last 50 entries
            state.history = [entry, ...state.history].slice(0, 50);
          });
        },

        clearHistory: () => {
          set((state) => {
            state.history = [];
          });
        },

        removeFromHistory: (id: string) => {
          set((state) => {
            state.history = state.history.filter((h) => h.id !== id);
          });
        },

        // Configuration
        loadConfig: async () => {
          set((state) => {
            state.isConfigLoading = true;
          });

          try {
            const config = await invoke<ResearchConfig>('research_get_config');
            set((state) => {
              state.config = config;
              state.isConfigLoading = false;
            });
          } catch (error) {
            console.error('Failed to load research config:', error);
            set((state) => {
              state.config = DEFAULT_CONFIG;
              state.isConfigLoading = false;
            });
          }
        },

        updateConfig: async (configUpdates: Partial<ResearchConfig>) => {
          const currentConfig = get().config || DEFAULT_CONFIG;
          const newConfig = { ...currentConfig, ...configUpdates };

          try {
            await invoke('research_set_config', { config: newConfig });
            set((state) => {
              state.config = newConfig;
            });
          } catch (error) {
            console.error('Failed to update research config:', error);
            throw error;
          }
        },

        checkAvailability: async () => {
          try {
            const availability = await invoke<ResearchAvailability>('research_check_availability');
            set((state) => {
              state.availability = availability;
            });
            return availability;
          } catch (error) {
            console.error('Failed to check research availability:', error);
            const defaultAvailability: ResearchAvailability = {
              available: false,
              sources: {
                web_search: { enabled: false, status: 'unavailable' },
                document_search: { enabled: false, status: 'unavailable' },
                email_search: { enabled: false, status: 'unavailable' },
                calendar_search: { enabled: false, status: 'unavailable' },
                memory_search: { enabled: false, status: 'unavailable' },
              },
              default_mode: 'standard',
            };
            set((state) => {
              state.availability = defaultAvailability;
            });
            return defaultAvailability;
          }
        },

        // Initialization
        initialize: async () => {
          if (!isTauri) return;

          // Load config
          await get().loadConfig();

          // Check availability
          await get().checkAvailability();

          // Set up event listeners
          listen<ResearchProgress>('research:progress', (event) => {
            get().updateProgress(event.payload);
          });

          listen<{ query: string; error: string }>('research:error', (event) => {
            get().setError(event.payload.error);
          });
        },
      })),
      {
        name: 'research-store',
        version: 1,
        partialize: (state) => ({
          history: state.history,
        }),
      },
    ),
    { name: 'ResearchStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors for optimized re-renders
export const selectActiveSession = (state: ResearchState) => state.activeSession;
export const selectHistory = (state: ResearchState) => state.history;
export const selectConfig = (state: ResearchState) => state.config;
export const selectAvailability = (state: ResearchState) => state.availability;
export const selectIsResearching = (state: ResearchState) =>
  state.activeSession.status === 'researching';
export const selectHasResult = (state: ResearchState) =>
  state.activeSession.status === 'complete' && state.activeSession.result !== null;

export default useResearchStore;
