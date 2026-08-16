
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedTo: string | null;
  toolRequired?: string;
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface EmployeeLogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

export interface ActiveEmployee {
  name: string;
  status: 'thinking' | 'using_tool' | 'idle' | 'error';
  currentTool: string | null;
  currentTask: string | null;
  log: EmployeeLogEntry[];
  progress: number;
}

export interface MissionMessage {
  id: string;
  from: string;
  type:
    | 'user'
    | 'system'
    | 'employee'
    | 'agent'
    | 'assistant'
    | 'status'
    | 'task_update'
    | 'plan'
    | 'error';
  content: string;
  timestamp: Date;
  metadata?: {
    taskId?: string;
    employeeName?: string;
    employeeAvatar?: string;
    role?: 'agent' | 'supervisor' | 'user';
    tool?: string;
    model?: string;
    tokens?: number;
    conversationMetadata?: {
      turnCount: number;
      participantCount: number;
      duration: number;
      wasInterrupted: boolean;
      loopDetected: boolean;
    };
    [key: string]: unknown;
  };
}

export type MissionStatusType =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'failed';

export type EmployeeStatusType = 'thinking' | 'using_tool' | 'idle' | 'error';

export type LogEntryType = 'info' | 'warning' | 'error' | 'success';

export type MissionModeType = 'mission' | 'chat';

export interface MissionStateData {
  missionPlan: Task[];
  currentMissionId: string | null;
  missionStatus: MissionStatusType;

  activeEmployees: Record<string, ActiveEmployee>;

  messages: MissionMessage[];

  isOrchestrating: boolean;
  isPaused: boolean;
  error: string | null;

  mode: MissionModeType;
  activeChatSession: string | null;
  collaborativeAgents: string[];
}

export interface MissionState extends MissionStateData {
  setMissionPlan: (plan: Task[]) => void;
  updateTaskStatus: (
    taskId: string,
    status: Task['status'],
    assignedTo?: string,
    result?: string,
    error?: string,
  ) => void;
  updateEmployeeStatus: (
    employeeName: string,
    status: ActiveEmployee['status'],
    currentTool?: string,
    currentTask?: string,
  ) => void;
  addEmployeeLog: (
    employeeName: string,
    message: string,
    type?: 'info' | 'warning' | 'error' | 'success',
  ) => void;
  updateEmployeeProgress: (employeeName: string, progress: number) => void;
  addMessage: (message: Omit<MissionMessage, 'id' | 'timestamp'>) => void;
  setMessages: (messages: MissionMessage[]) => void;
  startMission: (missionId: string, mode?: 'mission' | 'chat') => void;
  pauseMission: () => void;
  resumeMission: () => void;
  completeMission: () => void;
  failMission: (error: string) => void;
  reset: () => void;
  setOrchestrating: (value: boolean) => void;
  cleanupCompletedTasks: () => void;

  setMode: (mode: 'mission' | 'chat') => void;
  setChatSession: (sessionId: string | null) => void;
  addCollaborativeAgent: (agentName: string) => void;
  removeCollaborativeAgent: (agentName: string) => void;
  clearCollaborativeAgents: () => void;
  getAgentStatus: (agentName: string) => ActiveEmployee | undefined;

  _getState: () => MissionStateData;
}

const enableDevtools = process.env.NODE_ENV !== 'production';

