
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { AgentStatus, AgentCommunication } from '@shared/types';

export interface ChatSession {
  id: string;
  userId: string;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  taskDescription: string;
  agentsInvolved: string[];
  messagesCount: number;
  tokensUsed: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

export interface AgentMetrics {
  totalSessions: number;
  activeSessions: number;
  completedTasks: number;
  failedTasks: number;

  totalAgents: number;
  activeAgents: number;
  idleAgents: number;

  totalTokensUsed: number;
  totalMessagesExchanged: number;
  averageResponseTime: number;

  successRate: number;
  averageTaskDuration: number;

  currentSessions: ChatSession[];
  recentActivity: Array<{
    id: string;
    type: 'session_start' | 'session_end' | 'agent_communication' | 'task_complete' | 'task_failed';
    message: string;
    timestamp: Date;
    agentName?: string;
  }>;

  agentStatuses: Record<string, AgentStatus>;
  agentCommunications: AgentCommunication[];
}

export type AgentActivityType =
  | 'session_start'
  | 'session_end'
  | 'agent_communication'
  | 'task_complete'
  | 'task_failed';

export type SessionStatusType = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface AgentMetricsState extends AgentMetrics {
  startSession: (
    session: Omit<ChatSession, 'id' | 'startTime' | 'lastActivity' | 'isActive'>,
  ) => string;
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  endSession: (sessionId: string, status: 'completed' | 'failed', result?: string) => void;

  updateAgentStatus: (agentName: string, status: AgentStatus) => void;
  addCommunication: (communication: AgentCommunication) => void;

  addActivity: (activity: Omit<AgentMetricsState['recentActivity'][0], 'id' | 'timestamp'>) => void;

  incrementTokens: (amount: number) => void;

  getActiveSessionsCount: () => number;
  getTodayTasksCount: () => number;
  getSuccessRate: () => number;

  isBackgroundServiceRunning: boolean;
  setBackgroundServiceRunning: (running: boolean) => void;

  reset: () => void;
}

const initialState: AgentMetrics = {
  totalSessions: 0,
  activeSessions: 0,
  completedTasks: 0,
  failedTasks: 0,

  totalAgents: 0,
  activeAgents: 0,
  idleAgents: 0,

  totalTokensUsed: 0,
  totalMessagesExchanged: 0,
  averageResponseTime: 0,

  successRate: 0,
  averageTaskDuration: 0,

  currentSessions: [],
  recentActivity: [],

  agentStatuses: {},
  agentCommunications: [],
};

const enableDevtools = process.env.NODE_ENV !== 'production';

export const useAgentMetricsStore = create<AgentMetricsState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,
        isBackgroundServiceRunning: false,

        startSession: (sessionData) => {
          const sessionId = `session-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
          const now = new Date();

          const newSession: ChatSession = {
            ...sessionData,
            id: sessionId,
            startTime: now,
            lastActivity: now,
            isActive: true,
            status: 'in_progress',
            messagesCount: 0,
            tokensUsed: 0,
          };

          set((state) => ({
            totalSessions: state.totalSessions + 1,
            activeSessions: state.activeSessions + 1,
            currentSessions: [...state.currentSessions, newSession],
          }));

          get().addActivity({
            type: 'session_start',
            message: `Started new task: ${sessionData.taskDescription}`,
          });

          return sessionId;
        },

        updateSession: (sessionId, updates) => {
          set((state) => ({
            currentSessions: state.currentSessions.map((session) =>
              session.id === sessionId
                ? { ...session, ...updates, lastActivity: new Date() }
                : session,
            ),
          }));
        },

        endSession: (sessionId, status, result) => {
          const session = get().currentSessions.find((s) => s.id === sessionId);

          if (session) {
            const duration = Date.now() - session.startTime.getTime();

            set((state) => ({
              currentSessions: state.currentSessions.map((s) =>
                s.id === sessionId ? { ...s, isActive: false, status, result } : s,
              ),
              activeSessions: state.activeSessions - 1,
              completedTasks:
                status === 'completed' ? state.completedTasks + 1 : state.completedTasks,
              failedTasks: status === 'failed' ? state.failedTasks + 1 : state.failedTasks,
              averageTaskDuration:
                state.completedTasks > 0
                  ? (state.averageTaskDuration * state.completedTasks + duration) /
                    (state.completedTasks + 1)
                  : duration,
            }));

            get().addActivity({
              type: status === 'completed' ? 'task_complete' : 'task_failed',
              message:
                status === 'completed'
                  ? `Completed task: ${session.taskDescription}`
                  : `Failed task: ${session.taskDescription}`,
            });
          }
        },

        updateAgentStatus: (agentName, status) => {
          set((state) => {
            const newStatuses = {
              ...state.agentStatuses,
              [agentName]: status,
            };

            let activeCount = 0;
            let idleCount = 0;

            Object.values(newStatuses).forEach((s) => {
              if (s.status === 'working' || s.status === 'analyzing') {
                activeCount++;
              } else if (s.status === 'idle') {
                idleCount++;
              }
            });

            return {
              agentStatuses: newStatuses,
              totalAgents: Object.keys(newStatuses).length,
              activeAgents: activeCount,
              idleAgents: idleCount,
            };
          });
        },

        addCommunication: (communication) => {
          set((state) => ({
            agentCommunications: [...state.agentCommunications, communication],
            totalMessagesExchanged: state.totalMessagesExchanged + 1,
          }));

          get().addActivity({
            type: 'agent_communication',
            message: `${communication.from} → ${communication.to}: ${communication.type}`,
            agentName: communication.from,
          });
        },

        addActivity: (activity) => {
          const newActivity = {
            ...activity,
            id: `activity-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
            timestamp: new Date(),
          };

