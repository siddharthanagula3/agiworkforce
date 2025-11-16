import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export interface MessageMetadata {
  tokenCount?: number;
  model?: string;
  provider?: string;
  cost?: number;
  duration?: number;
  streaming?: boolean;
}

export interface Attachment {
  id: string;
  type: 'file' | 'image' | 'screenshot';
  name: string;
  path?: string;
  size?: number;
  mimeType?: string;
  content?: string; // base64 for images
}

export interface Operation {
  id: string;
  type: 'file' | 'terminal' | 'tool' | 'approval';
  timestamp: Date;
  data: any;
}

export interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
  attachments?: Attachment[];
  operations?: Operation[];
  streaming?: boolean;
}

export type FileOperationType = 'read' | 'write' | 'create' | 'delete' | 'move' | 'rename';

export interface FileOperation {
  id: string;
  type: FileOperationType;
  filePath: string;
  oldContent?: string;
  newContent?: string;
  sizeBytes?: number;
  success: boolean;
  error?: string;
  timestamp: Date;
  sessionId?: string;
  agentId?: string;
  goalId?: string;
}

export interface TerminalCommand {
  id: string;
  command: string;
  cwd: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  timestamp: Date;
  sessionId?: string;
  agentId?: string;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  input: any;
  output?: any;
  error?: string;
  duration: number;
  timestamp: Date;
  success: boolean;
}

export interface Screenshot {
  id: string;
  imageBase64: string;
  action?: string;
  elementBounds?: { x: number; y: number; width: number; height: number };
  confidence?: number;
  timestamp: Date;
}

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentGoal?: string;
  currentStep?: string;
  progress: number;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
  startedAt?: Date;
  completedAt?: Date;
}

export type BackgroundTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type BackgroundTaskPriority = 'low' | 'normal' | 'high';

export interface BackgroundTask {
  id: string;
  name: string;
  description?: string;
  status: BackgroundTaskStatus;
  progress: number;
  priority: BackgroundTaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export type ApprovalRiskLevel = 'low' | 'medium' | 'high';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

export interface ApprovalRequest {
  id: string;
  type: 'file_delete' | 'terminal_command' | 'api_call' | 'data_modification';
  description: string;
  riskLevel: ApprovalRiskLevel;
  details: any;
  impact?: string;
  status: ApprovalStatus;
  timeoutSeconds?: number;
  createdAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
}

export interface ContextItem {
  id: string;
  type: 'file' | 'folder' | 'url' | 'selection' | 'clipboard';
  name: string;
  path?: string;
  size?: number;
  icon?: string;
}

export type SidecarSection =
  | 'operations'
  | 'reasoning'
  | 'files'
  | 'terminal'
  | 'tools'
  | 'tasks'
  | 'agents';

export type ConversationMode = 'safe' | 'full_control';

// ============================================================================
// Store State Interface
// ============================================================================

export interface UnifiedChatState {
  // Messages
  messages: EnhancedMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  currentStreamingMessageId: string | null;

  // Operations
  fileOperations: FileOperation[];
  terminalCommands: TerminalCommand[];
  toolExecutions: ToolExecution[];
  screenshots: Screenshot[];

  // Agents
  agents: AgentStatus[];
  agentStatus: AgentStatus | null;

  // Tasks
  backgroundTasks: BackgroundTask[];

  // Approvals
  pendingApprovals: ApprovalRequest[];

  // Context
  activeContext: ContextItem[];

  // Settings
  conversationMode: ConversationMode;

  // UI State
  sidecarOpen: boolean;
  sidecarSection: SidecarSection;
  sidecarWidth: number;
  missionControlOpen: boolean;
  selectedMessage: string | null;

  // Filters
  filters: {
    fileOperations: FileOperationType[];
    terminalStatus: ('success' | 'error')[];
    toolNames: string[];
  };

  // Actions - Messages
  addMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<EnhancedMessage>) => void;
  deleteMessage: (id: string) => void;
  setStreamingMessage: (id: string | null) => void;
  appendToStreamingMessage: (content: string) => void;

  // Actions - Operations
  addFileOperation: (op: Omit<FileOperation, 'timestamp'>) => void;
  addTerminalCommand: (cmd: Omit<TerminalCommand, 'timestamp'>) => void;
  updateTerminalOutput: (payload: {
    command_id: string;
    stdout: string;
    stderr: string;
    exit_code?: number;
    duration_ms: number;
  }) => void;
  addToolExecution: (exec: Omit<ToolExecution, 'timestamp'>) => void;
  addScreenshot: (screenshot: Omit<Screenshot, 'timestamp'>) => void;