export const useMissionStore = create<MissionState>()(
  devtools(
    immer((set) => ({
      missionPlan: [],
      currentMissionId: null,
      missionStatus: 'idle',
      activeEmployees: {},
      messages: [],
      isOrchestrating: false,
      isPaused: false,
      error: null,
      mode: 'mission',
      activeChatSession: null,
      collaborativeAgents: [],

      setMissionPlan: (plan) =>
        set((state) => {
          state.missionPlan = plan;
          state.missionStatus = 'planning';
        }),

      updateTaskStatus: (taskId, status, assignedTo, result, error) =>
        set((state) => {
          const task = state.missionPlan.find((t) => t.id === taskId);
          if (task) {
            task.status = status;
            if (assignedTo) task.assignedTo = assignedTo;
            if (result) task.result = result;
            if (error) task.error = error;
            if (status === 'in_progress' && !task.startedAt) {
              task.startedAt = new Date();
            }
            if ((status === 'completed' || status === 'failed') && !task.completedAt) {
              task.completedAt = new Date();
            }
          }
        }),

      updateEmployeeStatus: (employeeName, status, currentTool, currentTask) =>
        set((state) => {
          let employee = state.activeEmployees[employeeName];
          if (!employee) {
            employee = {
              name: employeeName,
              status,
              currentTool: currentTool || null,
              currentTask: currentTask || null,
              log: [],
              progress: 0,
            };
            state.activeEmployees[employeeName] = employee;
          } else {
            employee.status = status;
            if (currentTool !== undefined) employee.currentTool = currentTool;
            if (currentTask !== undefined) employee.currentTask = currentTask;
          }
        }),

      addEmployeeLog: (
        employeeName: string,
        message: string,
        type: 'info' | 'warning' | 'error' | 'success' = 'info',
      ) =>
        set((state) => {
          const employee = state.activeEmployees[employeeName];
          if (employee) {
            employee.log.push({
              timestamp: new Date(),
              message,
              type,
            });
          }
        }),

      updateEmployeeProgress: (employeeName, progress) =>
        set((state) => {
          const employee = state.activeEmployees[employeeName];
          if (employee) {
            employee.progress = Math.min(100, Math.max(0, progress));
          }
        }),

      addMessage: (message) =>
        set((state) => {
          state.messages.push({
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
          });
        }),

      setMessages: (messages) =>
        set((state) => {
          state.messages = messages;
        }),

      startMission: (missionId, mode = 'mission') =>
        set((state) => {
          if (state.isOrchestrating) {
            throw new Error('Mission already in progress');
          }
          state.currentMissionId = missionId;
          state.missionStatus = 'executing';
          state.isOrchestrating = true;
          state.error = null;
          state.mode = mode;
        }),

      pauseMission: () =>
        set((state) => {
          state.missionStatus = 'paused';
          state.isPaused = true;
        }),

      resumeMission: () =>
        set((state) => {
          state.missionStatus = 'executing';
          state.isPaused = false;
        }),

      completeMission: () =>
        set((state) => {
          state.missionStatus = 'completed';
          state.isOrchestrating = false;
          state.isPaused = false;
        }),

      failMission: (error) =>
        set((state) => {
          state.missionStatus = 'failed';
          state.isOrchestrating = false;
          state.isPaused = false;
          state.error = error;
        }),

      reset: () =>
        set((state) => {
          state.missionPlan = [];
          state.currentMissionId = null;
          state.missionStatus = 'idle';
          state.activeEmployees = {};
          state.messages = [];
          state.isOrchestrating = false;
          state.isPaused = false;
          state.error = null;
          state.mode = 'mission';
          state.activeChatSession = null;
          state.collaborativeAgents = [];
        }),

      setOrchestrating: (value) =>
        set((state) => {
          state.isOrchestrating = value;
        }),

      cleanupCompletedTasks: () =>
        set((state) => {
          const oneHourAgo = Date.now() - 60 * 60 * 1000;

          state.missionPlan = state.missionPlan.filter((task) => {
            if ((task.status === 'completed' || task.status === 'failed') && task.completedAt) {
              return task.completedAt.getTime() > oneHourAgo;
            }
            return true;
          });

          const employeesToRemove: string[] = [];
          Object.entries(state.activeEmployees).forEach(([name, employee]) => {
            if (employee.status === 'idle' || employee.status === 'error') {
              if (employee.log.length > 0) {
                const lastEntry = employee.log[employee.log.length - 1]!;
                const lastLogTime = lastEntry.timestamp.getTime();
                if (lastLogTime < oneHourAgo) {
                  employeesToRemove.push(name);
                }
              }
            }
          });

          employeesToRemove.forEach((name) => {
            delete state.activeEmployees[name];
          });

          if (state.messages.length > 100) {
            state.messages = state.messages.slice(-100);
          }

          void employeesToRemove;
        }),

      setMode: (mode: 'mission' | 'chat') =>
        set((state) => {
          state.mode = mode;
        }),

      setChatSession: (sessionId: string | null) =>
        set((state) => {
          state.activeChatSession = sessionId;
        }),

      addCollaborativeAgent: (agentName: string) =>
        set((state) => {
          if (!state.collaborativeAgents.includes(agentName)) {
            state.collaborativeAgents.push(agentName);
          }
        }),

      removeCollaborativeAgent: (agentName: string) =>
        set((state) => {
          state.collaborativeAgents = state.collaborativeAgents.filter(
            (name) => name !== agentName,
          );
        }),

      clearCollaborativeAgents: () =>
        set((state) => {
          state.collaborativeAgents = [];
        }),

      getAgentStatus: (agentName: string): ActiveEmployee | undefined => {
        return useMissionStore.getState().activeEmployees[agentName];
      },

      _getState: (): MissionStateData => {
        const state = useMissionStore.getState();
        return {
          missionPlan: state.missionPlan,
          currentMissionId: state.currentMissionId,
          missionStatus: state.missionStatus,
          activeEmployees: state.activeEmployees,
          messages: state.messages,
          isOrchestrating: state.isOrchestrating,
          isPaused: state.isPaused,
          error: state.error,
          mode: state.mode,
          activeChatSession: state.activeChatSession,
          collaborativeAgents: state.collaborativeAgents,
        };
      },
    })),
    { name: 'MissionStore', enabled: enableDevtools },
  ),
);

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

export function startMissionCleanupInterval(): void {
  if (typeof window !== 'undefined' && !cleanupIntervalId) {
    cleanupIntervalId = setInterval(
      () => {
        useMissionStore.getState().cleanupCompletedTasks();
      },
      5 * 60 * 1000,
    );
  }
}

export function stopMissionCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

if (typeof window !== 'undefined') {
  startMissionCleanupInterval();

  window.addEventListener('beforeunload', () => {
    stopMissionCleanupInterval();
  });
}

export const useMissionPlan = () => useMissionStore((state) => state.missionPlan);

export const useActiveEmployees = () => useMissionStore((state) => state.activeEmployees);

export const useMissionMessages = () => useMissionStore((state) => state.messages);

export const useMissionStatus = () =>
  useMissionStore(
    useShallow((state) => ({
      status: state.missionStatus,
      isOrchestrating: state.isOrchestrating,
      isPaused: state.isPaused,
      error: state.error,
    })),
  );

export const useCollaborativeMode = () =>
  useMissionStore(
    useShallow((state) => ({
      mode: state.mode,
      activeChatSession: state.activeChatSession,
      collaborativeAgents: state.collaborativeAgents,
    })),
  );

export const useEmployee = (employeeName: string) =>
  useMissionStore((state) => state.activeEmployees[employeeName]);

export const useCurrentMissionId = () => useMissionStore((state) => state.currentMissionId);
