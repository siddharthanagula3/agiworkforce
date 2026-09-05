import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import type { AgentStatus } from '@shared/types';

export interface TokenUsageByModel {
  [model: string]: {
    provider: 'anthropic' | 'openai' | 'google' | 'perplexity';
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    callCount: number;
  };
}

export interface AgentAssignment {
  agentId: string;
  agentName: string;
  role: string;
  provider: string;
  status: AgentStatus['status'];
  currentTask?: string;
  progress: number;
  toolsUsing?: string[];
  output?: string;
  error?: string;
}

export interface HubMessage {
  id: string;
  sessionId: string;
  from: string;
  to?: string;
  type: 'user' | 'agent' | 'system' | 'handoff' | 'completion' | 'error' | 'upsell';
  content: string;
  timestamp: Date;
  metadata?: {
    agentId?: string;
    taskId?: string;
    provider?: string;
    model?: string;
  };
}

export interface UpsellRequest {
  id: string;
  requiredEmployeeId: string;
  requiredEmployeeName: string;
  requiredEmployeeRole: string;
  provider: string;
  price: number;
  reason: string;
  taskDescription: string;
  isResolved: boolean;
  userResponse?: 'approved' | 'denied';
  timestamp: Date;
}

export interface CompanyHubSession {
  id: string;
  userId: string;
  taskDescription: string;
  assignedAgents: AgentAssignment[];
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CompanyHubState {
  activeSessionId: string | null;
  sessions: Record<string, CompanyHubSession>;

  assignedAgents: Record<string, AgentAssignment>;
  agentStatuses: Record<string, AgentStatus>;

  tokenUsage: TokenUsageByModel;
  sessionTokens: number;
  sessionCost: number;

  messages: HubMessage[];

  upsellQueue: UpsellRequest[];
  pendingUpsell: UpsellRequest | null;

  isOrchestrating: boolean;
  isPaused: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export interface CompanyHubActions {
  createSession: (userId: string, taskDescription: string) => string;
  setActiveSession: (sessionId: string | null) => void;
  updateSessionStatus: (sessionId: string, status: CompanyHubSession['status']) => void;
  completeSession: (sessionId: string) => void;

  assignAgent: (agent: AgentAssignment) => void;
  updateAgentStatus: (agentId: string, status: Partial<AgentStatus>) => void;
  removeAgent: (agentId: string) => void;
  clearAgents: () => void;

  updateTokenUsage: (usage: Partial<TokenUsageByModel>) => void;
  addTokens: (model: string, tokens: number, cost: number, provider: string) => void;
  resetTokenUsage: () => void;

  addMessage: (message: Omit<HubMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  addUpsellRequest: (request: Omit<UpsellRequest, 'id' | 'timestamp' | 'isResolved'>) => void;
  resolveUpsell: (requestId: string, response: 'approved' | 'denied') => void;
  setPendingUpsell: (request: UpsellRequest | null) => void;

  startOrchestration: () => void;
  pauseOrchestration: () => void;
  resumeOrchestration: () => void;
  stopOrchestration: () => void;

  setError: (error: string | null) => void;
  reset: () => void;
}

export interface CompanyHubStore extends CompanyHubState, CompanyHubActions {}

const INITIAL_STATE: CompanyHubState = {
  activeSessionId: null,
  sessions: {},
  assignedAgents: {},
  agentStatuses: {},
  tokenUsage: {},
  sessionTokens: 0,
  sessionCost: 0,
  messages: [],
  upsellQueue: [],
  pendingUpsell: null,
  isOrchestrating: false,
  isPaused: false,
  error: null,
  lastUpdate: null,
};

const enableDevtools = process.env.NODE_ENV !== 'production';

export const useCompanyHubStore = create<CompanyHubStore>()(
  devtools(
    persist(
      immer((set, _get) => ({
        ...INITIAL_STATE,

        createSession: (userId: string, taskDescription: string) => {
          const sessionId = crypto.randomUUID();
          const now = new Date();

          set((state) => {
            const session: CompanyHubSession = {
              id: sessionId,
              userId,
              taskDescription,
              assignedAgents: [],
              status: 'planning',
              createdAt: now,
              updatedAt: now,
            };

            state.sessions[sessionId] = session;
            state.activeSessionId = sessionId;
            state.lastUpdate = now;
          });

          return sessionId;
        },

        setActiveSession: (sessionId: string | null) => {
          set((state) => {
            state.activeSessionId = sessionId;
            state.lastUpdate = new Date();
          });
        },

        updateSessionStatus: (sessionId: string, status: CompanyHubSession['status']) => {
          set((state) => {
            if (state.sessions[sessionId]) {
              state.sessions[sessionId].status = status;
              state.sessions[sessionId].updatedAt = new Date();
            }
          });
        },

        completeSession: (sessionId: string) => {
          set((state) => {
            if (state.sessions[sessionId]) {
              state.sessions[sessionId].status = 'completed';
              state.sessions[sessionId].completedAt = new Date();
              state.sessions[sessionId].updatedAt = new Date();
              state.isOrchestrating = false;
            }
          });
        },

        assignAgent: (agent: AgentAssignment) => {
          set((state) => {
            const existingAgent = state.assignedAgents[agent.agentId];
            if (
              existingAgent &&
              existingAgent.status === agent.status &&
              existingAgent.progress === agent.progress &&
              existingAgent.currentTask === agent.currentTask
            ) {
              return;
            }

            state.assignedAgents[agent.agentId] = agent;
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                const existingIndex = session.assignedAgents.findIndex(
                  (a) => a.agentId === agent.agentId,
                );
                if (existingIndex >= 0) {
                  session.assignedAgents[existingIndex] = agent;
                } else {
                  session.assignedAgents.push(agent);
                }
                session.updatedAt = new Date();
              }
            }
          });
        },

        updateAgentStatus: (agentId: string, status: Partial<AgentStatus>) => {
          set((state) => {
            const agent = state.assignedAgents[agentId];
            if (agent) {
              const { status: newStatus, currentTask, toolsUsing, output } = status;
              const updatedAgent: AgentAssignment = {
                ...agent,
                ...(newStatus !== undefined && { status: newStatus }),
                ...(currentTask !== undefined && { currentTask }),
                ...(toolsUsing !== undefined && { toolsUsing }),
                ...(output !== undefined && { output: String(output) }),
              };

              state.assignedAgents[agentId] = updatedAgent as (typeof state.assignedAgents)[string];

              if (state.activeSessionId) {
                const session = state.sessions[state.activeSessionId];
                if (session) {
                  const sessionAgentIndex = session.assignedAgents.findIndex(
                    (a) => a.agentId === agentId,
                  );
                  if (sessionAgentIndex >= 0) {
                    session.assignedAgents[sessionAgentIndex] = updatedAgent as AgentAssignment;
                  }
                }
              }

              state.lastUpdate = new Date();
            }

            const existingStatus = state.agentStatuses[agentId];
            if (existingStatus) {
              state.agentStatuses[agentId] = {
                ...existingStatus,
                ...status,
              } as AgentStatus;
            } else if (agent) {
              state.agentStatuses[agentId] = status as AgentStatus;
            }
          });
        },

        removeAgent: (agentId: string) => {
          set((state) => {
            delete state.assignedAgents[agentId];
            delete state.agentStatuses[agentId];
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                session.assignedAgents = session.assignedAgents.filter(
                  (a) => a.agentId !== agentId,
                );
                session.updatedAt = new Date();
              }
            }
          });
        },

        clearAgents: () => {
          set((state) => {
            state.assignedAgents = {};
            state.agentStatuses = {};
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                session.assignedAgents = [];
                session.updatedAt = new Date();
              }
            }
          });
        },

        updateTokenUsage: (usage: Partial<TokenUsageByModel>) => {
          set((state) => {
            Object.entries(usage).forEach(([model, stats]) => {
              if (!stats) return;
              if (state.tokenUsage[model]) {
                state.tokenUsage[model].totalTokens += stats.totalTokens;
                state.tokenUsage[model].cost += stats.cost;
                state.tokenUsage[model].callCount += stats.callCount || 1;
              } else {
                state.tokenUsage[model] = { ...stats } as TokenUsageByModel[string];
              }
            });

            state.sessionTokens = Object.values(state.tokenUsage).reduce(
              (sum, stat) => sum + stat.totalTokens,
              0,
            );
            state.sessionCost = Object.values(state.tokenUsage).reduce(
              (sum, stat) => sum + stat.cost,
              0,
            );
            state.lastUpdate = new Date();
          });
        },

        addTokens: (model: string, tokens: number, cost: number, provider: string) => {
          set((state) => {
            if (!state.tokenUsage[model]) {
              state.tokenUsage[model] = {
                provider: provider as 'anthropic' | 'openai' | 'google' | 'perplexity',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                cost: 0,
                callCount: 0,
              };
            }

            state.tokenUsage[model].totalTokens += tokens;
            state.tokenUsage[model].cost += cost;
            state.tokenUsage[model].callCount += 1;

            state.sessionTokens += tokens;
            state.sessionCost += cost;
            state.lastUpdate = new Date();
          });
        },

        resetTokenUsage: () => {
          set((state) => {
            state.tokenUsage = {};
            state.sessionTokens = 0;
            state.sessionCost = 0;
            state.lastUpdate = new Date();
          });
        },

        addMessage: (message: Omit<HubMessage, 'id' | 'timestamp'>) => {
          set((state) => {
            const newMessage: HubMessage = {
              ...message,
              id: crypto.randomUUID(),
              timestamp: new Date(),
            };

            state.messages.push(newMessage);
            state.lastUpdate = new Date();
          });
        },

        clearMessages: () => {
          set((state) => {
            state.messages = [];
            state.lastUpdate = new Date();
          });
        },

        addUpsellRequest: (request: Omit<UpsellRequest, 'id' | 'timestamp' | 'isResolved'>) => {
          set((state) => {
            const newRequest: UpsellRequest = {
              ...request,
              id: crypto.randomUUID(),
              timestamp: new Date(),
              isResolved: false,
            };

            state.upsellQueue.push(newRequest);
            state.pendingUpsell = newRequest;
            state.isPaused = true;
            state.lastUpdate = new Date();
          });
        },

        resolveUpsell: (requestId: string, response: 'approved' | 'denied') => {
          set((state) => {
            const request = state.upsellQueue.find((r) => r.id === requestId);
            if (request) {
              request.isResolved = true;
              request.userResponse = response;
            }

            state.pendingUpsell = null;
            state.isPaused = false;
            state.lastUpdate = new Date();
          });
        },

        setPendingUpsell: (request: UpsellRequest | null) => {
          set((state) => {
            state.pendingUpsell = request;
            state.isPaused = request !== null;
          });
        },

        startOrchestration: () => {
          set((state) => {
            state.isOrchestrating = true;
            state.isPaused = false;
            state.error = null;
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                session.status = 'executing';
                session.updatedAt = new Date();
              }
            }
          });
        },

