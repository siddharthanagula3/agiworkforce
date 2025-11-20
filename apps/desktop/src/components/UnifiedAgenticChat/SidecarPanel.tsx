import React, { useState, useRef } from 'react';
import {
  Pin,
  X,
  Activity,
  Brain,
  FileText,
  Terminal,
  Wrench,
  ListTodo,
  Users,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useUnifiedChatStore, SidecarSection } from '../../stores/unifiedChatStore';
import type {
  ActionLogEntry,
  ApprovalRequest,
  PlanData,
  AgentStatus,
  WorkflowContext,
  ApprovalScope,
  ActionLogStatus,
} from '../../stores/unifiedChatStore';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useApprovalActions } from '../../hooks/useApprovalActions';
import { useOrchestratorActions } from '../../hooks/useOrchestratorActions';
import type { AgentPriority } from '../../api/orchestrator';

export interface SidecarPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  position?: 'right' | 'left' | 'bottom';
  width?: number;
  onWidthChange?: (width: number) => void;
  className?: string;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 400;

const SECTION_ICONS: Record<SidecarSection, React.ReactNode> = {
  operations: <Activity size={16} />,
  reasoning: <Brain size={16} />,
  files: <FileText size={16} />,
  terminal: <Terminal size={16} />,
  tools: <Wrench size={16} />,
  tasks: <ListTodo size={16} />,
  agents: <Users size={16} />,
};

const SECTION_LABELS: Record<SidecarSection, string> = {
  operations: 'Operations',
  reasoning: 'Reasoning',
  files: 'Files',
  terminal: 'Terminal',
  tools: 'Tools',
  tasks: 'Tasks',
  agents: 'Agents',
};

