// TaskCreationDialog.tsx
// Dialog for creating a new autonomous agent task.
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TaskCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TaskCreationDialog({ open, onOpenChange }: TaskCreationDialogProps) {
  // Form state
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitGoalAuto = useAgentTaskStore((state) => state.submitGoalAuto);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const trimmedGoal = goal.trim();

    if (!trimmedGoal) {
      toast.error('Please describe the goal for this task.');
      return;
    }

    setSubmitting(true);
    try {
      await submitGoalAuto(trimmedGoal);

      toast.success('Task launched successfully');
      onOpenChange(false);
      setGoal('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit task';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [goal, onOpenChange, submitGoalAuto]);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!submitting) {
        onOpenChange(value);
        if (!value) {
          setGoal('');
        }
      }
    },
    [submitting, onOpenChange],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const isValid = goal.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border border-white/10 bg-[#0f1117] text-foreground sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Zap className="h-5 w-5 text-teal-400" />
            New Autonomous Task
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Describe a goal and the AI agent will plan and execute it autonomously.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Goal textarea */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-goal" className="text-sm font-medium text-foreground">
              Goal
              <span className="ml-1 text-red-400">*</span>
            </label>
            <textarea
              id="task-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder='e.g. "Research competitor pricing models and write a summary report"'
              rows={4}
              disabled={submitting}
              className={cn(
                'w-full resize-none rounded-lg border bg-white/5 px-3 py-2 text-sm text-foreground',
                'placeholder-muted-foreground outline-none transition',
                'focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30',
                goal.trim().length === 0 ? 'border-white/10' : 'border-teal-500/30',
                submitting && 'opacity-50',
              )}
            />
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            The task uses your current model and approval settings. You can review every requested
            tool action while it runs.
          </p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !isValid}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
              submitting || !isValid
                ? 'cursor-not-allowed bg-white/5 text-muted-foreground'
                : 'bg-teal-600 text-white hover:bg-teal-500',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Launch Task
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