        pauseOrchestration: () => {
          set((state) => {
            state.isPaused = true;
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                session.status = 'paused';
                session.updatedAt = new Date();
              }
            }
          });
        },

        resumeOrchestration: () => {
          set((state) => {
            state.isPaused = false;
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                session.status = 'executing';
                session.updatedAt = new Date();
              }
            }
          });
        },

        stopOrchestration: () => {
          set((state) => {
            state.isOrchestrating = false;
            state.isPaused = false;
            state.lastUpdate = new Date();

            if (state.activeSessionId) {
              const session = state.sessions[state.activeSessionId];
              if (session) {
                session.status = 'completed';
                session.completedAt = new Date();
                session.updatedAt = new Date();
              }
            }
          });
        },

        setError: (error: string | null) => {
          set((state) => {
            state.error = error;
            if (error) {
              state.isOrchestrating = false;
              if (state.activeSessionId) {
                const session = state.sessions[state.activeSessionId];
                if (session) {
                  session.status = 'failed';
                  session.updatedAt = new Date();
                }
              }
            }
          });
        },

        reset: () => {
          set(() => ({ ...INITIAL_STATE }));
        },
      })),
      {
        name: 'agi-company-hub-store',
        version: 1,
        migrate: (persisted) => persisted,
        partialize: (state) => ({
          sessions: state.sessions,
          activeSessionId: state.activeSessionId,
        }),
      },
    ),
    {
      name: 'Company Hub Store',
      enabled: enableDevtools,
    },
  ),
);

