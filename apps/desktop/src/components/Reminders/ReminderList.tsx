/**
 * ReminderList Component
 *
 * Displays all scheduled reminders and tasks with filtering capabilities.
 * Uses schedulerStore for data management.
 */
import { Bell, Calendar, CheckCircle, Filter, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  selectJobs,
  selectSchedulerError,
  selectSchedulerLoading,
  type ScheduledJob,
  useSchedulerStore,
} from '@/stores/schedulerStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { Skeleton } from '../ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ReminderCard } from './ReminderCard';
import { ReminderDialog } from './ReminderDialog';

type FilterType = 'all' | 'reminders' | 'recurring' | 'completed';

interface ReminderListProps {
  /** Optional CSS class name */
  className?: string;
  /** Callback when a reminder is triggered (reserved for future use) */
  onReminderTriggered?: (job: ScheduledJob) => void;
}

export function ReminderList({
  className,
  onReminderTriggered: _onReminderTriggered,
}: ReminderListProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);

  // Store state
  const jobs = useSchedulerStore(selectJobs);
  const isLoading = useSchedulerStore(selectSchedulerLoading);
  const error = useSchedulerStore(selectSchedulerError);

  // Store actions
  const listJobs = useSchedulerStore((state) => state.listJobs);
  const addJob = useSchedulerStore((state) => state.addJob);
  const removeJob = useSchedulerStore((state) => state.removeJob);
  const pauseJob = useSchedulerStore((state) => state.pauseJob);
  const resumeJob = useSchedulerStore((state) => state.resumeJob);
  const initEventListeners = useSchedulerStore((state) => state.initEventListeners);
  const cleanupEventListeners = useSchedulerStore((state) => state.cleanupEventListeners);

  // Initialize on mount
  useEffect(() => {
    listJobs().catch(console.error);
    initEventListeners().catch(console.error);

    return () => {
      cleanupEventListeners();
    };
  }, [listJobs, initEventListeners, cleanupEventListeners]);

  // Filter jobs based on active filter
  const filteredJobs = useMemo(() => {
    switch (activeFilter) {
      case 'reminders':
        return jobs.filter((job) => job.action_type === 'reminder');

      case 'recurring':
        return jobs.filter(
          (job) => job.schedule_type === 'cron' || job.schedule_type === 'interval',
        );

      case 'completed':
        return jobs.filter((job) => {
          // One-time jobs that have already run
          if (job.schedule_type === 'once' && job.last_run) {
            return true;
          }
          // Disabled jobs
          return !job.enabled;
        });

      case 'all':
      default:
        return jobs;
    }
  }, [jobs, activeFilter]);

  // Sort jobs: enabled first, then by next_run
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      // Enabled jobs first
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }

      // Then by next_run
      if (a.next_run && b.next_run) {
        return new Date(a.next_run).getTime() - new Date(b.next_run).getTime();
      }
      if (a.next_run) return -1;
      if (b.next_run) return 1;

      // Then by created_at
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filteredJobs]);

  // Handlers
  const handlePause = useCallback(
    async (jobId: string) => {
      await pauseJob(jobId);
    },
    [pauseJob],
  );

  const handleResume = useCallback(
    async (jobId: string) => {
      await resumeJob(jobId);
    },
    [resumeJob],
  );

  const handleEdit = useCallback((job: ScheduledJob) => {
    setEditingJob(job);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (jobId: string) => {
      await removeJob(jobId);
    },
    [removeJob],
  );

  const handleSave = useCallback(
    async (name: string, schedule: string, actionType: string, actionData: string) => {
      if (editingJob) {
        // For editing, we need to delete and recreate since the API doesn't support update
        await removeJob(editingJob.id);
      }
      await addJob(name, schedule, actionType, actionData);
      setEditingJob(null);
    },
    [addJob, removeJob, editingJob],
  );

  const handleDialogClose = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingJob(null);
    }
  }, []);

  const handleNewReminder = useCallback(() => {
    setEditingJob(null);
    setDialogOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    listJobs().catch(console.error);
  }, [listJobs]);

  // Count jobs for each filter
  const counts = useMemo(
    () => ({
      all: jobs.length,
      reminders: jobs.filter((j) => j.action_type === 'reminder').length,
      recurring: jobs.filter((j) => j.schedule_type === 'cron' || j.schedule_type === 'interval')
        .length,
      completed: jobs.filter((j) => (j.schedule_type === 'once' && j.last_run) || !j.enabled)
        .length,
    }),
    [jobs],
  );

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Reminders</h2>
          {jobs.length > 0 && (
            <span className="text-sm text-muted-foreground">
              ({jobs.filter((j) => j.enabled).length} active)
            </span>
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
          <Button size="sm" onClick={handleNewReminder}>
            <Plus className="mr-1 h-4 w-4" />
            New Reminder
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
              value="reminders"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Reminders
              {counts.reminders > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.reminders})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="recurring"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Calendar className="mr-1.5 h-3.5 w-3.5" />
              Recurring
              {counts.recurring > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.recurring})</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Completed
              {counts.completed > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.completed})</span>
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
                <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Loading state */}
              {isLoading && jobs.length === 0 && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border p-4">
                      <div className="flex items-start gap-3">
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
                    <Bell className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">No reminders yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-[300px]">
                    {activeFilter === 'all'
                      ? 'Create your first reminder to get started with scheduled tasks.'
                      : `No ${activeFilter === 'reminders' ? 'reminders' : activeFilter === 'recurring' ? 'recurring tasks' : 'completed items'} found.`}
                  </p>
                  {activeFilter === 'all' && (
                    <Button onClick={handleNewReminder}>
                      <Plus className="mr-1 h-4 w-4" />
                      Create Reminder
                    </Button>
                  )}
                </div>
              )}

              {/* Job list */}
              {sortedJobs.map((job) => (
                <ReminderCard
                  key={job.id}
                  job={job}
                  onPause={handlePause}
                  onResume={handleResume}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Dialog */}
      <ReminderDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        existingJob={editingJob}
        onSave={handleSave}
      />
    </div>
  );
}
