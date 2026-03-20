/**
 * Tool Store
 *
 * Manages tool executions, file operations, terminal commands, and approval workflows.
 * Split from unifiedChatStore for better modularity.
 *
 * Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(immer(...))))
 * - Export selectors for all state slices
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, isTauri, listen } from '../../lib/tauri-mock';
import { toast } from 'sonner';
import { storageFallback } from '../../utils/localStorage';
import type { ContextItem } from '@agiworkforce/types';
import type { ToolLabelEntry } from '../../components/UnifiedAgenticChat/ToolLabel';
import {
  buildRunningToolTimelineEntry,
  buildTerminalToolTimelineUpdate,
  resolveToolTimelineLabel,
} from '../../lib/toolTimelineRuntime';
import { useAgentStore } from './agentStore';
import { useChatStore } from './chatStore';
import type { ApprovalTimeoutPolicy } from '../settingsStore';

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
  input: Record<string, unknown>;
  output?: unknown;
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

export type ApprovalRiskLevel = 'low' | 'medium' | 'high';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

export interface ApprovalRequest {
  id: string;
  type:
    | 'file_delete'
    | 'terminal_command'
    | 'api_call'
    | 'data_modification'
    | 'mcp_tool'
    | 'tool_execution';
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
  messageId?: string;
}

/**
 * State for tracking a streaming tool execution
 */
export interface ToolStreamStateEntry {
  tool_id: string;
  tool_name: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;
  progressMessage?: string;
  outputChunks: string[];
  outputBuffer: string;
  bytesProcessed?: number;
  bytesTotal?: number;
  result?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  duration_ms?: number;
  retryable?: boolean;
  parameters?: Record<string, unknown>;
}

/**
 * Cap an array to `limit` most-recent entries.
 * Returns the original array reference unchanged when under the limit.
 */
function capArray<T>(arr: T[], limit: number): T[] {
  return arr.length > limit ? arr.slice(-limit) : arr;
}

// Named cap limits — single source of truth for all array size guards in this store.
const FILE_OPS_LIMIT = 200; // fileOperations, terminalCommands, toolExecutions, screenshots
const ACTION_LOG_LIMIT = 500; // actionLog entries (newest-first via unshift + slice)
const PENDING_APPROVALS_LIMIT = 50; // pendingApprovals queue depth

const STORAGE_VERSION = 1;

function upsertApprovalAuditEntry(
  actionLog: ActionLogEntry[],
  approval: ApprovalRequest,
  status: ActionLogStatus,
  extras?: Partial<ActionLogEntry>,
): void {
  // Clone the approval to avoid reading from a mutated Immer draft proxy.
  // Callers (e.g., rejectOperation) may mutate the draft before passing it here,
  // and reading nested properties from a mutated draft can produce stale values.
  const approvalSnapshot = {
    ...approval,
    scope: approval.scope ? { ...approval.scope } : undefined,
    details: approval.details ? { ...approval.details } : undefined,
  };
  const now = new Date();
  const existingIndex = actionLog.findIndex(
    (entry) =>
      entry.id === approvalSnapshot.id ||
      entry.actionId === approvalSnapshot.id ||
      (approvalSnapshot.actionId !== undefined && entry.actionId === approvalSnapshot.actionId),
  );

  const baseMetadata = {
    approvalId: approvalSnapshot.id,
    approvalType: approvalSnapshot.type,
    riskLevel: approvalSnapshot.riskLevel,
    details: approvalSnapshot.details,
    ...(approvalSnapshot.messageId ? { messageId: approvalSnapshot.messageId } : {}),
    ...(approvalSnapshot.workflowHash ? { workflowHash: approvalSnapshot.workflowHash } : {}),
    ...(approvalSnapshot.actionSignature
      ? { actionSignature: approvalSnapshot.actionSignature }
      : {}),
  };

  const nextEntry: ActionLogEntry = {
    ...(existingIndex !== -1
      ? actionLog[existingIndex]!
      : { id: approvalSnapshot.id, createdAt: now }),
    actionId: approvalSnapshot.actionId ?? approvalSnapshot.id,
    workflowHash: approvalSnapshot.workflowHash,
    type: 'approval',
    title: approvalSnapshot.description,
    description: approvalSnapshot.impact ?? approvalSnapshot.scope?.description,
    status,
    requiresApproval: true,
    scope: approvalSnapshot.scope,
    metadata: {
      ...(existingIndex !== -1 ? actionLog[existingIndex]!.metadata : {}),
      ...baseMetadata,
      ...(extras?.metadata ?? {}),
    },
    updatedAt: now,
    ...extras,
  };

  if (existingIndex !== -1) {
    actionLog[existingIndex] = nextEntry;
    return;
  }

  actionLog.unshift(nextEntry);
  if (actionLog.length > ACTION_LOG_LIMIT) {
    actionLog.splice(ACTION_LOG_LIMIT);
  }
}