export const useActiveSession = () =>
  useCompanyHubStore((state) =>
    state.activeSessionId ? state.sessions[state.activeSessionId] : null,
  );

export const useAssignedAgentsRecord = () => useCompanyHubStore((state) => state.assignedAgents);

export const useAssignedAgents = () =>
  useCompanyHubStore((state) => Object.values(state.assignedAgents));

export const useAssignedAgent = (agentId: string) =>
  useCompanyHubStore((state) => state.assignedAgents[agentId]);

export const useTokenUsage = () =>
  useCompanyHubStore(
    useShallow((state) => ({
      byModel: state.tokenUsage,
      totalTokens: state.sessionTokens,
      totalCost: state.sessionCost,
    })),
  );

export const useHubMessages = () => useCompanyHubStore((state) => state.messages);

export const usePendingUpsell = () => useCompanyHubStore((state) => state.pendingUpsell);

export const useOrchestrationStatus = () =>
  useCompanyHubStore(
    useShallow((state) => ({
      isOrchestrating: state.isOrchestrating,
      isPaused: state.isPaused,
      error: state.error,
    })),
  );

export const useActiveSessionId = () => useCompanyHubStore((state) => state.activeSessionId);

export const useUpsellQueue = () => useCompanyHubStore((state) => state.upsellQueue);

export const useLastUpdate = () => useCompanyHubStore((state) => state.lastUpdate);