          set((state) => ({
            recentActivity: [newActivity, ...state.recentActivity].slice(0, 50), // Keep last 50
          }));
        },

        incrementTokens: (amount) => {
          set((state) => ({
            totalTokensUsed: state.totalTokensUsed + amount,
          }));
        },

        getActiveSessionsCount: () => {
          return get().currentSessions.filter((s) => s.isActive).length;
        },

        getTodayTasksCount: () => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          return get().currentSessions.filter((s) => {
            const sessionDate = new Date(s.startTime);
            sessionDate.setHours(0, 0, 0, 0);
            return sessionDate.getTime() === today.getTime();
          }).length;
        },

        getSuccessRate: () => {
          const state = get();
          const total = state.completedTasks + state.failedTasks;

          if (total === 0) return 0;

          return (state.completedTasks / total) * 100;
        },

        setBackgroundServiceRunning: (running) => {
          set({ isBackgroundServiceRunning: running });
        },

        reset: () => {
          set({
            ...initialState,
            isBackgroundServiceRunning: false,
          });
        },
      })),
      {
        name: 'agent-metrics-storage',
        partialize: (state) => ({
          totalSessions: state.totalSessions,
          completedTasks: state.completedTasks,
          failedTasks: state.failedTasks,
          totalTokensUsed: state.totalTokensUsed,
          totalMessagesExchanged: state.totalMessagesExchanged,
          currentSessions: state.currentSessions,
          recentActivity: state.recentActivity,
        }),
      },
    ),
    { name: 'AgentMetricsStore', enabled: enableDevtools },
  ),
);

export const useAgentMetricsSummary = () =>
  useAgentMetricsStore((state) => ({
    totalSessions: state.totalSessions,
    activeSessions: state.activeSessions,
    completedTasks: state.completedTasks,
    failedTasks: state.failedTasks,
    successRate:
      state.completedTasks + state.failedTasks > 0
        ? (state.completedTasks / (state.completedTasks + state.failedTasks)) * 100
        : 0,
  }));

export const useCurrentSessions = () => useAgentMetricsStore((state) => state.currentSessions);

export const useActiveSessions = () =>
  useAgentMetricsStore((state) => state.currentSessions.filter((s) => s.isActive));

export const useRecentActivity = () => useAgentMetricsStore((state) => state.recentActivity);

export const useAgentStatuses = () => useAgentMetricsStore((state) => state.agentStatuses);

export const useAgentStatus = (agentName: string) =>
  useAgentMetricsStore((state) => state.agentStatuses[agentName]);

export const useAgentWorkforce = () =>
  useAgentMetricsStore((state) => ({
    totalAgents: state.totalAgents,
    activeAgents: state.activeAgents,
    idleAgents: state.idleAgents,
  }));

export const useTokenMetrics = () =>
  useAgentMetricsStore((state) => ({
    totalTokensUsed: state.totalTokensUsed,
    totalMessagesExchanged: state.totalMessagesExchanged,
  }));

export const useSuccessRate = () =>
  useAgentMetricsStore((state) => {
    const total = state.completedTasks + state.failedTasks;
    return total > 0 ? (state.completedTasks / total) * 100 : 0;
  });

export const useAgentCommunications = () =>
  useAgentMetricsStore((state) => state.agentCommunications);

export const useIsBackgroundServiceRunning = () =>
  useAgentMetricsStore((state) => state.isBackgroundServiceRunning);