export interface ToolState {
  // Operations
  fileOperations: FileOperation[];
  terminalCommands: TerminalCommand[];
  toolExecutions: ToolExecution[];
  screenshots: Screenshot[];
  actionLog: ActionLogEntry[];

  // Approvals
  pendingApprovals: ApprovalRequest[];
  trustedWorkflows: Record<string, TrustedWorkflow>;

  // Context and plan
  activeContext: ContextItem[];
  workflowContext: WorkflowContext | null;
  plan: PlanData | null;

  // Tool streaming
  activeToolStreams: Map<string, ToolStreamStateEntry>;

  // Filters
  filters: {
    fileOperations: FileOperationType[];
    terminalStatus: ('success' | 'error')[];
    toolNames: string[];
  };

  // Actions - File operations
  addFileOperation: (op: Omit<FileOperation, 'timestamp'>) => void;

  // Actions - Terminal commands
  addTerminalCommand: (cmd: Omit<TerminalCommand, 'timestamp'>) => void;
  updateTerminalOutput: (payload: {
    command_id: string;
    stdout: string;
    stderr: string;
    exit_code?: number;
    duration_ms: number;
  }) => void;

  // Actions - Tool executions
  addToolExecution: (exec: Omit<ToolExecution, 'timestamp'>) => void;

  // Actions - Screenshots
  addScreenshot: (screenshot: Omit<Screenshot, 'timestamp'>) => void;

  // Actions - Action log
  addActionLogEntry: (entry: Omit<ActionLogEntry, 'createdAt' | 'updatedAt'>) => void;
  updateActionLogEntry: (id: string, updates: Partial<ActionLogEntry>) => void;
  clearActionLog: () => void;
  clearToolHistory: () => void;

  // Actions - Plan
  setWorkflowContext: (context: WorkflowContext | null) => void;
  setPlan: (plan: PlanData | null) => void;
  updatePlanStep: (stepId: string, updates: Partial<PlanStep>) => void;
  clearPlan: () => void;

  // Actions - Approvals
  addApprovalRequest: (request: Omit<ApprovalRequest, 'createdAt' | 'status'>) => void;
  approveOperation: (id: string) => void;
  rejectOperation: (id: string, reason?: string) => void;
  removeApprovalRequest: (id: string) => void;

  // Actions - Trusted workflows
  setTrustedWorkflow: (workflow: TrustedWorkflow) => void;
  removeTrustedWorkflow: (hash: string) => void;
  recordTrustedAction: (hash: string, signature: string) => void;
  isActionTrusted: (hash: string | undefined, signature: string | undefined) => boolean;

  // Actions - Context
  addContextItem: (item: ContextItem) => void;
  removeContextItem: (id: string) => void;
  clearContext: () => void;

  // Actions - Tool streaming
  updateToolStream: (toolId: string, state: Partial<ToolStreamStateEntry>) => void;
  removeToolStream: (toolId: string) => void;
  clearToolStreams: () => void;
  getActiveToolStreams: () => ToolStreamStateEntry[];
  cancelToolExecution: (toolId: string) => void;

  // Actions - Filters
  setFileOperationFilter: (types: FileOperationType[]) => void;
  setTerminalStatusFilter: (statuses: ('success' | 'error')[]) => void;
  setToolNameFilter: (names: string[]) => void;

  // Approval timeout tracking
  approvalTimeoutTimers: Map<string, ReturnType<typeof setTimeout>>;

  // Actions - Approval timeout
  startApprovalTimeout: (approvalId: string) => void;
  clearApprovalTimeout: (approvalId: string) => void;
  clearAllApprovalTimeouts: () => void;
  handleApprovalTimeout: (approvalId: string) => void;

  // Actions - Reset
  resetOnLogout: () => void;
}