  // Actions - Agents & Tasks
  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  setAgentStatus: (status: AgentStatus | null) => void;
  addAgent: (agent: AgentStatus) => void;
  removeAgent: (id: string) => void;
  updateTaskProgress: (id: string, progress: number) => void;
  addBackgroundTask: (task: Omit<BackgroundTask, 'createdAt'>) => void;
  updateBackgroundTask: (id: string, updates: Partial<BackgroundTask>) => void;

  // Actions - Settings
  setConversationMode: (mode: ConversationMode) => void;

  // Actions - Approvals
  addApprovalRequest: (request: Omit<ApprovalRequest, 'createdAt' | 'status'>) => void;
  approveOperation: (id: string) => void;
  rejectOperation: (id: string, reason?: string) => void;

  // Actions - Context
  addContextItem: (item: ContextItem) => void;
  removeContextItem: (id: string) => void;
  clearContext: () => void;

  // Actions - UI State
  setSidecarOpen: (open: boolean) => void;
  setSidecarSection: (section: SidecarSection) => void;
  setSidecarWidth: (width: number) => void;
  setMissionControlOpen: (open: boolean) => void;
  setSelectedMessage: (id: string | null) => void;

  // Actions - Filters
  setFileOperationFilter: (types: FileOperationType[]) => void;
  setTerminalStatusFilter: (statuses: ('success' | 'error')[]) => void;
  setToolNameFilter: (names: string[]) => void;