export const SidecarPanel: React.FC<SidecarPanelProps> = ({
  isOpen,
  onToggle,
  position = 'right',
  width: controlledWidth,
  onWidthChange,
  className = '',
}) => {
  const sidecarSection = useUnifiedChatStore((state) => state.sidecarSection);
  const setSidecarSection = useUnifiedChatStore((state) => state.setSidecarSection);
  const sidecarWidth = useUnifiedChatStore((state) => state.sidecarWidth);
  const setSidecarWidth = useUnifiedChatStore((state) => state.setSidecarWidth);
  const actionLog = useUnifiedChatStore((state) => state.actionLog);
  const pendingApprovals = useUnifiedChatStore((state) => state.pendingApprovals);
  const plan = useUnifiedChatStore((state) => state.plan);
  const agents = useUnifiedChatStore((state) => state.agents);
  const workflowContext = useUnifiedChatStore((state) => state.workflowContext);
  const { resolveApproval } = useApprovalActions();
  const [busyApproval, setBusyApproval] = useState<{
    id: string;
    decision: 'approve' | 'reject';
  } | null>(null);
  const approvalMap = React.useMemo(() => {
    const map = new Map<string, ApprovalRequest>();
    pendingApprovals.forEach((approval) => {
      const key = approval.actionId ?? approval.id;
      map.set(key, approval);
    });
    return map;
  }, [pendingApprovals]);

  const width = controlledWidth ?? sidecarWidth ?? DEFAULT_WIDTH;
  const [isResizing, setIsResizing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  const handleInlineDecision = async (
    approval: ApprovalRequest,
    decision: 'approve' | 'reject',
    options?: { trust?: boolean },
  ) => {
    setBusyApproval({ id: approval.id, decision });
    try {
      await resolveApproval(approval, decision, options);
    } catch (error) {
      console.error('[SidecarPanel] Failed to resolve approval', error);
    } finally {
      setBusyApproval(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = position === 'right' ? window.innerWidth - e.clientX : e.clientX;

      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

      if (onWidthChange) {
        onWidthChange(clampedWidth);
      } else {
        setSidecarWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, position, onWidthChange, setSidecarWidth]);

  if (!isOpen) {
    return null;
  }

  const sections: SidecarSection[] = [
    'operations',
    'reasoning',
    'files',
    'terminal',
    'tools',
    'tasks',
    'agents',
  ];

  return (
    <div
      ref={panelRef}
      className={`sidecar-panel flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 ${className}`}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        className={`absolute ${position === 'right' ? 'left-0' : 'right-0'} top-0 bottom-0 w-1 hover:w-1.5 bg-transparent hover:bg-blue-500 cursor-col-resize transition-all ${
          isResizing ? 'bg-blue-500 w-1.5' : ''
        }`}
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sidecar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`p-1.5 rounded transition-colors ${
              isPinned
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={14} />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-gray-600 dark:text-gray-400"
            title="Close sidecar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {sections.map((section) => (
          <button
            key={section}
            onClick={() => setSidecarSection(section)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              sidecarSection === section
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {SECTION_ICONS[section]}
            <span>{SECTION_LABELS[section]}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {sidecarSection === 'operations' && (
          <OperationsSection
            actionLog={actionLog}
            workflowContext={workflowContext}
            approvalMap={approvalMap}
            busyApproval={busyApproval}
            onResolveApproval={handleInlineDecision}
          />
        )}

        {sidecarSection === 'reasoning' && <PlanSection plan={plan} />}

        {sidecarSection === 'agents' && <AgentsSection agents={agents} />}

        {sidecarSection === 'files' && (
          <PlaceholderSection message="File operations will show here once the agent reads or writes files." />
        )}

        {sidecarSection === 'terminal' && (
          <PlaceholderSection message="Terminal commands executed by the agent will appear in the action log." />
        )}

        {sidecarSection === 'tools' && (
          <PlaceholderSection message="Tool usage metrics will be added in a later phase." />
        )}

        {sidecarSection === 'tasks' && (
          <PlaceholderSection message="Background tasks will be displayed here when available." />
        )}
      </div>
    </div>
  );
};

export default SidecarPanel;

interface OperationsSectionProps {
  actionLog: ActionLogEntry[];
  workflowContext: WorkflowContext | null;
  approvalMap: Map<string, ApprovalRequest>;
  busyApproval: { id: string; decision: 'approve' | 'reject' } | null;
  onResolveApproval: (
    approval: ApprovalRequest,
    decision: 'approve' | 'reject',
    options?: { trust?: boolean },
  ) => Promise<void>;
}

const OperationsSection: React.FC<OperationsSectionProps> = ({
  actionLog,
  workflowContext,
  approvalMap,
  busyApproval,
  onResolveApproval,
}) => {
  const hasLog = actionLog.length > 0;

  return (
    <div className="flex h-full flex-col">
      {workflowContext && (
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Workflow
          </p>
          {workflowContext.entryPoint && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Entry: {workflowContext.entryPoint}
            </p>
          )}
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {workflowContext.description ?? workflowContext.entryPoint ?? workflowContext.hash}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 break-all">
            Hash: {workflowContext.hash}
          </p>
        </div>
      )}

      <div className="flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
        {!hasLog && (
          <div className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Agent actions will appear here once a workflow starts.
          </div>
        )}

        {actionLog.map((entry) => {
          const approval = entry.actionId ? approvalMap.get(entry.actionId) : undefined;
          const status = getStatusDisplay(entry.status);
          const timestamp = formatTimestamp(entry.createdAt);

          return (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-1 flex h-7 w-7 items-center justify-center rounded-full',
                      status.bgClass,
                    )}
                  >
                    <status.icon
                      className={cn('h-4 w-4', status.iconClass, status.spin && 'animate-spin')}
                    />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {entry.title}
                    </p>
                    {entry.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.description}
                      </p>
                    )}
                  </div>
                </div>
                {timestamp && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{timestamp}</span>
                )}
              </div>

              {entry.scope && (
                <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs font-mono text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
                  {renderScopeSummary(entry.scope)}
                </div>
              )}

              {entry.result && (
                <p className="mt-2 text-xs font-mono text-green-600 dark:text-green-400">
                  {entry.result}
                </p>
              )}

              {entry.error && (
                <p className="mt-2 text-xs font-mono text-red-500 dark:text-red-400">
                  {entry.error}
                </p>
              )}

              {approval && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onResolveApproval(approval, 'approve')}
                    disabled={busyApproval?.id === approval.id}
                    className="gap-2"
                  >
                    {busyApproval?.id === approval.id && busyApproval.decision === 'approve' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onResolveApproval(approval, 'reject')}
                    disabled={busyApproval?.id === approval.id}
                    className="gap-2"
                  >
                    {busyApproval?.id === approval.id && busyApproval.decision === 'reject' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Deny
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PlanSection: React.FC<{ plan: PlanData | null }> = ({ plan }) => {
  if (!plan) {
    return (
      <PlaceholderSection message="The agent will share its plan here once it begins reasoning." />
    );
  }

  return (
    <div className="space-y-3 p-4">
      {plan.steps.map((step) => {
        const status = getStatusDisplay(step.status);
        return (
          <div key={step.id} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <status.icon
                  className={cn('h-4 w-4', status.iconClass, status.spin && 'animate-spin')}
                />
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{step.title}</p>
              </div>
              <span className={cn('text-xs font-medium', status.textClass)}>{status.label}</span>
            </div>
            {step.description && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{step.description}</p>
            )}
            {step.result && (
              <p className="mt-2 text-xs font-mono text-gray-600 dark:text-gray-300">
                {step.result}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

const AgentsSection: React.FC<{ agents: AgentStatus[] }> = ({ agents }) => {
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState<AgentPriority>('medium');
  const { spawnAgent, isSubmitting, error } = useOrchestratorActions();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim()) {
      return;
    }
    try {
      await spawnAgent({ description: description.trim(), priority });
      setDescription('');
    } catch (err) {
      console.error('[SidecarPanel] Failed to spawn agent', err);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">New AI Worker</p>
        <textarea
          className="mt-2 w-full rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          placeholder="Describe the task for a specialist agent..."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
        <div className="mt-2 flex items-center justify-between">
          <select
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs uppercase tracking-wide text-gray-600 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            value={priority}
            onChange={(event) => setPriority(event.target.value as AgentPriority)}
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="critical">Critical</option>
          </select>
          <Button
            type="submit"
            size="xs"
            variant="secondary"
            disabled={!description.trim() || isSubmitting}
          >
            {isSubmitting ? 'Spawning…' : 'Spawn Agent'}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}
      </form>
      {(!agents || agents.length === 0) && (
        <PlaceholderSection message="Agents will appear here once a workflow spawns workers." />
      )}

      {agents.map((agent) => (
        <div key={agent.id} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{agent.name}</p>
            <span className="text-xs text-gray-500 dark:text-gray-400">{agent.status}</span>
          </div>
          {agent.currentGoal && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{agent.currentGoal}</p>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${agent.progress}%` }}
            />
          </div>
          {agent.error && (
            <p className="mt-2 text-xs text-red-500 dark:text-red-400">{agent.error}</p>
          )}
        </div>
      ))}
    </div>
  );
};

