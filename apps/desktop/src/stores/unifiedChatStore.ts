import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { invoke, isTauri } from '../lib/tauri-mock';

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

export type ActionLogEntryType =
  | 'plan'
  | 'terminal'
  | 'filesystem'
  | 'browser'
  | 'ui'
  | 'mcp'
  | 'approval'
  | 'metrics';

export type ActionLogStatus = 'pending' | 'running' | 'success' | 'failed' | 'blocked';

export type ApprovalScopeType = 'terminal' | 'filesystem' | 'browser' | 'ui' | 'mcp';

export interface ApprovalScope {
  type: ApprovalScopeType;
  command?: string;
  cwd?: string;
  path?: string;
  domain?: string;
  description?: string;
  risk: ApprovalRiskLevel;
}

export interface ActionLogEntry {
  id: string;
  actionId?: string;
  workflowHash?: string;
  type: ActionLogEntryType;
  title: string;
  description?: string;
  status: ActionLogStatus;
  createdAt: Date;
  updatedAt: Date;
  requiresApproval?: boolean;
  scope?: ApprovalScope;
  metadata?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: ActionLogStatus;
  parentId?: string;
  result?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  lastMessage?: string;
  updatedAt: Date;
}

export interface PlanData {
  id: string;
  description: string;
  steps: PlanStep[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TrustedWorkflow {
  hash: string;
  label?: string;
  createdAt: Date;
  actionSignatures: string[];
}

export interface WorkflowContext {
  hash: string;
  description?: string;
  entryPoint?: string;
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
  error?: string;
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
  details: Record<string, unknown>;
  impact?: string;
  status: ApprovalStatus;
  timeoutSeconds?: number;
  createdAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  workflowHash?: string;
  actionId?: string;
  scope?: ApprovalScope;
  actionSignature?: string;
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
  | 'approvals'
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
  // Conversations
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, EnhancedMessage[]>;

  // Messages (active conversation view)
  messages: EnhancedMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  currentStreamingMessageId: string | null;

  // Operations
  fileOperations: FileOperation[];
  terminalCommands: TerminalCommand[];
  toolExecutions: ToolExecution[];
  screenshots: Screenshot[];
  actionLog: ActionLogEntry[];

  // Agents
  agents: AgentStatus[];
  agentStatus: AgentStatus | null;

  // Tasks
  backgroundTasks: BackgroundTask[];

  // Approvals & Trust
  pendingApprovals: ApprovalRequest[];
  trustedWorkflows: Record<string, TrustedWorkflow>;

  // Context
  activeContext: ContextItem[];
  workflowContext: WorkflowContext | null;
  plan: PlanData | null;

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

  // Actions - Conversations
  ensureActiveConversation: () => void;
  createConversation: (title?: string) => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  togglePinnedConversation: (id: string) => void;

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
  addActionLogEntry: (entry: Omit<ActionLogEntry, 'createdAt' | 'updatedAt'>) => void;
  updateActionLogEntry: (id: string, updates: Partial<ActionLogEntry>) => void;
  clearActionLog: () => void;

  // Actions - Agents & Tasks
  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  setAgentStatus: (status: AgentStatus | null) => void;
  addAgent: (agent: AgentStatus) => void;
  removeAgent: (id: string) => void;
  updateTaskProgress: (id: string, progress: number) => void;
  addBackgroundTask: (task: Omit<BackgroundTask, 'createdAt'>) => void;
  updateBackgroundTask: (id: string, updates: Partial<BackgroundTask>) => void;

  // Actions - Plan & Workflow
  setWorkflowContext: (context: WorkflowContext | null) => void;
  setPlan: (plan: PlanData | null) => void;
  updatePlanStep: (stepId: string, updates: Partial<PlanStep>) => void;
  clearPlan: () => void;

  // Actions - Settings
  setConversationMode: (mode: ConversationMode) => void;

  // Actions - Approvals & Trust
  addApprovalRequest: (request: Omit<ApprovalRequest, 'createdAt' | 'status'>) => void;
  approveOperation: (id: string) => void;
  rejectOperation: (id: string, reason?: string) => void;
  removeApprovalRequest: (id: string) => void;
  setTrustedWorkflow: (workflow: TrustedWorkflow) => void;
  removeTrustedWorkflow: (hash: string) => void;
  recordTrustedAction: (hash: string, signature: string) => void;
  isActionTrusted: (hash: string | undefined, signature: string | undefined) => boolean;

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
      conversations: [],
      activeConversationId: null,
      messagesByConversation: {},
      messages: [],
      isLoading: false,
      isStreaming: false,
      currentStreamingMessageId: null,

      fileOperations: [],
      terminalCommands: [],
      toolExecutions: [],
      screenshots: [],
      actionLog: [],

      agents: [],
      agentStatus: null,
      backgroundTasks: [],
      pendingApprovals: [],
      trustedWorkflows: {},

      activeContext: [],
      workflowContext: null,
      plan: null,

      conversationMode: 'safe',

      sidecarOpen: false,
      sidecarSection: 'operations',
      sidecarWidth: 400,
      missionControlOpen: false,
      selectedMessage: null,

      filters: {
        fileOperations: [],
        terminalStatus: [],
        toolNames: [],
      },

      // Conversation Actions
      ensureActiveConversation: () =>
        set((state) => {
          if (state.activeConversationId) {
            const existing = state.messagesByConversation[state.activeConversationId];
            if (existing && state.messages.length === 0) {
              state.messages = existing.slice();
            }
            return;
          }
          const id = crypto.randomUUID();
          const created: ConversationSummary = {
            id,
            title: 'New chat',
            pinned: false,
            lastMessage: '',
            updatedAt: new Date(),
          };
          state.conversations.unshift(created);
          state.activeConversationId = id;
          state.messagesByConversation[id] = [];
          state.messages = [];
        }),

      createConversation: (title = 'New chat') => {
        const id = crypto.randomUUID();
        set((state) => {
          const convo: ConversationSummary = {
            id,
            title,
            pinned: false,
            lastMessage: '',
            updatedAt: new Date(),
          };
          state.conversations.unshift(convo);
          state.activeConversationId = id;
          state.messagesByConversation[id] = [];
          state.messages = [];
          state.isStreaming = false;
          state.currentStreamingMessageId = null;
        });
        return id;
      },

      selectConversation: (id: string) =>
        set((state) => {
          if (state.activeConversationId === id) return;
          state.activeConversationId = id;
          state.messages = state.messagesByConversation[id]?.slice() ?? [];
          state.isStreaming = false;
          state.currentStreamingMessageId = null;
        }),

      renameConversation: (id: string, title: string) =>
        set((state) => {
          const convo = state.conversations.find((c) => c.id === id);
          if (convo) {
            convo.title = title.trim() || convo.title;
            convo.updatedAt = new Date();
          }
        }),

      deleteConversation: (id: string) =>
        set((state) => {
          state.conversations = state.conversations.filter((c) => c.id !== id);
          delete state.messagesByConversation[id];
          if (state.activeConversationId === id) {
            const next = state.conversations[0];
            state.activeConversationId = next ? next.id : null;
            state.messages = next ? (state.messagesByConversation[next.id] ?? []) : [];
          }
        }),

      togglePinnedConversation: (id: string) =>
        set((state) => {
          const convo = state.conversations.find((c) => c.id === id);
          if (convo) {
            convo.pinned = !convo.pinned;
            convo.updatedAt = new Date();
          }
        }),

      // Message Actions
      addMessage: (message) =>
        set((state) => {
          // ensure a conversation is active
          if (!state.activeConversationId) {
            const id = crypto.randomUUID();
            const convo: ConversationSummary = {
              id,
              title: 'New chat',
              pinned: false,
              lastMessage: '',
              updatedAt: new Date(),
            };
            state.conversations.unshift(convo);
            state.activeConversationId = id;
            state.messagesByConversation[id] = [];
          }
          const convoId = state.activeConversationId as string;
          const newMessage: EnhancedMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
          };
          state.messages.push(newMessage);
          if (!state.messagesByConversation[convoId]) {
            state.messagesByConversation[convoId] = [];
          }
          state.messagesByConversation[convoId].push(newMessage);
          const convo = state.conversations.find((c) => c.id === convoId);
          if (convo) {
            convo.lastMessage = newMessage.content;
            convo.updatedAt = newMessage.timestamp;
          }
        }),

      updateMessage: (id, updates) =>
        set((state) => {
          const applyUpdate = (list: EnhancedMessage[]) => {
            const idx = list.findIndex((m) => m.id === id);
            if (idx !== -1 && list[idx]) {
              Object.assign(list[idx], updates);
            }
          };
          applyUpdate(state.messages);
          const convoId = state.activeConversationId;
          if (convoId && state.messagesByConversation[convoId]) {
            applyUpdate(state.messagesByConversation[convoId]);
          }
        }),

      deleteMessage: (id) =>
        set((state) => {
          state.messages = state.messages.filter((m) => m.id !== id);
          const convoId = state.activeConversationId;
          if (convoId && state.messagesByConversation[convoId]) {
            state.messagesByConversation[convoId] = state.messagesByConversation[convoId].filter(
              (m) => m.id !== id,
            );
          }
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

      addActionLogEntry: (entry) =>
        set((state) => {
          const now = new Date();
          state.actionLog.unshift({
            ...entry,
            createdAt: now,
            updatedAt: now,
          });
          if (state.actionLog.length > 500) {
            state.actionLog = state.actionLog.slice(0, 500);
          }
        }),

      updateActionLogEntry: (id, updates) =>
        set((state) => {
          const index = state.actionLog.findIndex((item) => item.id === id || item.actionId === id);
          if (index !== -1 && state.actionLog[index]) {
            state.actionLog[index] = {
              ...state.actionLog[index],
              ...updates,
              updatedAt: new Date(),
            };
          }
        }),

      clearActionLog: () =>
        set((state) => {
          state.actionLog = [];
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

      setWorkflowContext: (context) =>
        set((state) => {
          state.workflowContext = context;
        }),

      setPlan: (plan) =>
        set((state) => {
          if (!plan) {
            state.plan = null;
            return;
          }

          const normalizeDate = (value?: Date | string | number) => {
            if (!value) return new Date();
            if (value instanceof Date) return value;
            const numeric = typeof value === 'number' ? value : Number(value);
            if (Number.isNaN(numeric)) return new Date();
            return new Date(numeric);
          };

          state.plan = {
            ...plan,
            createdAt: normalizeDate(plan.createdAt),
            updatedAt: new Date(),
            steps:
              plan.steps?.map((step) => ({
                ...step,
                status: step.status ?? 'pending',
              })) ?? [],
          };
        }),

      updatePlanStep: (stepId, updates) =>
        set((state) => {
          if (!state.plan) {
            return;
          }

          const index = state.plan.steps.findIndex((step) => step.id === stepId);
          if (index !== -1 && state.plan.steps[index]) {
            state.plan.steps[index] = {
              ...state.plan.steps[index],
              ...updates,
            };
            state.plan.updatedAt = new Date();
          }
        }),

      clearPlan: () =>
        set((state) => {
          state.plan = null;
        }),

      // Settings Actions
      setConversationMode: (mode) =>
        set((state) => {
          state.conversationMode = mode;
        }),

      // Approval Actions
      addApprovalRequest: (request) =>
        set((state) => {
          const normalized = {
            ...request,
            details: request.details ?? {},
            createdAt: new Date(),
            status: 'pending' as ApprovalStatus,
          };
          const index = state.pendingApprovals.findIndex((approval) => approval.id === request.id);
          if (index !== -1) {
            state.pendingApprovals[index] = normalized;
          } else {
            state.pendingApprovals.push(normalized);
          }
        }),

      approveOperation: (id) =>
        set((state) => {
          const index = state.pendingApprovals.findIndex((a) => a.id === id);
          if (index !== -1 && state.pendingApprovals[index]) {
            state.pendingApprovals[index].status = 'approved';
            state.pendingApprovals[index].approvedAt = new Date();
            state.pendingApprovals.splice(index, 1);
          }
        }),

      rejectOperation: (id, reason) =>
        set((state) => {
          const index = state.pendingApprovals.findIndex((a) => a.id === id);
          if (index !== -1 && state.pendingApprovals[index]) {
            state.pendingApprovals[index].status = 'rejected';
            state.pendingApprovals[index].rejectedAt = new Date();
            state.pendingApprovals[index].rejectionReason = reason;
            state.pendingApprovals.splice(index, 1);
          }
        }),

      removeApprovalRequest: (id) =>
        set((state) => {
          state.pendingApprovals = state.pendingApprovals.filter((approval) => approval.id !== id);
        }),

      setTrustedWorkflow: (workflow) =>
        set((state) => {
          state.trustedWorkflows[workflow.hash] = {
            ...workflow,
            actionSignatures: workflow.actionSignatures ?? [],
            createdAt: workflow.createdAt ?? new Date(),
          };
        }),

      removeTrustedWorkflow: (hash) =>
        set((state) => {
          delete state.trustedWorkflows[hash];
        }),

      recordTrustedAction: (hash, signature) =>
        set((state) => {
          if (!hash || !signature) {
            return;
          }
          const workflow =
            state.trustedWorkflows[hash] ??
            ({
              hash,
              createdAt: new Date(),
              actionSignatures: [],
            } as TrustedWorkflow);
          if (!workflow.actionSignatures.includes(signature)) {
            workflow.actionSignatures.push(signature);
          }
          state.trustedWorkflows[hash] = workflow;
        }),

      isActionTrusted: (hash, signature) => {
        if (!hash || !signature) {
          return false;
        }
        const workflow = get().trustedWorkflows[hash];
        return Boolean(workflow?.actionSignatures.includes(signature));
      },

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
          const newId = crypto.randomUUID();
          const convo: ConversationSummary = {
            id: newId,
            title: 'New chat',
            pinned: false,
            lastMessage: '',
            updatedAt: new Date(),
          };
          state.conversations.unshift(convo);
          state.activeConversationId = newId;
          state.messages = [];
          state.messagesByConversation[newId] = [];
          state.fileOperations = [];
          state.terminalCommands = [];
          state.toolExecutions = [];
          state.screenshots = [];
          state.actionLog = [];
          state.plan = null;
          state.isStreaming = false;
          state.currentStreamingMessageId = null;
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
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        messagesByConversation: state.messagesByConversation,
        sidecarOpen: state.sidecarOpen,
        sidecarSection: state.sidecarSection,
        sidecarWidth: state.sidecarWidth,
        filters: state.filters,
      }),
    },
  ),
);

export type AgentStatusPayload = Partial<AgentStatus> & {
  id: string;
  status?: AgentStatus['status'] | string;
  current_goal?: string;
  current_step?: string;
  started_at?: number | string | Date;
  completed_at?: number | string | Date;
  resource_usage?: { cpu: number; memory: number };
};

let agentStatusListenerInitialized = false;

export async function initializeAgentStatusListener() {
  if (agentStatusListenerInitialized || !isTauri) {
    return;
  }

  agentStatusListenerInitialized = true;

  try {
    await bootstrapAgentStatuses();
    const { listen } = await import('@tauri-apps/api/event');
    await listen<AgentStatusPayload>('agent:status:update', (event) => {
      applyAgentStatusUpdate(event.payload);
    });
  } catch (error) {
    agentStatusListenerInitialized = false;
    console.error('[UnifiedChatStore] Failed to initialize agent status listener:', error);
  }
}

async function bootstrapAgentStatuses() {
  try {
    const agents = await invoke<AgentStatusPayload[]>('refresh_agent_status');
    applyAgentStatusSnapshot(Array.isArray(agents) ? agents : []);
  } catch (error) {
    console.error('[UnifiedChatStore] Failed to bootstrap agent statuses:', error);
  }
}

export function applyAgentStatusSnapshot(payloads: AgentStatusPayload[]) {
  useUnifiedChatStore.setState((state) => {
    if (!payloads || payloads.length === 0) {
      state.agents = [];
      state.agentStatus = null;
      return;
    }

    const normalized = payloads.map((agent) => mergeAgentStatus(undefined, agent));
    state.agents = normalized;
    state.agentStatus =
      normalized.find((agent) => agent.status === 'running' || agent.status === 'paused') ??
      normalized[0] ??
      null;
  });
}

function applyAgentStatusUpdate(payload: AgentStatusPayload) {
  useUnifiedChatStore.setState((state) => {
    const index = state.agents.findIndex((agent) => agent.id === payload.id);
    const nextStatus = mergeAgentStatus(index !== -1 ? state.agents[index] : undefined, payload);

    if (index !== -1) {
      state.agents[index] = nextStatus;
    } else {
      state.agents.push(nextStatus);
    }

    if (
      !state.agentStatus ||
      state.agentStatus.id === nextStatus.id ||
      nextStatus.status === 'running'
    ) {
      state.agentStatus = nextStatus;
    }
  });
}

function mergeAgentStatus(
  previous: AgentStatus | undefined,
  payload: AgentStatusPayload,
): AgentStatus {
  return {
    id: payload.id,
    name: payload.name ?? previous?.name ?? 'Agent',
    status: normalizeStatus(payload.status, previous?.status ?? 'idle'),
    currentGoal: payload.currentGoal ?? payload.current_goal ?? previous?.currentGoal,
    currentStep: payload.currentStep ?? payload.current_step ?? previous?.currentStep,
    progress: normalizeProgress(payload.progress, previous?.progress ?? 0),
    resourceUsage: normalizeResourceUsage(
      payload.resourceUsage ?? payload.resource_usage,
      previous?.resourceUsage,
    ),
    startedAt: normalizeTimestamp(payload.startedAt ?? payload.started_at, previous?.startedAt),
    completedAt: normalizeTimestamp(
      payload.completedAt ?? payload.completed_at,
      previous?.completedAt,
    ),
    error: payload.error ?? previous?.error,
  };
}

const VALID_AGENT_STATUSES: AgentStatus['status'][] = [
  'idle',
  'running',
  'paused',
  'completed',
  'failed',
];

function normalizeStatus(
  value: unknown,
  fallback: AgentStatus['status'] = 'idle',
): AgentStatus['status'] {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.toLowerCase() as AgentStatus['status'];
  return VALID_AGENT_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeProgress(value: unknown, fallback = 0): number {
  const raw =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : fallback;

  if (Number.isNaN(raw)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, raw));
}

function normalizeTimestamp(value: unknown, fallback?: Date): Date | undefined {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (value instanceof Date) {
    return value;
  }

  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);

  if (Number.isNaN(numeric)) {
    return fallback;
  }

  const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds);
}

function normalizeResourceUsage(
  value: unknown,
  fallback?: { cpu: number; memory: number },
): { cpu: number; memory: number } | undefined {
  if (
    value &&
    typeof value === 'object' &&
    'cpu' in value &&
    'memory' in value &&
    typeof (value as { cpu: unknown }).cpu === 'number' &&
    typeof (value as { memory: unknown }).memory === 'number'
  ) {
    const usage = value as { cpu: number; memory: number };
    return { cpu: usage.cpu, memory: usage.memory };
  }

  return fallback;
}
