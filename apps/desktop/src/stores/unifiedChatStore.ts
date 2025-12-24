/**
 * Unified Chat Store
 *
 * This store manages the central state for the agentic chat interface, including:
 * - Conversation history and messages
 * - Active agent status and background tasks
 * - Tool executions, file operations, and terminal commands
 * - Sidecar state (terminal, browser, code editor)
 * - Approval workflows and trusted operations
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, isTauri } from '../lib/tauri-mock';
import type { Artifact } from '../types/chat';
import { safeGetJSON, safeSetJSON } from '../utils/localStorage';

export interface MessageMetadata {
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  provider?: string;
  cost?: number;
  inputCost?: number;
  outputCost?: number;
  duration?: number;
  streaming?: boolean;
  artifacts?: Artifact[];
  type?: 'reasoning' | 'response';

  tool?: string;
  tool_call?: string;
  name?: string;
  event?: string;
  status?: string;
  state?: string;
  stage?: string;
  command?: string;
  requiresApproval?: boolean;
  actionId?: string;
  action_id?: string;
  sidecarType?: 'browser' | 'terminal' | 'code' | 'video' | 'media' | 'files' | 'data';
  thinking?: {
    title?: string;
    details?: string;
  };
  phase?: string;
  label?: string;
  summary?: string;
  preview?: string;
}

export interface Attachment {
  id: string;
  type: 'file' | 'image' | 'screenshot';
  name: string;
  path?: string;
  size?: number;
  mimeType?: string;
  content?: string;
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
  artifacts?: Artifact[];
  operations?: Operation[];
  streaming?: boolean;
  pending?: boolean;
  error?: string;
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
  | 'browser'
  | 'media'
  | 'tools'
  | 'tasks'
  | 'agents';

export type ConversationMode = 'safe' | 'full_control';

export type FocusMode = 'web' | 'code' | 'academic' | 'reasoning' | 'deep-research' | null;

export type ActiveView = 'chat' | 'projects' | 'artifacts';

export type SidecarMode = 'code' | 'browser' | 'terminal' | 'preview' | 'diff' | 'canvas' | 'data';

export interface SidecarState {
  isOpen: boolean;
  activeMode: SidecarMode;
  contextId: string | null;
  context?: any;
  autoTrigger: boolean;
}

export interface ActionTrailEntry {
  id: string;
  type: 'thinking' | 'searching' | 'coding' | 'running' | 'completed' | 'error';
  message: string;
  timestamp: Date;
  fadeAfter?: number;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  current: number;
  inputTokens: number;
  outputTokens: number;
  max: number;
  percentage: number;
  estimatedCost: number;
}

export interface Citation {
  id: string;
  index: number;
  url: string;
  title?: string;
  snippet?: string;
  favicon?: string;
  timestamp: Date;
}

interface IdMapping {
  dbIdToUuid: Record<number, string>;
  uuidToDbId: Record<string, number>;
}

let idMappings: IdMapping = { dbIdToUuid: {}, uuidToDbId: {} };

if (typeof window !== 'undefined') {
  idMappings = safeGetJSON<IdMapping>('id-mappings', { dbIdToUuid: {}, uuidToDbId: {} });
}

function persistIdMappings() {
  if (typeof window !== 'undefined') {
    const success = safeSetJSON('id-mappings', idMappings);
    if (!success) {
      console.warn('[UnifiedChatStore] Failed to persist ID mappings - using in-memory only');
    }
  }
}

export function dbIdToUuid(dbId: number): string {
  if (!idMappings.dbIdToUuid[dbId]) {
    const uuid = crypto.randomUUID();
    idMappings.dbIdToUuid[dbId] = uuid;
    idMappings.uuidToDbId[uuid] = dbId;
    persistIdMappings();
  }
  return idMappings.dbIdToUuid[dbId]!;
}

export function uuidToDbId(uuid: string): number | undefined {
  return idMappings.uuidToDbId[uuid];
}

export interface UnifiedChatState {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, EnhancedMessage[]>;

  messages: EnhancedMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  currentStreamingMessageId: string | null;

  fileOperations: FileOperation[];
  terminalCommands: TerminalCommand[];
  toolExecutions: ToolExecution[];
  screenshots: Screenshot[];
  actionLog: ActionLogEntry[];

  agents: AgentStatus[];
  agentStatus: AgentStatus | null;

  backgroundTasks: BackgroundTask[];

  pendingApprovals: ApprovalRequest[];
  trustedWorkflows: Record<string, TrustedWorkflow>;

  activeContext: ContextItem[];
  workflowContext: WorkflowContext | null;
  plan: PlanData | null;

  conversationMode: ConversationMode;

  sidecarOpen: boolean;
  sidecarSection: SidecarSection;
  sidecarWidth: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  sidecarUserSelected: boolean;
  isAutonomousMode: boolean;
  missionControlOpen: boolean;
  selectedMessage: string | null;

  activeView: ActiveView;

  focusMode: FocusMode;
  sidecar: SidecarState;
  actionTrail: ActionTrailEntry[];
  fadeTimers: Map<string, ReturnType<typeof setTimeout>>;
  tokenUsage: TokenUsage;
  citations: Citation[];

  filters: {
    fileOperations: FileOperationType[];
    terminalStatus: ('success' | 'error')[];
    toolNames: string[];
  };

  draftContent: string;
  editingMessageId: string | null;

  ensureActiveConversation: () => void;
  createConversation: (title?: string) => string;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  togglePinnedConversation: (id: string) => void;

  addMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'> & { id?: string }) => string;
  addOptimisticMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'>) => string;
  confirmOptimisticMessage: (tempId: string, confirmedId?: string) => void;
  failOptimisticMessage: (tempId: string, error: string) => void;
  retryFailedMessage: (id: string) => void;
  updateMessage: (id: string, updates: Partial<EnhancedMessage>) => void;
  deleteMessage: (id: string) => void;
  setIsLoading: (loading: boolean) => void;
  setStreamingMessage: (id: string | null) => void;
  appendToStreamingMessage: (content: string) => void;

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

  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  setAgentStatus: (status: AgentStatus | null) => void;
  addAgent: (agent: AgentStatus) => void;
  removeAgent: (id: string) => void;
  updateTaskProgress: (id: string, progress: number) => void;
  addBackgroundTask: (task: Omit<BackgroundTask, 'createdAt'>) => void;
  updateBackgroundTask: (id: string, updates: Partial<BackgroundTask>) => void;
  clearBackgroundTasks: () => void;

  setWorkflowContext: (context: WorkflowContext | null) => void;
  setPlan: (plan: PlanData | null) => void;
  updatePlanStep: (stepId: string, updates: Partial<PlanStep>) => void;
  clearPlan: () => void;

  setConversationMode: (mode: ConversationMode) => void;

  addApprovalRequest: (request: Omit<ApprovalRequest, 'createdAt' | 'status'>) => void;
  approveOperation: (id: string) => void;
  rejectOperation: (id: string, reason?: string) => void;
  removeApprovalRequest: (id: string) => void;
  setTrustedWorkflow: (workflow: TrustedWorkflow) => void;
  removeTrustedWorkflow: (hash: string) => void;
  recordTrustedAction: (hash: string, signature: string) => void;
  isActionTrusted: (hash: string | undefined, signature: string | undefined) => boolean;

  addContextItem: (item: ContextItem) => void;
  removeContextItem: (id: string) => void;
  clearContext: () => void;

  setSidecarOpen: (open: boolean) => void;
  setSidecarSection: (section: SidecarSection) => void;
  setSidecarSectionFromEvent: (event: string) => void;
  setSidecarWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMissionControlOpen: (open: boolean) => void;
  setSelectedMessage: (id: string | null) => void;
  setAutonomousMode: (value: boolean) => void;

  setActiveView: (view: ActiveView) => void;

  setFileOperationFilter: (types: FileOperationType[]) => void;
  setTerminalStatusFilter: (statuses: ('success' | 'error')[]) => void;
  setToolNameFilter: (names: string[]) => void;

  setDraftContent: (value: string) => void;
  startEditingMessage: (id: string, content: string) => void;
  cancelEditing: () => void;

  setFocusMode: (mode: FocusMode) => void;
  setSidecar: (state: Partial<SidecarState>) => void;
  openSidecar: (mode: SidecarMode, contextId?: string, context?: any) => void;
  closeSidecar: () => void;
  addActionTrailEntry: (entry: Omit<ActionTrailEntry, 'id' | 'timestamp'>) => void;
  removeActionTrailEntry: (id: string) => void;
  clearActionTrail: () => void;
  updateTokenUsage: (usage: Partial<TokenUsage>) => void;
  addCitation: (citation: Omit<Citation, 'id' | 'timestamp'>) => void;
  getCitationByIndex: (index: number) => Citation | undefined;
  clearCitations: () => void;

  getTokenPercentage: () => number;
  getActiveActionTrail: (messageId?: string) => ActionTrailEntry[];
  getSuggestedSidecarMode: (message: EnhancedMessage) => SidecarMode | null;

  clearHistory: () => void;
  exportConversation: () => Promise<string>;
}

export const useUnifiedChatStore = create<UnifiedChatState>()(
  persist(
    immer((set, get) => ({
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
      sidebarWidth: 260,
      sidebarCollapsed: false,
      sidecarUserSelected: false,
      isAutonomousMode: false,
      missionControlOpen: false,
      selectedMessage: null,

      activeView: 'chat',

      focusMode: null,
      sidecar: {
        isOpen: false,
        activeMode: 'code',
        contextId: null,
        autoTrigger: false,
      },
      actionTrail: [],
      fadeTimers: new Map(),
      tokenUsage: {
        current: 0,
        inputTokens: 0,
        outputTokens: 0,
        max: 128000,
        percentage: 0,
        estimatedCost: 0,
      },
      citations: [],

      filters: {
        fileOperations: [],
        terminalStatus: [],
        toolNames: [],
      },
      draftContent: '',
      editingMessageId: null,

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

      addMessage: (message) => {
        const assignedId = message.id ?? crypto.randomUUID();
        set((state) => {
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
            id: assignedId,
            timestamp: new Date(),
          };
          state.messages.push(newMessage);
          if (!state.messagesByConversation[convoId]) {
            state.messagesByConversation[convoId] = [];
          }
          state.messagesByConversation[convoId]!.push(newMessage);
          const convo = state.conversations.find((c) => c.id === convoId);
          if (convo) {
            convo.lastMessage = newMessage.content;
            convo.updatedAt = newMessage.timestamp;
          }
        });
        return assignedId;
      },

      addOptimisticMessage: (message) => {
        const tempId = crypto.randomUUID();
        set((state) => {
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
          const optimisticMessage: EnhancedMessage = {
            ...message,
            id: tempId,
            timestamp: new Date(),
            pending: true,
          };
          state.messages.push(optimisticMessage);
          if (!state.messagesByConversation[convoId]) {
            state.messagesByConversation[convoId] = [];
          }
          state.messagesByConversation[convoId]!.push(optimisticMessage);
          const convo = state.conversations.find((c) => c.id === convoId);
          if (convo) {
            convo.lastMessage = optimisticMessage.content;
            convo.updatedAt = optimisticMessage.timestamp;
          }
        });
        return tempId;
      },

      confirmOptimisticMessage: (tempId, confirmedId) =>
        set((state) => {
          const convoId = state.activeConversationId;
          const applyConfirmation = (list: EnhancedMessage[]) => {
            const idx = list.findIndex((m) => m.id === tempId);
            if (idx !== -1 && list[idx]) {
              delete list[idx]!.pending;
              delete list[idx]!.error;
              if (confirmedId) {
                list[idx]!.id = confirmedId;
              }
            }
          };
          applyConfirmation(state.messages);

          if (
            convoId &&
            convoId === state.activeConversationId &&
            state.messagesByConversation[convoId]
          ) {
            applyConfirmation(state.messagesByConversation[convoId]!);
          }
        }),

      failOptimisticMessage: (tempId, error) =>
        set((state) => {
          const applyFailure = (list: EnhancedMessage[]) => {
            const idx = list.findIndex((m) => m.id === tempId);
            if (idx !== -1 && list[idx]) {
              delete list[idx]!.pending;
              list[idx]!.error = error;
            }
          };
          applyFailure(state.messages);
          const convoId = state.activeConversationId;
          if (convoId && state.messagesByConversation[convoId]) {
            applyFailure(state.messagesByConversation[convoId]!);
          }
        }),

      retryFailedMessage: (id) =>
        set((state) => {
          const applyRetry = (list: EnhancedMessage[]) => {
            const idx = list.findIndex((m) => m.id === id);
            if (idx !== -1 && list[idx]) {
              delete list[idx]!.error;
              list[idx]!.pending = true;
            }
          };
          applyRetry(state.messages);
          const convoId = state.activeConversationId;
          if (convoId && state.messagesByConversation[convoId]) {
            applyRetry(state.messagesByConversation[convoId]!);
          }
        }),

      updateMessage: (id, updates) =>
        set((state) => {
          const applyUpdate = (list: EnhancedMessage[]) => {
            const idx = list.findIndex((m) => m.id === id);
            if (idx !== -1 && list[idx]) {
              Object.assign(list[idx]!, updates);
            }
          };
          applyUpdate(state.messages);
          const convoId = state.activeConversationId;
          if (convoId && state.messagesByConversation[convoId]) {
            applyUpdate(state.messagesByConversation[convoId]!);
          }
        }),

      deleteMessage: (id) =>
        set((state) => {
          state.messages = state.messages.filter((m) => m.id !== id);
          const convoId = state.activeConversationId;
          if (convoId && state.messagesByConversation[convoId]) {
            state.messagesByConversation[convoId] = state.messagesByConversation[convoId]!.filter(
              (m) => m.id !== id,
            );
          }
        }),

      setIsLoading: (loading) =>
        set((state) => {
          state.isLoading = loading;
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
            state.messages = state.messages.map((m) =>
              m.id === currentStreamingMessageId ? { ...m, content: m.content + content } : m,
            );
          }
        }),

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
            state.terminalCommands[index]!.stdout = payload.stdout;
            state.terminalCommands[index]!.stderr = payload.stderr;
            state.terminalCommands[index]!.exitCode = payload.exit_code;
            state.terminalCommands[index]!.duration = payload.duration_ms;
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
              ...state.actionLog[index]!,
              ...updates,
              updatedAt: new Date(),
            };
          }
        }),

      clearActionLog: () =>
        set((state) => {
          state.actionLog = [];
        }),

      updateAgentStatus: (id, status) =>
        set((state) => {
          const index = state.agents.findIndex((a) => a.id === id);
          if (index !== -1 && state.agents[index]) {
            Object.assign(state.agents[index]!, status);
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
            state.backgroundTasks[index]!.progress = progress;
          }
        }),

      addBackgroundTask: (task) =>
        set((state) => {
          if (state.backgroundTasks.some((t) => t.id === task.id)) {
            return;
          }
          state.backgroundTasks.push({ ...task, createdAt: new Date() });
        }),

      updateBackgroundTask: (id, updates) =>
        set((state) => {
          const index = state.backgroundTasks.findIndex((t) => t.id === id);
          if (index !== -1 && state.backgroundTasks[index]) {
            Object.assign(state.backgroundTasks[index]!, updates);
          }
        }),

      clearBackgroundTasks: () =>
        set((state) => {
          state.backgroundTasks = [];
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
              ...state.plan.steps[index]!,
              ...updates,
            };
            state.plan.updatedAt = new Date();
          }
        }),

      clearPlan: () =>
        set((state) => {
          state.plan = null;
        }),

      setConversationMode: (mode) =>
        set((state) => {
          state.conversationMode = mode;
        }),

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
            state.pendingApprovals[index]!.status = 'approved';
            state.pendingApprovals[index]!.approvedAt = new Date();
            state.pendingApprovals.splice(index, 1);
          }
        }),

      rejectOperation: (id, reason) =>
        set((state) => {
          const index = state.pendingApprovals.findIndex((a) => a.id === id);
          if (index !== -1 && state.pendingApprovals[index]) {
            state.pendingApprovals[index]!.status = 'rejected';
            state.pendingApprovals[index]!.rejectedAt = new Date();
            state.pendingApprovals[index]!.rejectionReason = reason;
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

      setSidecarOpen: (open) =>
        set((state) => {
          state.sidecarOpen = open;
          if (!open) {
            state.sidecarUserSelected = false;
          }
        }),

      setSidecarSection: (section) =>
        set((state) => {
          state.sidecarSection = section;
          state.sidecarUserSelected = true;
        }),

      setSidecarSectionFromEvent: (eventType) =>
        set((state) => {
          if (state.sidecarUserSelected) return;
          const lowered = eventType.toLowerCase();
          let target: SidecarSection | null = null;
          if (lowered.includes('terminal') || lowered.includes('execute')) {
            target = 'terminal';
          } else if (
            lowered.includes('read_file') ||
            lowered.includes('edit_file') ||
            lowered.includes('file')
          ) {
            target = 'files';
          } else if (lowered.includes('browser')) {
            target = 'browser';
          } else if (
            lowered.includes('generate_image') ||
            lowered.includes('generate_video') ||
            lowered.includes('media')
          ) {
            target = 'media';
          }
          if (!target) return;
          if (!state.sidecarOpen) {
            state.sidecarOpen = true;
          }
          state.sidecarSection = target;
        }),

      setSidecarWidth: (width) =>
        set((state) => {
          state.sidecarWidth = width;
        }),

      setSidebarWidth: (width) =>
        set((state) => {
          state.sidebarWidth = width;
        }),

      setSidebarCollapsed: (collapsed) =>
        set((state) => {
          state.sidebarCollapsed = collapsed;
        }),

      setMissionControlOpen: (open) =>
        set((state) => {
          state.missionControlOpen = open;
        }),

      setSelectedMessage: (id) =>
        set((state) => {
          state.selectedMessage = id;
        }),

      setAutonomousMode: (value) =>
        set((state) => {
          state.isAutonomousMode = value;

          if (value) {
            state.sidecarOpen = true;
          }
        }),

      setActiveView: (view) =>
        set((state) => {
          state.activeView = view;
        }),

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

      setDraftContent: (value) =>
        set((state) => {
          state.draftContent = value;
        }),
      startEditingMessage: (id, content) =>
        set((state) => {
          state.editingMessageId = id;
          state.draftContent = content;
        }),
      cancelEditing: () =>
        set((state) => {
          state.editingMessageId = null;
          state.draftContent = '';
        }),

      setFocusMode: (mode) =>
        set((state) => {
          state.focusMode = mode;
        }),

      setSidecar: (updates) =>
        set((state) => {
          state.sidecar = { ...state.sidecar, ...updates };
        }),

      openSidecar: (mode, contextId, context) =>
        set((state) => {
          state.sidecar.isOpen = true;
          state.sidecar.activeMode = mode;
          state.sidecar.contextId = contextId ?? null;
          state.sidecar.context = context;

          state.sidecarOpen = true;
        }),

      closeSidecar: () =>
        set((state) => {
          state.sidecar.isOpen = false;
          state.sidecarOpen = false;
        }),

      addActionTrailEntry: (entry) =>
        set((state) => {
          const newEntry: ActionTrailEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            ...entry,
          };
          state.actionTrail.push(newEntry);

          if (entry.fadeAfter) {
            const timerId = setTimeout(() => {
              try {
                const current = get();

                if (current.actionTrail.some((e) => e.id === newEntry.id)) {
                  current.fadeTimers.delete(newEntry.id);
                  current.removeActionTrailEntry(newEntry.id);
                }
              } catch (error) {
                console.warn('[ActionTrail] Error during auto-remove:', error);
              }
            }, entry.fadeAfter);
            state.fadeTimers.set(newEntry.id, timerId);
          }
        }),

      removeActionTrailEntry: (id) =>
        set((state) => {
          const timerId = state.fadeTimers.get(id);
          if (timerId !== undefined) {
            clearTimeout(timerId);
            state.fadeTimers.delete(id);
          }
          state.actionTrail = state.actionTrail.filter((entry) => entry.id !== id);
        }),

      clearActionTrail: () =>
        set((state) => {
          state.fadeTimers.forEach((timerId) => clearTimeout(timerId));
          state.fadeTimers.clear();
          state.actionTrail = [];
        }),

      updateTokenUsage: (usage) =>
        set((state) => {
          state.tokenUsage = { ...state.tokenUsage, ...usage };

          if (state.tokenUsage.max > 0) {
            state.tokenUsage.percentage = (state.tokenUsage.current / state.tokenUsage.max) * 100;
          }
        }),

      addCitation: (citation) =>
        set((state) => {
          const newCitation: Citation = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            ...citation,
          };
          state.citations.push(newCitation);
        }),

      getCitationByIndex: (index) => {
        const state = get();
        return state.citations.find((c) => c.index === index);
      },

      clearCitations: () =>
        set((state) => {
          state.citations = [];
        }),

      getTokenPercentage: () => {
        const state = get();
        return state.tokenUsage.percentage;
      },

      getActiveActionTrail: (messageId) => {
        const state = get();
        if (!messageId) {
          return state.actionTrail;
        }

        return state.actionTrail.filter((entry) => entry.metadata?.['messageId'] === messageId);
      },

      getSuggestedSidecarMode: (message) => {
        const content = message.content.toLowerCase();

        const codeBlockMatches = message.content.match(/```[\s\S]+?```/g);
        if (
          codeBlockMatches &&
          codeBlockMatches.some((block) => {
            const lines = block.split('\n').length;
            return lines > 15;
          })
        ) {
          return 'code';
        }

        if (
          content.includes('.csv') ||
          content.includes('id,name,value') ||
          content.includes('```csv')
        ) {
          return 'data';
        }

        if (
          content.includes('http://') ||
          content.includes('https://') ||
          message.operations?.some(
            (op) =>
              op.type === 'tool' &&
              typeof op.data === 'object' &&
              op.data !== null &&
              typeof op.data.toolName === 'string' &&
              op.data.toolName.includes('browser'),
          )
        ) {
          return 'browser';
        }

        if (message.operations?.some((op) => op.type === 'terminal')) {
          return 'terminal';
        }

        if (content.includes('diff') || (content.includes('---') && content.includes('+++'))) {
          return 'diff';
        }

        if (codeBlockMatches || content.includes('```')) {
          return 'preview';
        }

        return null;
      },

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

          state.actionTrail = [];
          state.citations = [];
          state.focusMode = null;
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
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        filters: state.filters,

        focusMode: state.focusMode,
        sidecar: state.sidecar,
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