  // Actions - Utilities
  clearHistory: () => void;
  exportConversation: () => Promise<string>;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useUnifiedChatStore = create<UnifiedChatState>()(
  persist(
    immer((set, get) => ({
      // Initial State
      messages: [],
      isLoading: false,
      isStreaming: false,
      currentStreamingMessageId: null,

      fileOperations: [],
      terminalCommands: [],
      toolExecutions: [],
      screenshots: [],

      agents: [],
      agentStatus: null,
      backgroundTasks: [],
      pendingApprovals: [],

      activeContext: [],

      conversationMode: 'safe',

      sidecarOpen: true,
      sidecarSection: 'operations',
      sidecarWidth: 400,
      missionControlOpen: false,
      selectedMessage: null,

      filters: {
        fileOperations: [],
        terminalStatus: [],
        toolNames: [],
      },

      // Message Actions
      addMessage: (message) =>
        set((state) => {
          const newMessage: EnhancedMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
          };
          state.messages.push(newMessage);
        }),

      updateMessage: (id, updates) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index !== -1 && state.messages[index]) {
            Object.assign(state.messages[index], updates);
          }
        }),

      deleteMessage: (id) =>
        set((state) => {
          state.messages = state.messages.filter((m) => m.id !== id);
        }),

      setStreamingMessage: (id) =>
        set((state) => {
          state.currentStreamingMessageId = id;
          state.isStreaming = id !== null;
        }),

      appendToStreamingMessage: (content) =>
        set((state) => {
          const { currentStreamingMessageId } = state;
          if (currentStreamingMessageId) {
            const index = state.messages.findIndex((m) => m.id === currentStreamingMessageId);
            if (index !== -1 && state.messages[index]) {
              state.messages[index].content += content;
            }
          }
        }),

      // Operation Actions
      addFileOperation: (op) =>
        set((state) => {
          state.fileOperations.push({ ...op, timestamp: new Date() });
        }),

      addTerminalCommand: (cmd) =>
        set((state) => {
          state.terminalCommands.push({ ...cmd, timestamp: new Date() });
        }),

      updateTerminalOutput: (payload) =>
        set((state) => {
          const index = state.terminalCommands.findIndex((cmd) => cmd.id === payload.command_id);
          if (index !== -1 && state.terminalCommands[index]) {
            state.terminalCommands[index].stdout = payload.stdout;
            state.terminalCommands[index].stderr = payload.stderr;
            state.terminalCommands[index].exitCode = payload.exit_code;
            state.terminalCommands[index].duration = payload.duration_ms;
          }
        }),

      addToolExecution: (exec) =>
        set((state) => {
          state.toolExecutions.push({ ...exec, timestamp: new Date() });
        }),

      addScreenshot: (screenshot) =>
        set((state) => {
          state.screenshots.push({ ...screenshot, timestamp: new Date() });
        }),

      // Agent & Task Actions
      updateAgentStatus: (id, status) =>
        set((state) => {
          const index = state.agents.findIndex((a) => a.id === id);
          if (index !== -1 && state.agents[index]) {
            Object.assign(state.agents[index], status);
          }
        }),

      setAgentStatus: (status) =>
        set((state) => {
          state.agentStatus = status;
        }),

      addAgent: (agent) =>
        set((state) => {
          state.agents.push(agent);
        }),

      removeAgent: (id) =>
        set((state) => {
          state.agents = state.agents.filter((a) => a.id !== id);
        }),

      updateTaskProgress: (id, progress) =>
        set((state) => {
          const index = state.backgroundTasks.findIndex((t) => t.id === id);
          if (index !== -1 && state.backgroundTasks[index]) {
            state.backgroundTasks[index].progress = progress;
          }
        }),

      addBackgroundTask: (task) =>
        set((state) => {
          state.backgroundTasks.push({ ...task, createdAt: new Date() });
        }),

      updateBackgroundTask: (id, updates) =>
        set((state) => {
          const index = state.backgroundTasks.findIndex((t) => t.id === id);
          if (index !== -1 && state.backgroundTasks[index]) {
            Object.assign(state.backgroundTasks[index], updates);
          }
        }),

      // Settings Actions
      setConversationMode: (mode) =>
        set((state) => {
          state.conversationMode = mode;
        }),

      // Approval Actions
      addApprovalRequest: (request) =>
        set((state) => {
          state.pendingApprovals.push({
            ...request,
            createdAt: new Date(),
            status: 'pending',
          });
        }),

      approveOperation: (id) =>
        set((state) => {
          const index = state.pendingApprovals.findIndex((a) => a.id === id);
          if (index !== -1 && state.pendingApprovals[index]) {
            state.pendingApprovals[index].status = 'approved';
            state.pendingApprovals[index].approvedAt = new Date();
          }
        }),

      rejectOperation: (id, reason) =>
        set((state) => {
          const index = state.pendingApprovals.findIndex((a) => a.id === id);
          if (index !== -1 && state.pendingApprovals[index]) {
            state.pendingApprovals[index].status = 'rejected';
            state.pendingApprovals[index].rejectedAt = new Date();
            state.pendingApprovals[index].rejectionReason = reason;
          }
        }),

      // Context Actions
      addContextItem: (item) =>
        set((state) => {
          state.activeContext.push(item);
        }),

      removeContextItem: (id) =>
        set((state) => {
          state.activeContext = state.activeContext.filter((item) => item.id !== id);
        }),

      clearContext: () =>
        set((state) => {
          state.activeContext = [];
        }),

      // UI Actions
      setSidecarOpen: (open) =>
        set((state) => {
          state.sidecarOpen = open;
        }),

      setSidecarSection: (section) =>
        set((state) => {
          state.sidecarSection = section;
        }),

      setSidecarWidth: (width) =>
        set((state) => {
          state.sidecarWidth = width;
        }),

      setMissionControlOpen: (open) =>
        set((state) => {
          state.missionControlOpen = open;
        }),

      setSelectedMessage: (id) =>
        set((state) => {
          state.selectedMessage = id;
        }),

      // Filter Actions
      setFileOperationFilter: (types) =>
        set((state) => {
          state.filters.fileOperations = types;
        }),

      setTerminalStatusFilter: (statuses) =>
        set((state) => {
          state.filters.terminalStatus = statuses;
        }),

      setToolNameFilter: (names) =>
        set((state) => {
          state.filters.toolNames = names;
        }),

      // Utility Actions
      clearHistory: () =>
        set((state) => {
          state.messages = [];
          state.fileOperations = [];
          state.terminalCommands = [];
          state.toolExecutions = [];
          state.screenshots = [];
        }),

      exportConversation: async () => {
        const state = get();
        const conversationData = {
          messages: state.messages,
          fileOperations: state.fileOperations,
          terminalCommands: state.terminalCommands,
          toolExecutions: state.toolExecutions,
          screenshots: state.screenshots,
          exportedAt: new Date().toISOString(),
        };
        return JSON.stringify(conversationData, null, 2);
      },
    })),
    {
      name: 'unified-chat-storage',
      partialize: (state) => ({
        sidecarOpen: state.sidecarOpen,
        sidecarSection: state.sidecarSection,
        sidecarWidth: state.sidecarWidth,
        filters: state.filters,
      }),
    },
  ),
);
