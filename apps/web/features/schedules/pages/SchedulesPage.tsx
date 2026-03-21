'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Plus, Calendar, Loader2, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { useScheduleStore } from '../stores/schedule-store';
import { ScheduleCard } from '../components/ScheduleCard';
import { ScheduleForm } from '../components/ScheduleForm';
import { INITIAL_FORM, INITIAL_NOTIFICATION_SETTINGS } from '../types';
import type { ScheduleFormData, Schedule } from '../types';

// ---------------------------------------------------------------------------
// Helper: build initial form from an existing schedule (for edit)
// ---------------------------------------------------------------------------

function scheduleToForm(schedule: Schedule): ScheduleFormData {
  return {
    name: schedule.name,
    prompt: schedule.prompt,
    model: schedule.model,
    recurrence: schedule.recurrence,
    timeOfDay: schedule.timeOfDay,
    timezone: schedule.timezone,
    isActive: schedule.isActive,
    cronExpression: schedule.cronExpression || '',
    daysOfWeek: schedule.daysOfWeek || [],
    dayOfMonth: schedule.dayOfMonth,
    notificationSettings: schedule.notificationSettings ?? INITIAL_NOTIFICATION_SETTINGS,
  };
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function SchedulesPage() {
  // ------------------------------------
  // Store
  // ------------------------------------
  const {
    schedules,
    loading,
    error,
    saving,
    deleting,
    dialogOpen,
    editingId,
    expandedHistoryId,
    runHistory,
    loadingHistoryId,
    fetchSchedules,
    saveSchedule,
    deleteSchedule,
    toggleActive,
    triggerRun,
    duplicateSchedule,
    openCreate,
    openEdit,
    closeDialog,
    toggleHistory,
    rerunFromHistory,
  } = useScheduleStore();

  // ------------------------------------
  // Local form state (lives here, not in the store, to avoid serialization issues)
  // ------------------------------------
  const [form, setForm] = useState<ScheduleFormData>(INITIAL_FORM);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ------------------------------------
  // Effects
  // ------------------------------------

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Sync form with editing schedule or reset for create
  useEffect(() => {
    if (!dialogOpen) return;

    if (editingId) {
      const schedule = schedules.find((s) => s.id === editingId);
      if (schedule) {
        setForm(scheduleToForm(schedule));
      }
    } else {
      // Check for prefill data from duplicate action
      const prefill = (useScheduleStore.getState() as { _prefill?: Partial<ScheduleFormData> })
        ._prefill;
      setForm(prefill ? { ...INITIAL_FORM, ...prefill } : INITIAL_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, editingId]);

  // ------------------------------------
  // Handlers
  // ------------------------------------

  const handleFormChange = useCallback((patch: Partial<ScheduleFormData>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    await saveSchedule(form);
  }, [saveSchedule, form]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    await deleteSchedule(deleteId);
    setDeleteId(null);
  }, [deleteSchedule, deleteId]);

  const handleDuplicate = useCallback(
    (schedule: Schedule) => {
      duplicateSchedule(schedule);
      // Store sets dialogOpen=true and _prefill; the useEffect above will pick it up.
    },
    [duplicateSchedule],
  );

  // ------------------------------------
  // Loading / Error states
  // ------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchSchedules}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // ------------------------------------
  // Render
  // ------------------------------------

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Schedule recurring AI tasks to run automatically
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchSchedules} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Schedule
          </Button>
        </div>
      </div>

      {/* Schedule List */}
      {schedules.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-1 text-lg font-medium">No schedules yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first scheduled task to get started
            </p>
            <Button onClick={openCreate} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create Schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              isHistoryExpanded={expandedHistoryId === schedule.id}
              historyRuns={runHistory[schedule.id] || []}
              historyLoading={loadingHistoryId === schedule.id}
              onToggleActive={toggleActive}
              onTriggerRun={triggerRun}
              onToggleHistory={toggleHistory}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
              onDuplicate={handleDuplicate}
              onRerun={rerunFromHistory}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {editingId ? 'Edit Schedule' : 'New Schedule'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the schedule configuration'
                : 'Schedule a recurring AI task to run automatically'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-y-auto pr-1">
            <ScheduleForm
              form={form}
              onChange={handleFormChange}
              onSave={handleSave}
              onCancel={closeDialog}
              saving={saving}
              isEdit={editingId !== null}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SchedulesPage;
