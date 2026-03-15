/**
 * SchedulerPanel Component
 *
 * Main panel for managing scheduled jobs and cron tasks.
 * Provides a list view of jobs with actions to create, edit, pause/resume, and delete.
 */
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Code,
  Filter,
  Globe,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  Workflow,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useScheduler } from '@/hooks/useScheduler';
import type { ScheduledJob, SchedulerActionType, JobStatus } from '@/hooks/useScheduler';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { ScrollArea } from '../ui/ScrollArea';
import { Skeleton } from '../ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { Badge } from '../ui/Badge';
import { JobCreationDialog } from './JobCreationDialog';

// ============================================================================
// Types
// ============================================================================

type FilterType = 'all' | 'active' | 'paused' | 'failed';

interface SchedulerPanelProps {
  /** Optional CSS class name */
  className?: string;
  /** Callback when a job is triggered manually */
  onJobTriggered?: (job: ScheduledJob) => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the icon for an action type
 */
function getActionIcon(actionType: SchedulerActionType) {
  switch (actionType) {
    case 'notification':
      return <Bell className="h-4 w-4" />;
    case 'agiTask':
      return <RefreshCw className="h-4 w-4" />;
    case 'shellCommand':
      return <Terminal className="h-4 w-4" />;
    case 'workflow':
      return <Workflow className="h-4 w-4" />;
    case 'webhook':
      return <Globe className="h-4 w-4" />;
    case 'script':
      return <Code className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

/**
 * Get human-readable action type label
 */
function getActionLabel(actionType: SchedulerActionType): string {
  switch (actionType) {
    case 'notification':
      return 'Notification';
    case 'agiTask':
      return 'AI Task';
    case 'shellCommand':
      return 'Shell';
    case 'workflow':
      return 'Workflow';
    case 'webhook':
      return 'Webhook';
    case 'script':
      return 'Script';
    default:
      return 'Unknown';
  }
}

/**
 * Get the status badge variant
 */
function getStatusVariant(status: JobStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'paused':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'completed':
      return 'outline';
    default:
      return 'secondary';
  }
}

/**
 * Get the status icon
 */
function getStatusIcon(status: JobStatus) {
  switch (status) {
    case 'active':
      return <CheckCircle className="h-3 w-3" />;
    case 'paused':
      return <Pause className="h-3 w-3" />;
    case 'failed':
      return <XCircle className="h-3 w-3" />;
    case 'completed':
      return <CheckCircle className="h-3 w-3" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

// ============================================================================
// Job Card Component
// ============================================================================

interface JobCardProps {
  job: ScheduledJob;
  onEdit: (job: ScheduledJob) => void;
  onToggle: (jobId: string, enabled: boolean) => Promise<void>;
  onDelete: (jobId: string) => Promise<void>;
  onRunNow: (jobId: string) => Promise<void>;
}

function JobCard({ job, onEdit, onToggle, onDelete, onRunNow }: JobCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const isEnabled = job.status === 'active';

  const handleToggle = async () => {
    setIsToggling(true);
    try {
      await onToggle(job.id, !isEnabled);
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(job.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      await onRunNow(job.id);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        isEnabled ? 'bg-card' : 'bg-muted/30',
        isDeleting && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={cn(
            'rounded-full p-2.5',
            isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {getActionIcon(job.actionType)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium truncate">{job.name}</h4>
            <Badge variant={getStatusVariant(job.status)} className="flex items-center gap-1">
              {getStatusIcon(job.status)}
              {job.status}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              {getActionIcon(job.actionType)}
              {getActionLabel(job.actionType)}
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{job.schedule}</span>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {job.nextRun && isEnabled && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Next: {formatDistanceToNow(new Date(job.nextRun), { addSuffix: true })}
              </span>
            )}
            {job.lastRun && (
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Last: {formatDistanceToNow(new Date(job.lastRun), { addSuffix: true })}
              </span>
            )}
            {job.runCount > 0 && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {job.runCount} runs
              </span>
            )}
            {job.failureCount > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {job.failureCount} failures
              </span>
            )}
          </div>

          {/* Description */}
          {job.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
          )}
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleRunNow} disabled={isRunning || !isEnabled}>
              <Play className="mr-2 h-4 w-4" />
              {isRunning ? 'Running...' : 'Run Now'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(job)}>
              <Calendar className="mr-2 h-4 w-4" />
              Edit Job
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggle} disabled={isToggling}>
              {isEnabled ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  {isToggling ? 'Pausing...' : 'Pause Job'}
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  {isToggling ? 'Resuming...' : 'Resume Job'}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? 'Deleting...' : 'Delete Job'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SchedulerPanel({ className, onJobTriggered }: SchedulerPanelProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);

  // Use the scheduler hook
  const {
    jobs,
    isLoading,
    error,
    jobCount,
    activeJobCount,
    pausedJobCount,
    createJob,
    updateJob,
    deleteJob,
    toggleJob,
    runNow,
    refresh,
    clearError,
  } = useScheduler();

  // Filter jobs based on active filter
  const filteredJobs = useMemo(() => {
    switch (activeFilter) {
      case 'active':
        return jobs.filter((job) => job.status === 'active');
      case 'paused':
        return jobs.filter((job) => job.status === 'paused');
      case 'failed':
        return jobs.filter((job) => job.status === 'failed');
      case 'all':
      default:
        return jobs;
    }
  }, [jobs, activeFilter]);

  // Sort jobs: active first, then by nextRun
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      // Active jobs first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;

      // Then by nextRun
      if (a.nextRun && b.nextRun) {
        return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
      }
      if (a.nextRun) return -1;
      if (b.nextRun) return 1;

      // Then by createdAt
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredJobs]);

  // Count jobs by status
  const counts = useMemo(
    () => ({
      all: jobCount,
      active: activeJobCount,
      paused: pausedJobCount,
      failed: jobs.filter((j) => j.status === 'failed').length,
    }),
    [jobCount, activeJobCount, pausedJobCount, jobs],
  );

  // Handlers
  const handleEdit = useCallback((job: ScheduledJob) => {
    setEditingJob(job);
    setDialogOpen(true);
  }, []);

  const handleToggle = useCallback(
    async (jobId: string, enabled: boolean) => {
      await toggleJob(jobId, enabled);
    },
    [toggleJob],
  );

  const handleDelete = useCallback(
    async (jobId: string) => {
      await deleteJob(jobId);
    },
    [deleteJob],
  );

  const handleRunNow = useCallback(
    async (jobId: string) => {
      await runNow(jobId);
      const job = jobs.find((j) => j.id === jobId);
      if (job && onJobTriggered) {
        onJobTriggered(job);
      }
    },
    [runNow, jobs, onJobTriggered],
  );

  const handleSave = useCallback(
    async (
      name: string,
      schedule: string,
      actionType: SchedulerActionType,
      actionData: Record<string, unknown>,
    ) => {
      if (editingJob) {
        await updateJob(editingJob.id, {
          name,
          schedule,
          actionType,
          actionData,
        });
      } else {
        await createJob({
          name,
          schedule,
          actionType,
          actionData,
        });
      }
      setEditingJob(null);
    },
    [createJob, updateJob, editingJob],
  );

  const handleDialogClose = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingJob(null);
    }
  }, []);

