import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { invoke } from '../lib/tauri-mock';

export interface AgentTask {
  id: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  iterations?: number;
  result?: string;
  insights?: string[];
  error?: string;
}

interface AgentTaskState {
  tasks: AgentTask[];
  loading: boolean;
  submitGoal: (
    goal: string,
    options?: { maxIterations?: number; parallel?: boolean },
  ) => Promise<string>;
  fetchTasks: () => Promise<void>;
  getTaskStatus: (taskId: string) => Promise<AgentTask | null>;
  cancelTask: (taskId: string) => Promise<void>;
  fetchInsights: (taskId: string) => Promise<string[]>;
}

interface GoalFromBackend {
  id: string;
  description: string;
  priority: string;
  deadline?: number;
  constraints: string[];
  successCriteria: string[];
}

interface SubmitGoalResponse {
  goalId: string;
}

interface GoalStatusResponse {
  context: {
    currentIteration: number;
    status: string;
    result?: string;
    error?: string;
  };
}

interface ReflectionInsightResponse {
  recommendations: string[];
}

export const useAgentTaskStore = create<AgentTaskState>()(
  devtools(
    persist(
      (set, get) => ({
        tasks: [],
        loading: false,

        submitGoal: async (goal, options = {}) => {
          if (options.parallel) {
            const result = await invoke<{ bestResult: { score: number } }>(
              'agi_submit_goal_parallel',
              {
                request: {
                  description: goal,
                  priority: 'medium',
                  numAgents: options.maxIterations ?? 4,
                },
              },
            );
            const taskId = `parallel_${Date.now()}`;
            set((state) => ({
              tasks: [
                ...state.tasks,
                {
                  id: taskId,
                  goal,
                  status: 'completed' as const,
                  createdAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  result: `Parallel execution complete. Best score: ${result.bestResult.score}`,
                },
              ],
            }));
            return taskId;
          }

          const result = await invoke<SubmitGoalResponse>('agi_submit_goal', {
            request: {
              description: goal,
              priority: 'medium',
            },
          });

          const taskId = result.goalId;

          set((state) => ({
            tasks: [
              ...state.tasks,
              {
                id: taskId,
                goal,
                status: 'pending' as const,
                createdAt: new Date().toISOString(),
              },
            ],
          }));

          return taskId;
        },

        fetchTasks: async () => {
          set({ loading: true });
          try {
            const goals = await invoke<GoalFromBackend[]>('agi_list_goals');
            const existingTasks = get().tasks;

            const updatedTasks = goals.map((g) => {
              const existing = existingTasks.find((t) => t.id === g.id);
              return {
                id: g.id,
                goal: g.description,
                status: (existing?.status ?? 'pending') as AgentTask['status'],
                createdAt: existing?.createdAt ?? new Date().toISOString(),
                completedAt: existing?.completedAt,
                iterations: existing?.iterations,
                result: existing?.result,
                insights: existing?.insights,
                error: existing?.error,
              };
            });

            // Keep local tasks that aren't in backend (e.g. parallel tasks)
            const backendIds = new Set(goals.map((g) => g.id));
            const localOnly = existingTasks.filter((t) => !backendIds.has(t.id));

            set({ tasks: [...updatedTasks, ...localOnly], loading: false });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[AgentTaskStore] Failed to fetch tasks:', err);
            toast.error('Failed to load agent tasks: ' + msg);
            set({ loading: false });
          }
        },

        getTaskStatus: async (taskId) => {
          try {
            const response = await invoke<GoalStatusResponse>('agi_get_goal_status', {
              goalId: taskId,
            });

            const ctx = response.context;
            const statusMap: Record<string, AgentTask['status']> = {
              running: 'running',
              completed: 'completed',
              failed: 'failed',
              cancelled: 'cancelled',
              pending: 'pending',
            };
            const mappedStatus = statusMap[ctx.status] ?? 'pending';

            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      status: mappedStatus,
                      iterations: ctx.currentIteration,
                      result: ctx.result,
                      error: ctx.error,
                      completedAt:
                        mappedStatus === 'completed' || mappedStatus === 'failed'
                          ? (t.completedAt ?? new Date().toISOString())
                          : undefined,
                    }
                  : t,
              ),
            }));

            return get().tasks.find((t) => t.id === taskId) ?? null;
          } catch {
            return null;
          }
        },

        cancelTask: async (taskId) => {
          try {
            await invoke('agi_cancel_goal', { goalId: taskId });
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, status: 'cancelled' as const, completedAt: new Date().toISOString() }
                  : t,
              ),
            }));
          } catch (error) {
            toast.error('Failed to cancel task');
            console.error('[AgentTaskStore] cancelTask error:', error);
          }
        },

        fetchInsights: async (taskId) => {
          try {
            const response = await invoke<ReflectionInsightResponse | null>(
              'agi_get_reflection_insights',
              { goalId: taskId },
            );
            if (response?.recommendations) {
              set((state) => ({
                tasks: state.tasks.map((t) =>
                  t.id === taskId ? { ...t, insights: response.recommendations } : t,
                ),
              }));
              return response.recommendations;
            }
            return [];
          } catch {
            return [];
          }
        },
      }),
      {
        name: 'agiworkforce-agent-tasks',
        partialize: (state) => ({
          tasks: state.tasks.filter((t) => !t.id.startsWith('parallel_')),
        }),
      },
    ),
    { name: 'AgentTaskStore' },
  ),
);