const PlaceholderSection: React.FC<{ message: string }> = ({ message }) => (
  <div className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{message}</div>
);

interface StatusDisplay {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass: string;
  bgClass: string;
  textClass: string;
  spin?: boolean;
}

const STATUS_MAP: Record<ActionLogStatus, StatusDisplay> = {
  pending: {
    icon: Clock,
    label: 'Pending',
    iconClass: 'text-gray-500',
    bgClass: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-500 dark:text-gray-400',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    iconClass: 'text-blue-500',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    textClass: 'text-blue-600 dark:text-blue-400',
    spin: true,
  },
  success: {
    icon: CheckCircle2,
    label: 'Completed',
    iconClass: 'text-green-500',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
    textClass: 'text-green-600 dark:text-green-400',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    iconClass: 'text-red-500',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
    textClass: 'text-red-600 dark:text-red-400',
  },
  blocked: {
    icon: AlertTriangle,
    label: 'Waiting',
    iconClass: 'text-amber-500',
    bgClass: 'bg-amber-50 dark:bg-amber-900/20',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
};

function getStatusDisplay(status: ActionLogStatus): StatusDisplay {
  return STATUS_MAP[status] ?? STATUS_MAP.pending;
}

function formatTimestamp(value?: Date): string | null {
  if (!value) {
    return null;
  }
  try {
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return null;
  }
}

function renderScopeSummary(scope: ApprovalScope): string {
  switch (scope.type) {
    case 'terminal':
      return `${scope.command ?? 'command'}${scope.cwd ? ` • ${scope.cwd}` : ''}`;
    case 'filesystem':
      return `${scope.description ?? 'filesystem change'}${scope.path ? ` • ${scope.path}` : ''}`;
    case 'browser':
      return `${scope.description ?? 'browser action'}${scope.domain ? ` • ${scope.domain}` : ''}`;
    case 'ui':
      return scope.description ?? 'UI automation';
    case 'mcp':
      return scope.description ?? 'MCP tool invocation';
    default:
      return scope.description ?? 'Agent action';
  }
}