  const handleNewJob = useCallback(() => {
    setEditingJob(null);
    setDialogOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    clearError();
    refresh().catch(console.error);
  }, [refresh, clearError]);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
          {jobCount > 0 && (
            <span className="text-sm text-muted-foreground">({activeJobCount} active)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={handleNewJob}>
            <Plus className="mr-1 h-4 w-4" />
            New Job
          </Button>
        </div>
      </div>

      {/* Tabs/Filters */}
      <Tabs
        value={activeFilter}
        onValueChange={(v) => setActiveFilter(v as FilterType)}
        className="flex-1 flex flex-col"
      >
        <div className="border-b px-4">
          <TabsList className="h-10 w-full justify-start bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              All
              {counts.all > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.all})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Active
              {counts.active > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.active})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="paused"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Pause className="mr-1.5 h-3.5 w-3.5" />
              Paused
              {counts.paused > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.paused})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="failed"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Failed
              {counts.failed > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.failed})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content */}
        <TabsContent value={activeFilter} className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {/* Error state */}
              {error && (
                <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2"
                    onClick={clearError}
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {/* Loading state */}
              {isLoading && jobs.length === 0 && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border p-4">
                      <div className="flex items-start gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!isLoading && sortedJobs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Calendar className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">No scheduled jobs</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-[300px]">
                    {activeFilter === 'all'
                      ? 'Create your first scheduled job to automate tasks.'
                      : `No ${activeFilter} jobs found.`}
                  </p>
                  {activeFilter === 'all' && (
                    <Button onClick={handleNewJob}>
                      <Plus className="mr-1 h-4 w-4" />
                      Create Job
                    </Button>
                  )}
                </div>
              )}

              {/* Job list */}
              {sortedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onEdit={handleEdit}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onRunNow={handleRunNow}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <JobCreationDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        existingJob={editingJob}
        onSave={handleSave}
      />
    </div>
  );
}

export default SchedulerPanel;
