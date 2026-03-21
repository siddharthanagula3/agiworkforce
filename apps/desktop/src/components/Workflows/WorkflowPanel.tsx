import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '../../stores/auth';
import { useWorkflows, type WorkflowExecutionState } from '../../hooks/useWorkflows';
import type { WorkflowDefinition, WorkflowStatus, WorkflowTrigger } from '../../types/workflow';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { Textarea } from '../ui/Textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';

interface WorkflowPanelProps {
  className?: string;
}

const STATUS_CONFIG: Record<
  WorkflowStatus,
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  pending: { icon: Clock, color: 'text-muted-foreground', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', label: 'Running' },
  paused: { icon: Pause, color: 'text-yellow-500', label: 'Paused' },
  completed: { icon: CheckCircle, color: 'text-green-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  cancelled: { icon: Square, color: 'text-muted-foreground', label: 'Cancelled' },
};

function getTriggerLabel(trigger: WorkflowTrigger): string {
  if (trigger.type === 'manual') {
    return 'Manual';
  }
  if (trigger.type === 'scheduled') {
    return `Scheduled: ${trigger.cron}`;
  }
  if (trigger.type === 'event') {
    return `Event: ${trigger.event_type}`;
  }
  if (trigger.type === 'webhook') {
    return 'Webhook';
  }
  return 'Unknown';
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

function formatDuration(startMs?: number, endMs?: number): string {
  if (!startMs) return 'N/A';
  const end = endMs || Date.now();
  const durationMs = end - startMs;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
}

export function WorkflowPanel({ className }: WorkflowPanelProps) {
  const {
    workflows,
    activeExecutions,
    isLoading,
    isExecuting,
    error,
    list,
    create,
    execute,
    pause,
    resume,
    cancel,
    remove,
    refresh,
    clearError,
  } = useWorkflows();

  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
  const [selectedForDelete, setSelectedForDelete] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const userId = useAuthStore((state) => state.getCurrentUserId());

  // Load workflows on mount
  useEffect(() => {
    if (userId) {
      list(userId).catch((err: unknown) => {
        toast.error('Failed to load workflows', {
          description: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }, [userId, list]);

  const toggleExpanded = useCallback((workflowId: string) => {
    setExpandedWorkflows((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newWorkflowName.trim() || !userId) return;
    setIsCreating(true);

    try {
      const definition: WorkflowDefinition = {
        id: '',
        user_id: userId,
        name: newWorkflowName.trim(),
        description: newWorkflowDescription.trim() || undefined,
        nodes: [],
        edges: [],
        triggers: [{ type: 'manual' }],
        metadata: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await create(definition);
      toast.success('Workflow created', { description: newWorkflowName.trim() });
      setShowCreateDialog(false);
      setNewWorkflowName('');
      setNewWorkflowDescription('');
    } catch (err) {
      toast.error('Failed to create workflow', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCreating(false);
    }
  }, [newWorkflowName, newWorkflowDescription, userId, create]);

  const handleExecute = useCallback(
    async (workflowId: string) => {
      try {
        await execute(workflowId);
        toast.success('Workflow started');
      } catch (err) {
        toast.error('Failed to execute workflow', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [execute],
  );

  const handlePause = useCallback(
    async (executionId: string) => {
      try {
        await pause(executionId);
        toast.info('Workflow paused');
      } catch (err) {
        toast.error('Failed to pause workflow', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [pause],
  );

  const handleResume = useCallback(
    async (executionId: string) => {
      try {
        await resume(executionId);
        toast.info('Workflow resumed');
      } catch (err) {
        toast.error('Failed to resume workflow', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [resume],
  );

  const handleCancel = useCallback(
    async (executionId: string) => {
      try {
        await cancel(executionId);
        toast.info('Workflow cancelled');
      } catch (err) {
        toast.error('Failed to cancel workflow', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [cancel],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedForDelete) return;

    try {
      await remove(selectedForDelete);
      setShowDeleteDialog(false);
      setSelectedForDelete(null);
      toast.success('Workflow deleted');
    } catch (err) {
      toast.error('Failed to delete workflow', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [selectedForDelete, remove]);

  const openDeleteDialog = useCallback((workflowId: string) => {
    setSelectedForDelete(workflowId);
    setShowDeleteDialog(true);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (userId) {
      try {
        await refresh(userId);
      } catch (err) {
        toast.error('Failed to refresh workflows', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, [userId, refresh]);

  // Get active execution for a workflow
  const getActiveExecution = useCallback(
    (workflowId: string): WorkflowExecutionState | undefined => {
      for (const [, state] of activeExecutions) {
        if (
          state.execution.workflow_id === workflowId &&
          ['pending', 'running', 'paused'].includes(state.execution.status)
        ) {
          return state;
        }
      }
      return undefined;
    },
    [activeExecutions],
  );

  // Sort workflows: running first, then by updated_at
  const sortedWorkflows = useMemo(() => {
    return [...workflows].sort((a, b) => {
      const aActive = getActiveExecution(a.id);
      const bActive = getActiveExecution(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return b.updated_at - a.updated_at;
    });
  }, [workflows, getActiveExecution]);

  if (isLoading && workflows.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading workflows...</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Workflows</span>
          <Badge variant="secondary">{workflows.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Workflows List */}
      {workflows.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateDialog(true)} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border">
            {sortedWorkflows.map((workflow) => {
              const isExpanded = expandedWorkflows.has(workflow.id);
              const activeExecution = getActiveExecution(workflow.id);
              const isActive = !!activeExecution;

              return (
                <WorkflowItem
                  key={workflow.id}
                  workflow={workflow}
                  isExpanded={isExpanded}
                  isActive={isActive}
                  isExecuting={isExecuting}
                  activeExecution={activeExecution}
                  onToggleExpanded={() => toggleExpanded(workflow.id)}
                  onExecute={() => handleExecute(workflow.id)}
                  onPause={handlePause}
                  onResume={handleResume}
                  onCancel={handleCancel}
                  onDelete={() => openDeleteDialog(workflow.id)}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Create Workflow Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              Create a new workflow to automate multi-step tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="workflow-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="workflow-name"
                placeholder="My Workflow"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newWorkflowName.trim()) {
                    handleCreate();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="workflow-description" className="text-sm font-medium">
                Description (optional)
              </label>
              <Textarea
                id="workflow-description"
                placeholder="Describe what this workflow does..."
                value={newWorkflowDescription}
                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newWorkflowName.trim() || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this workflow? This action cannot be undone. All
              execution history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface WorkflowItemProps {
  workflow: WorkflowDefinition;
  isExpanded: boolean;
  isActive: boolean;
  isExecuting: boolean;
  activeExecution?: WorkflowExecutionState;
  onToggleExpanded: () => void;
  onExecute: () => void;
  onPause: (executionId: string) => void;
  onResume: (executionId: string) => void;
  onCancel: (executionId: string) => void;
  onDelete: () => void;
}

function WorkflowItem({
  workflow,
  isExpanded,
  isActive,
  isExecuting,
  activeExecution,
  onToggleExpanded,
  onExecute,
  onPause,
  onResume,
  onCancel,
  onDelete,
}: WorkflowItemProps) {
  const trigger = workflow.triggers[0] ?? { type: 'manual' as const };
  const nodeCount = workflow.nodes.length;
  const statusConfig = activeExecution ? STATUS_CONFIG[activeExecution.execution.status] : null;
  const StatusIcon = statusConfig?.icon ?? Clock;

  return (
    <div className={cn('group', isActive && 'bg-primary/5')}>
      {/* Workflow Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Status indicator */}
        {activeExecution ? (
          <div
            className={cn('p-1.5 rounded-lg', statusConfig?.color.replace('text-', 'bg-') + '/10')}
          >
            <StatusIcon
              className={cn(
                'h-4 w-4',
                statusConfig?.color,
                activeExecution.execution.status === 'running' && 'animate-spin',
              )}
            />
          </div>
        ) : (
          <div className="p-1.5 rounded-lg bg-muted">
            <Zap className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Workflow info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm truncate">{workflow.name}</span>
            {isActive && statusConfig && (
              <Badge variant="outline" className="text-xs">
                {statusConfig.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {nodeCount} {nodeCount === 1 ? 'step' : 'steps'}
            </span>
            <span>{getTriggerLabel(trigger)}</span>
            {activeExecution?.execution.started_at && (
              <span>
                {formatDuration(
                  activeExecution.execution.started_at,
                  activeExecution.execution.completed_at,
                )}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {activeExecution ? (
            <>
              {activeExecution.execution.status === 'running' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPause(activeExecution.execution.id)}
                >
                  <Pause className="h-4 w-4" />
                </Button>
              )}
              {activeExecution.execution.status === 'paused' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onResume(activeExecution.execution.id)}
                >
                  <Play className="h-4 w-4" />
                </Button>
              )}
              {['running', 'paused', 'pending'].includes(activeExecution.execution.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(activeExecution.execution.id)}
                >
                  <Square className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onExecute} disabled={isExecuting}>
              <Play className="h-4 w-4" />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExecute} disabled={isActive || isExecuting}>
                <Play className="mr-2 h-4 w-4" />
                Run Now
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 pl-12">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Details</CardTitle>
              {workflow.description && (
                <CardDescription className="text-xs">{workflow.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="py-3">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <span className="ml-2">{formatTimestamp(workflow.created_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Updated:</span>
                  <span className="ml-2">{formatTimestamp(workflow.updated_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Triggers:</span>
                  <span className="ml-2">{workflow.triggers.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Nodes:</span>
                  <span className="ml-2">{workflow.nodes.length}</span>
                </div>
              </div>

              {/* Execution logs */}
              {activeExecution && activeExecution.logs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-2">Recent Activity</h4>
                  <div className="space-y-1">
                    {activeExecution.logs.slice(-5).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <span className="text-muted-foreground/50">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="font-mono">{log.node_id}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.event_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error display */}
              {activeExecution?.execution.error && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">{activeExecution.execution.error}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4 py-12">
      <div className="p-4 rounded-full bg-muted">
        <Zap className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="font-semibold">No Workflows Yet</h3>
        <p className="text-sm text-muted-foreground">
          Workflows let you automate multi-step tasks. Create your first workflow to get started
          with process automation.
        </p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Create Workflow
      </Button>
    </div>
  );
}

export default WorkflowPanel;
