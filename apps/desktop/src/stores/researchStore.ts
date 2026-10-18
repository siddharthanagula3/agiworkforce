import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, isTauri } from '@/lib/tauri-mock';

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

interface ResearchState {
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

  history: ResearchHistoryEntry[];

  config: ResearchConfig | null;

  isHistoryLoading: boolean;
}

interface ResearchActions {
  startResearch: (query: string, mode?: ResearchModeId) => Promise<ResearchResponse>;
  cancelResearch: () => Promise<void>;
  resetSession: () => void;

  updateProgress: (progress: ResearchProgress) => void;
  setError: (error: string) => void;

  addToHistory: (result: ResearchResponse) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;

  loadConfig: () => Promise<void>;

  initialize: () => Promise<void>;
}

let nativeListenersRegistered = false;

const cancelRequestedSessions = new Set<string>();

const DEFAULT_CONFIG: ResearchConfig = {
  default_mode: 'standard',
  enable_web_search: true,
  enable_document_search: true,
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
        isHistoryLoading: false,

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
          cancelRequestedSessions.clear();

          try {
            const result = await invoke<ResearchResponse>('research_start', {
              request: {
                query,
                mode: researchMode,
              },
            });

            if (cancelRequestedSessions.has(result.session_id)) {
              cancelRequestedSessions.delete(result.session_id);
              set((state) => {
                state.activeSession.status = 'idle';
                state.activeSession.progress = null;
                state.activeSession.result = null;
              });
              return result;
            }

            set((state) => {
              state.activeSession.id = result.session_id;
              state.activeSession.status = 'complete';
              state.activeSession.result = result;
            });

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
            await invoke('research_cancel', { sessionId });
            cancelRequestedSessions.add(sessionId);
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

        loadConfig: async () => {
          try {
            const config = await invoke<ResearchConfig>('research_get_config');
            set((state) => {
              state.config = config;
            });
          } catch (error) {
            console.error('Failed to load research config:', error);
            set((state) => {
              state.config = DEFAULT_CONFIG;
            });
          }
        },

        initialize: async () => {
          if (!isTauri) return;

          await get().loadConfig();

          if (nativeListenersRegistered) return;
          nativeListenersRegistered = true;

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

export const selectActiveSession = (state: ResearchState) => state.activeSession;
export const selectHistory = (state: ResearchState) => state.history;
export const selectIsResearching = (state: ResearchState) =>
  state.activeSession.status === 'researching';

export default useResearchStore;