export const useToolStore = create<ToolState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          // Initial state
          fileOperations: [],
          terminalCommands: [],
          toolExecutions: [],
          screenshots: [],
          actionLog: [],
          pendingApprovals: [],
          trustedWorkflows: {},
          activeContext: [],
          workflowContext: null,
          plan: null,
          activeToolStreams: new Map<string, ToolStreamStateEntry>(),
          approvalTimeoutTimers: new Map<string, ReturnType<typeof setTimeout>>(),
          filters: {
            fileOperations: [],
            terminalStatus: [],
            toolNames: [],
          },

          // File operations
          addFileOperation: (op) =>
            set(
              (state) => {
                state.fileOperations.push({ ...op, timestamp: new Date() });
                // AUDIT-006-017 fix: Cap fileOperations at 200 entries
                state.fileOperations = capArray(state.fileOperations, FILE_OPS_LIMIT);
              },
              undefined,
              'tool/addFileOperation',
            ),

          // Terminal commands
          addTerminalCommand: (cmd) =>
            set(
              (state) => {
                state.terminalCommands.push({ ...cmd, timestamp: new Date() });
                // AUDIT-006-017 fix: Cap terminalCommands at 200 entries
                state.terminalCommands = capArray(state.terminalCommands, FILE_OPS_LIMIT);
              },
              undefined,
              'tool/addTerminalCommand',
            ),

          updateTerminalOutput: (payload) =>
            set(
              (state) => {
                const index = state.terminalCommands.findIndex(
                  (cmd) => cmd.id === payload.command_id,
                );
                if (index !== -1 && state.terminalCommands[index]) {
                  state.terminalCommands[index]!.stdout = payload.stdout;
                  state.terminalCommands[index]!.stderr = payload.stderr;
                  state.terminalCommands[index]!.exitCode = payload.exit_code;
                  state.terminalCommands[index]!.duration = payload.duration_ms;
                }
              },
              undefined,
              'tool/updateTerminalOutput',
            ),

          // Tool executions
          addToolExecution: (exec) =>
            set(
              (state) => {
                state.toolExecutions.push({ ...exec, timestamp: new Date() });
                // AUDIT-006-017 fix: Cap toolExecutions at 200 entries
                state.toolExecutions = capArray(state.toolExecutions, FILE_OPS_LIMIT);
              },
              undefined,
              'tool/addToolExecution',
            ),

          // Screenshots
          addScreenshot: (screenshot) =>
            set(
              (state) => {
                state.screenshots.push({ ...screenshot, timestamp: new Date() });
                // AUDIT-006-017 fix: Cap screenshots at 200 entries
                state.screenshots = capArray(state.screenshots, FILE_OPS_LIMIT);
              },
              undefined,
              'tool/addScreenshot',
            ),

          // Action log
          addActionLogEntry: (entry) =>
            set(
              (state) => {
                const now = new Date();
                state.actionLog.unshift({
                  ...entry,
                  createdAt: now,
                  updatedAt: now,
                });
                // Cap at 500 entries — unshift prepends, so slice from the front keeps newest entries.
                if (state.actionLog.length > ACTION_LOG_LIMIT) {
                  state.actionLog = state.actionLog.slice(0, ACTION_LOG_LIMIT);
                }
              },
              undefined,
              'tool/addActionLogEntry',
            ),

          updateActionLogEntry: (id, updates) =>
            set(
              (state) => {
                const index = state.actionLog.findIndex(
                  (item) => item.id === id || item.actionId === id,
                );
                if (index !== -1 && state.actionLog[index]) {
                  state.actionLog[index] = {
                    ...state.actionLog[index]!,
                    ...updates,
                    updatedAt: new Date(),
                  };
                }
              },
              undefined,
              'tool/updateActionLogEntry',
            ),

          clearActionLog: () =>
            set(
              (state) => {
                state.actionLog = [];
              },
              undefined,
              'tool/clearActionLog',
            ),

          clearToolHistory: () =>
            set(
              (state) => {
                state.fileOperations = [];
                state.terminalCommands = [];
                state.toolExecutions = [];
                state.screenshots = [];
                state.actionLog = [];
              },
              undefined,
              'tool/clearToolHistory',
            ),

          // Plan
          setWorkflowContext: (context) =>
            set(
              (state) => {
                state.workflowContext = context;
              },
              undefined,
              'tool/setWorkflowContext',
            ),

          setPlan: (plan) =>
            set(
              (state) => {
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
              },
              undefined,
              'tool/setPlan',
            ),

          updatePlanStep: (stepId, updates) =>
            set(
              (state) => {
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
              },
              undefined,
              'tool/updatePlanStep',
            ),

          clearPlan: () =>
            set(
              (state) => {
                state.plan = null;
              },
              undefined,
              'tool/clearPlan',
            ),

          // Approvals
          addApprovalRequest: (request) => {
            set(
              (state) => {
                const normalized = {
                  ...request,
                  details: request.details ?? {},
                  createdAt: new Date(),
                  status: 'pending' as ApprovalStatus,
                };
                const index = state.pendingApprovals.findIndex(
                  (approval) => approval.id === request.id,
                );
                if (index !== -1) {
                  state.pendingApprovals[index] = normalized;
                } else {
                  state.pendingApprovals.push(normalized);
                  // AUDIT-006-018 fix: Cap pendingApprovals at 50 entries
                  if (state.pendingApprovals.length > PENDING_APPROVALS_LIMIT) {
                    state.pendingApprovals = state.pendingApprovals.slice(-PENDING_APPROVALS_LIMIT);
                  }
                }

                upsertApprovalAuditEntry(state.actionLog, normalized, 'blocked');
              },
              undefined,
              'tool/addApprovalRequest',
            );
            // Start the approval timeout timer after the state update
            get().startApprovalTimeout(request.id);
          },

          approveOperation: (id) => {
            get().clearApprovalTimeout(id);
            set(
              (state) => {
                const index = state.pendingApprovals.findIndex((a) => a.id === id);
                if (index !== -1) {
                  const approval = state.pendingApprovals[index]!;
                  upsertApprovalAuditEntry(state.actionLog, approval, 'success', {
                    result: 'Approved by user',
                  });
                  // Remove directly - no need to update status on an item being removed
                  state.pendingApprovals.splice(index, 1);
                }
              },
              undefined,
              'tool/approveOperation',
            );
          },

          rejectOperation: (id, reason) => {
            get().clearApprovalTimeout(id);
            set(
              (state) => {
                const index = state.pendingApprovals.findIndex((a) => a.id === id);
                if (index !== -1) {
                  const approval = state.pendingApprovals[index]!;
                  // Record rejection details before removing (preserves audit trail)
                  approval.status = 'rejected';
                  approval.rejectedAt = new Date();
                  if (reason) approval.rejectionReason = reason;
                  upsertApprovalAuditEntry(state.actionLog, approval, 'failed', {
                    error: reason ?? 'Rejected by user',
                  });
                  state.pendingApprovals.splice(index, 1);
                }
              },
              undefined,
              'tool/rejectOperation',
            );
          },

          removeApprovalRequest: (id) => {
            get().clearApprovalTimeout(id);
            set(
              (state) => {
                state.pendingApprovals = state.pendingApprovals.filter(
                  (approval) => approval.id !== id,
                );
              },
              undefined,
              'tool/removeApprovalRequest',
            );
          },

          // Trusted workflows
          setTrustedWorkflow: (workflow) =>
            set(
              (state) => {
                state.trustedWorkflows[workflow.hash] = {
                  ...workflow,
                  actionSignatures: workflow.actionSignatures ?? [],
                  createdAt: workflow.createdAt ?? new Date(),
                };
              },
              undefined,
              'tool/setTrustedWorkflow',
            ),

          removeTrustedWorkflow: (hash) =>
            set(
              (state) => {
                delete state.trustedWorkflows[hash];
              },
              undefined,
              'tool/removeTrustedWorkflow',
            ),

          recordTrustedAction: (hash, signature) =>
            set(
              (state) => {
                if (!hash || !signature) {
                  return;
                }
                const existing = state.trustedWorkflows[hash];
                if (existing) {
                  if (!existing.actionSignatures.includes(signature)) {
                    existing.actionSignatures.push(signature);
                  }
                } else {
                  state.trustedWorkflows[hash] = {
                    hash,
                    createdAt: new Date(),
                    actionSignatures: [signature],
                  };
                }
              },
              undefined,
              'tool/recordTrustedAction',
            ),

          isActionTrusted: (hash, signature) => {
            if (!hash || !signature) {
              return false;
            }
            const workflow = get().trustedWorkflows[hash];
            return Boolean(workflow?.actionSignatures.includes(signature));
          },

          // Context
          addContextItem: (item) =>
            set(
              (state) => {
                state.activeContext.push(item);
              },
              undefined,
              'tool/addContextItem',
            ),

          removeContextItem: (id) =>
            set(
              (state) => {
                state.activeContext = state.activeContext.filter((item) => item.id !== id);
              },
              undefined,
              'tool/removeContextItem',
            ),

          clearContext: () =>
            set(
              (state) => {
                state.activeContext = [];
              },
              undefined,
              'tool/clearContext',
            ),

          // Tool streaming
          updateToolStream: (toolId, updates) => {
            set(
              (state) => {
                const existing = state.activeToolStreams.get(toolId);
                if (existing) {
                  // Filter out undefined values to avoid overwriting valid data with undefined
                  const filteredUpdates = Object.fromEntries(
                    Object.entries(updates).filter(([_, v]) => v !== undefined),
                  );
                  const updated: ToolStreamStateEntry = {
                    ...existing,
                    ...filteredUpdates,
                    outputChunks: updates.outputChunks
                      ? [...existing.outputChunks, ...updates.outputChunks]
                      : existing.outputChunks,
                    outputBuffer:
                      updates.outputBuffer !== undefined
                        ? existing.outputBuffer + updates.outputBuffer
                        : existing.outputBuffer,
                  };
                  state.activeToolStreams.set(toolId, updated);
                } else {
                  const newEntry: ToolStreamStateEntry = {
                    tool_id: toolId,
                    tool_name: updates.tool_name || 'Unknown Tool',
                    status: updates.status || 'running',
                    progress: updates.progress || 0,
                    progressMessage: updates.progressMessage,
                    outputChunks: updates.outputChunks || [],
                    outputBuffer: updates.outputBuffer || '',
                    bytesProcessed: updates.bytesProcessed,
                    bytesTotal: updates.bytesTotal,
                    result: updates.result,
                    error: updates.error,
                    startedAt: updates.startedAt || new Date(),
                    completedAt: updates.completedAt,
                    duration_ms: updates.duration_ms,
                    retryable: updates.retryable,
                    parameters: updates.parameters,
                  };
                  state.activeToolStreams.set(toolId, newEntry);
                }
              },
              undefined,
              'tool/updateToolStream',
            );

            // Cleanup completed/errored tool streams after a short delay.
            // This prevents unbounded growth of activeToolStreams when tools
            // complete but are not explicitly removed by the event listener.
            const resolvedStatus = updates.status;
            if (resolvedStatus === 'completed' || resolvedStatus === 'error') {
              setTimeout(() => {
                const current = get().activeToolStreams.get(toolId);
                if (current && (current.status === 'completed' || current.status === 'error')) {
                  get().removeToolStream(toolId);
                }
              }, 5_000);
            }
          },

          removeToolStream: (toolId) =>
            set(
              (state) => {
                state.activeToolStreams.delete(toolId);
              },
              undefined,
              'tool/removeToolStream',
            ),

          clearToolStreams: () =>
            set(
              (state) => {
                state.activeToolStreams.clear();
              },
              undefined,
              'tool/clearToolStreams',
            ),

          getActiveToolStreams: () => {
            const state = get();
            return Array.from(state.activeToolStreams.values()).filter(
              (stream) => stream.status === 'running',
            );
          },

          cancelToolExecution: async (toolId) => {
            set(
              (state) => {
                const existing = state.activeToolStreams.get(toolId);
                if (existing) {
                  state.activeToolStreams.set(toolId, {
                    ...existing,
                    progressMessage: 'Cancelling...',
                  });
                }
              },
              undefined,
              'tool/cancelToolExecution',
            );

            if (isTauri) {
              try {
                await invoke('cancel_tool_execution', { toolId });
              } catch (error) {
                console.warn('[ToolStore] Failed to cancel tool execution:', error);
                set(
                  (state) => {
                    const existing = state.activeToolStreams.get(toolId);
                    if (existing && existing.status === 'running') {
                      state.activeToolStreams.set(toolId, {
                        ...existing,
                        progressMessage: undefined,
                      });
                    }
                  },
                  undefined,
                  'tool/cancelToolExecution/error',
                );
              }
            }
          },

          // Filters
          setFileOperationFilter: (types) =>
            set(
              (state) => {
                state.filters.fileOperations = types;
              },
              undefined,
              'tool/setFileOperationFilter',
            ),

          setTerminalStatusFilter: (statuses) =>
            set(
              (state) => {
                state.filters.terminalStatus = statuses;
              },
              undefined,
              'tool/setTerminalStatusFilter',
            ),

          setToolNameFilter: (names) =>
            set(
              (state) => {
                state.filters.toolNames = names;
              },
              undefined,
              'tool/setToolNameFilter',
            ),

          // Approval timeout actions
          startApprovalTimeout: (approvalId) => {
            // Lazy import to avoid circular dependency at module load time
            let timeoutSeconds = 300;
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { useSettingsStore } = require('../settingsStore') as {
                useSettingsStore: {
                  getState: () => {
                    executionPreferences: {
                      approvalTimeoutSeconds: number;
                    };
                  };
                };
              };
              timeoutSeconds =
                useSettingsStore.getState().executionPreferences.approvalTimeoutSeconds;
            } catch {
              // Use defaults if settings store is not available
            }

            // Clear any existing timer for this approval
            const existingTimer = get().approvalTimeoutTimers.get(approvalId);
            if (existingTimer !== undefined) {
              clearTimeout(existingTimer);
            }

            const timerId = setTimeout(() => {
              get().handleApprovalTimeout(approvalId);
            }, timeoutSeconds * 1000);

            set(
              (state) => {
                state.approvalTimeoutTimers.set(approvalId, timerId);
                // Stamp the timeout seconds on the approval request for UI display
                const approval = state.pendingApprovals.find((a) => a.id === approvalId);
                if (approval) {
                  approval.timeoutSeconds = timeoutSeconds;
                }
              },
              undefined,
              'tool/startApprovalTimeout',
            );
          },

          clearApprovalTimeout: (approvalId) => {
            const timerId = get().approvalTimeoutTimers.get(approvalId);
            if (timerId !== undefined) {
              clearTimeout(timerId);
            }
            set(
              (state) => {
                state.approvalTimeoutTimers.delete(approvalId);
              },
              undefined,
              'tool/clearApprovalTimeout',
            );
          },

          clearAllApprovalTimeouts: () => {
            const timers = get().approvalTimeoutTimers;
            timers.forEach((timerId) => clearTimeout(timerId));
            set(
              (state) => {
                state.approvalTimeoutTimers = new Map();
              },
              undefined,
              'tool/clearAllApprovalTimeouts',
            );
          },

          handleApprovalTimeout: (approvalId) => {
            let timeoutPolicy: ApprovalTimeoutPolicy = 'auto-deny';
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { useSettingsStore } = require('../settingsStore') as {
                useSettingsStore: {
                  getState: () => {
                    executionPreferences: {
                      approvalTimeoutPolicy: ApprovalTimeoutPolicy;
                    };
                  };
                };
              };
              timeoutPolicy =
                useSettingsStore.getState().executionPreferences.approvalTimeoutPolicy;
            } catch {
              // Use default
            }

            const approval = get().pendingApprovals.find((a) => a.id === approvalId);
            if (!approval) {
              // Approval was already handled (approved/rejected manually)
              return;
            }

            if (timeoutPolicy === 'auto-deny') {
              set(
                (state) => {
                  const idx = state.pendingApprovals.findIndex((a) => a.id === approvalId);
                  if (idx !== -1) {
                    const timedOutApproval = state.pendingApprovals[idx]!;
                    timedOutApproval.status = 'timeout';
                    timedOutApproval.rejectedAt = new Date();
                    timedOutApproval.rejectionReason = 'Timed out — automatically denied';
                    upsertApprovalAuditEntry(state.actionLog, timedOutApproval, 'failed', {
                      error: 'Approval timed out — automatically denied',
                    });
                    state.pendingApprovals.splice(idx, 1);
                  }
                  state.approvalTimeoutTimers.delete(approvalId);
                },
                undefined,
                'tool/handleApprovalTimeout/deny',
              );
              toast.warning(
                `Approval timed out: "${approval.description}" was automatically denied`,
              );
            } else if (timeoutPolicy === 'auto-approve') {
              set(
                (state) => {
                  const idx = state.pendingApprovals.findIndex((a) => a.id === approvalId);
                  if (idx !== -1) {
                    const timedOutApproval = state.pendingApprovals[idx]!;
                    upsertApprovalAuditEntry(state.actionLog, timedOutApproval, 'success', {
                      result: 'Approval timed out — automatically approved',
                    });
                    state.pendingApprovals.splice(idx, 1);
                  }
                  state.approvalTimeoutTimers.delete(approvalId);
                },
                undefined,
                'tool/handleApprovalTimeout/approve',
              );
              toast.info(
                `Approval timed out: "${approval.description}" was automatically approved`,
              );
            } else {
              // 'pause' — leave the approval pending but notify the user and pause the agent
              set(
                (state) => {
                  state.approvalTimeoutTimers.delete(approvalId);
                },
                undefined,
                'tool/handleApprovalTimeout/pause',
              );
              toast.warning(`Agent paused: "${approval.description}" is waiting for your decision`);
              // Pause the active agent through the agent store
              const agentStatus = useAgentStore.getState().agentStatus;
              if (agentStatus && agentStatus.status === 'running') {
                useAgentStore.getState().setAgentStatus({
                  ...agentStatus,
                  status: 'paused',
                });
              }
            }
          },

          // Reset
          resetOnLogout: () => {
            // Clear all approval timeout timers before resetting state
            get().approvalTimeoutTimers.forEach((timerId) => clearTimeout(timerId));
            set(
              (state) => {
                state.fileOperations = [];
                state.terminalCommands = [];
                state.toolExecutions = [];
                state.screenshots = [];
                state.actionLog = [];
                state.pendingApprovals = [];
                state.trustedWorkflows = {};
                state.activeContext = [];
                state.workflowContext = null;
                state.plan = null;
                state.activeToolStreams = new Map();
                state.approvalTimeoutTimers = new Map();
              },
              undefined,
              'tool/resetOnLogout',
            );
          },
        })),
      ),
      {
        name: 'tool-storage',
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          trustedWorkflows: state.trustedWorkflows,
          filters: state.filters,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          // Handle future migrations here
          return persistedState as ToolState;
        },
      },
    ),
    { name: 'ToolStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectFileOperations = (state: ToolState) => state.fileOperations;
export const selectTerminalCommands = (state: ToolState) => state.terminalCommands;
export const selectToolExecutions = (state: ToolState) => state.toolExecutions;
export const selectScreenshots = (state: ToolState) => state.screenshots;
export const selectActionLog = (state: ToolState) => state.actionLog;
export const selectPendingApprovals = (state: ToolState) => state.pendingApprovals;
export const selectTrustedWorkflows = (state: ToolState) => state.trustedWorkflows;
export const selectActiveContext = (state: ToolState) => state.activeContext;
export const selectWorkflowContext = (state: ToolState) => state.workflowContext;
export const selectPlan = (state: ToolState) => state.plan;
export const selectActiveToolStreams = (state: ToolState) => state.activeToolStreams;
export const selectFilters = (state: ToolState) => state.filters;

// Derived selectors
export const selectRecentFileOperations = (state: ToolState) => state.fileOperations.slice(0, 50);

export const selectSuccessfulTerminalCommands = (state: ToolState) =>
  state.terminalCommands.filter((cmd) => cmd.exitCode === 0);

export const selectFailedTerminalCommands = (state: ToolState) =>
  state.terminalCommands.filter((cmd) => cmd.exitCode !== undefined && cmd.exitCode !== 0);

export const selectHighRiskApprovals = (state: ToolState) =>
  state.pendingApprovals.filter((a) => a.riskLevel === 'high');

export const selectRunningToolStreams = (state: ToolState) =>
  Array.from(state.activeToolStreams.values()).filter((stream) => stream.status === 'running');

// Re-export ContextItem type
export type { ContextItem };

/**
 * Payload for `tool:event` Tauri events emitted by the agentic loop.
 * Mirrors the Rust `ToolEvent` enum serialized with `serde(tag = "type", rename_all = "snake_case")`.
 */
export interface ToolEventPayload {
  type: 'started' | 'progress' | 'completed';
  id: string;
  conversation_id: number;
  message_id: string;
  tool_name?: string;
  display_name?: string;
  display_args?: string;
  iteration?: number;
  stdout_chunk?: string;
  progress_pct?: number;
  success?: boolean;
  duration_ms?: number;
  result_preview?: string;
  error?: string;
  /** Optional parallel group identifier for grouping concurrent tool executions. */
  parallel_group?: string;
}

/** Payload for `agentic:loop-started` event */
interface AgenticLoopStartedPayload {
  conversation_id: number;
  max_iterations: number;
}

/** Payload for `agentic:loop-status` event */
interface AgenticLoopStatusPayload {
  conversation_id: number;
  iteration: number;
  max_iterations: number;
}

/** Payload for `agentic:loop-ended` event */
interface AgenticLoopEndedPayload {
  conversation_id: number;
  iterations_used: number;
}

let toolEventListenerInitialized = false;

function getExistingToolTimelineEntry(
  messageId: string,
  toolId: string,
): ToolLabelEntry | undefined {
  return useChatStore
    .getState()
    .toolTimelineByMessage[messageId]?.find((entry) => entry.id === toolId);
}

function resolveToolLabel(payload: ToolEventPayload): {
  displayName: string;
  displayArgs: string;
} {
  const existingEntry = getExistingToolTimelineEntry(payload.message_id, payload.id);

  const activeStream = useToolStore.getState().activeToolStreams.get(payload.id);
  const streamDisplayName =
    typeof activeStream?.parameters?.['displayName'] === 'string'
      ? activeStream.parameters['displayName']
      : activeStream?.tool_name;
  const streamDisplayArgs =
    typeof activeStream?.parameters?.['displayArgs'] === 'string'
      ? activeStream.parameters['displayArgs']
      : '';

  return resolveToolTimelineLabel({
    rawName: payload.tool_name ?? streamDisplayName ?? 'Tool',
    displayName: payload.display_name ?? streamDisplayName,
    displayArgs: payload.display_args ?? streamDisplayArgs,
    existing: existingEntry ?? null,
    activeStreamDisplayName: streamDisplayName,
    activeStreamDisplayArgs: streamDisplayArgs,
  });
}

/**
 * Initializes the Tauri event listeners for tool events and agentic loop lifecycle.
 * - `tool:event` — updates toolStore streams, chatStore timeline, and agentStore action trail
 * - `agentic:loop-started` — sets agenticLoopStatus to active
 * - `agentic:loop-status` — updates current iteration count
 * - `agentic:loop-ended` — clears agenticLoopStatus
 *
 * Guards against double-initialization. Safe to call multiple times.
 */
export async function initializeToolEventListener(): Promise<void> {
  if (toolEventListenerInitialized || !isTauri) {
    return;
  }

  // Set flag after all listeners are registered (not before) to avoid partial init
  try {
    // --- tool:event ---
    await listen<ToolEventPayload>('tool:event', (event) => {
      const payload = event.payload;
      const toolId = payload.id;
      const messageId = payload.message_id;
      const { displayName, displayArgs } = resolveToolLabel(payload);

      if (payload.type === 'started') {
        // Update tool stream in toolStore — use decoded display name, not raw MCP b64 name
        useToolStore.getState().updateToolStream(toolId, {
          tool_id: toolId,
          tool_name: displayName,
          status: 'running',
          progress: 0,
          startedAt: new Date(),
          parameters: {
            displayName,
            displayArgs,
            rawToolName: payload.tool_name,
          },
        });

        // Add entry to chat timeline
        useChatStore.getState().addToolTimelineEntry(
          messageId,
          buildRunningToolTimelineEntry({
            id: toolId,
            rawName: payload.tool_name ?? displayName,
            displayName,
            displayArgs,
            existing: getExistingToolTimelineEntry(messageId, toolId) ?? null,
            parallelGroup: payload.parallel_group,
          }),
        );

        // Push to agent action trail
        useAgentStore.getState().addActionTrailEntry({
          type: 'running',
          message: displayArgs ? `${displayName}: ${displayArgs}` : displayName,
          metadata: {
            messageId,
            toolEventId: toolId,
            toolName: payload.tool_name,
            iteration: payload.iteration,
          },
        });
      } else if (payload.type === 'progress') {
        // Update tool stream with stdout chunk and progress
        useToolStore.getState().updateToolStream(toolId, {
          ...(payload.stdout_chunk !== undefined
            ? { outputChunks: [payload.stdout_chunk], outputBuffer: payload.stdout_chunk }
            : {}),
          ...(payload.progress_pct !== undefined ? { progress: payload.progress_pct } : {}),
        });
      } else if (payload.type === 'completed') {
        const status = payload.success === false ? 'error' : 'completed';

        // Update tool stream
        useToolStore.getState().updateToolStream(toolId, {
          status,
          completedAt: new Date(),
          duration_ms: payload.duration_ms,
          ...(payload.result_preview !== undefined ? { result: payload.result_preview } : {}),
          ...(payload.error !== undefined ? { error: payload.error } : {}),
        });

        // Schedule removal of the tool stream after 5 seconds
        setTimeout(() => {
          useToolStore.getState().removeToolStream(toolId);
        }, 5000);

        // Update chat timeline entry
        useChatStore.getState().updateToolTimelineEntry(
          messageId,
          toolId,
          buildTerminalToolTimelineUpdate({
            success: status !== 'error',
            error: payload.error,
            durationMs: payload.duration_ms,
            resultPreview: payload.result_preview,
          }),
        );

        // Push completion to agent action trail
        useAgentStore.getState().addActionTrailEntry({
          type: status === 'error' ? 'error' : 'completed',
          message:
            status === 'error'
              ? `${displayName} failed${payload.error ? `: ${payload.error}` : ''}`
              : `${displayName} completed${payload.duration_ms !== undefined ? ` (${payload.duration_ms}ms)` : ''}`,
          fadeAfter: 3000,
          metadata: {
            messageId,
            toolEventId: toolId,
            duration_ms: payload.duration_ms,
          },
        });
      }
    });

    // --- agentic:loop-started ---
    await listen<AgenticLoopStartedPayload>('agentic:loop-started', (event) => {
      const { conversation_id, max_iterations } = event.payload;
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: conversation_id,
        iteration: 0,
        maxIterations: max_iterations,
      });
    });

    // --- agentic:loop-status ---
    await listen<AgenticLoopStatusPayload>('agentic:loop-status', (event) => {
      const { conversation_id, iteration, max_iterations } = event.payload;
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: conversation_id,
        iteration,
        maxIterations: max_iterations,
      });
    });

    // --- agentic:loop-ended ---
    await listen<AgenticLoopEndedPayload>('agentic:loop-ended', (_event) => {
      useChatStore.getState().setAgenticLoopStatus(null);
    });

    // --- agentic:message-consumed ---
    await listen<{ pending_message: { id: string } }>('agentic:message-consumed', (event) => {
      const pendingId = event.payload?.pending_message?.id;
      if (pendingId) {
        useChatStore.getState().removePendingMessage(pendingId);
      }
    });

    // --- compaction:auto-triggered ---
    await listen<{
      conversation_id: number;
      current_tokens: number;
      max_tokens: number;
      percentage: number;
    }>('compaction:auto-triggered', () => {
      toast.loading('Compacting conversation to keep chatting...', {
        id: 'auto-compaction',
        duration: 30_000,
      });
    });

    // --- compaction:completed ---
    await listen<{
      conversation_id: number;
      messages_compacted: number;
      tokens_before: number;
      tokens_after: number;
      savings_percent: number;
    }>('compaction:completed', (event) => {
      const { messages_compacted, savings_percent } = event.payload;
      toast.success(
        `Compacted ${messages_compacted} messages (${savings_percent.toFixed(0)}% saved)`,
        { id: 'auto-compaction', duration: 4_000 },
      );
    });

    // All listeners registered successfully — mark as initialized
    toolEventListenerInitialized = true;
  } catch (error) {
    console.error('[ToolStore] Failed to initialize tool event listener:', error);
  }
}
