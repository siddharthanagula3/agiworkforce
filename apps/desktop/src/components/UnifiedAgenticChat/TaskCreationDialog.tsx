// TaskCreationDialog.tsx
// Dialog for creating a new autonomous agent task.
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Zap } from 'lucide-react';
import { invoke } from '../../lib/tauri-mock';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Switch } from '../ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { useModelStore } from '../../stores/modelStore';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TaskCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SubmitGoalAutoResponse {
  taskId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ITERATION_MIN = 1;
const ITERATION_MAX = 100;
const ITERATION_DEFAULT = 25;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TaskCreationDialog({ open, onOpenChange }: TaskCreationDialogProps) {
  // Form state
  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(ITERATION_DEFAULT);
  const [autoApprove, setAutoApprove] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [iterationsError, setIterationsError] = useState<string | null>(null);

  // Model selection — pull available models from the model store
  const selectedModel = useModelStore((s) => s.selectedModel);
  const recentModels = useModelStore((s) => s.recentModels);
  const [chosenModel, setChosenModel] = useState<string>(selectedModel ?? '');

  // Build model options: recent + current, de-duplicated
  const modelOptions = Array.from(
    new Set([...(selectedModel ? [selectedModel] : []), ...recentModels.slice(0, 8)]),
  ).filter(Boolean);

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateIterations = useCallback((value: number): boolean => {
    if (value < ITERATION_MIN || value > ITERATION_MAX) {
      setIterationsError(`Must be between ${ITERATION_MIN} and ${ITERATION_MAX}`);
      return false;
    }
    setIterationsError(null);
    return true;
  }, []);

  const handleIterationsChange = useCallback(
    (raw: string) => {
      const num = parseInt(raw, 10);
      if (isNaN(num)) {
        setIterationsError('Must be a number');
        return;
      }
      setMaxIterations(num);
      validateIterations(num);
    },
    [validateIterations],
  );

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const trimmedGoal = goal.trim();

    if (!trimmedGoal) {
      toast.error('Please describe the goal for this task.');
      return;
    }

    if (!validateIterations(maxIterations)) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await invoke<SubmitGoalAutoResponse>('agi_submit_goal_auto', {
        goal: trimmedGoal,
        maxIterations,
        autoApprove,
        model: chosenModel || undefined,
      });

      // Optimistic task add via store
      const newTask = {
        id: result?.taskId ?? `task_${Date.now()}`,
        goal: trimmedGoal,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };
      const current = useAgentTaskStore.getState();
      // Add task without duplicating
      if (!current.tasks.find((t) => t.id === newTask.id)) {
        useAgentTaskStore.setState((state) => ({
          tasks: [newTask, ...state.tasks],
        }));
      }

      toast.success('Task launched successfully');
      onOpenChange(false);
      // Reset form fields
      setGoal('');
      setMaxIterations(ITERATION_DEFAULT);
      setAutoApprove(true);
      setIterationsError(null);
      setChosenModel(selectedModel ?? '');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit task';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    goal,
    maxIterations,
    autoApprove,
    chosenModel,
    validateIterations,
    onOpenChange,
    selectedModel,
  ]);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!submitting) {
        onOpenChange(value);
        if (!value) {
          setGoal('');
          setMaxIterations(ITERATION_DEFAULT);
          setAutoApprove(true);
          setIterationsError(null);
          setChosenModel(selectedModel ?? '');
        }
      }
    },
    [submitting, onOpenChange, selectedModel],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const isValid = goal.trim().length > 0 && !iterationsError;

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

          {/* Model selector */}
          {modelOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Model</label>
              <Select value={chosenModel} onValueChange={setChosenModel} disabled={submitting}>
                <SelectTrigger className="border-white/10 bg-white/5 text-sm text-foreground focus:ring-teal-500/30">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0f1117] text-foreground">
                  {modelOptions.map((modelId) => (
                    <SelectItem
                      key={modelId}
                      value={modelId}
                      className="focus:bg-white/10 focus:text-foreground"
                    >
                      {modelId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Max iterations */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-iterations" className="text-sm font-medium text-foreground">
              Max Iterations
            </label>
            <div className="flex items-center gap-3">
              <input
                id="task-iterations"
                type="number"
                min={ITERATION_MIN}
                max={ITERATION_MAX}
                value={maxIterations}
                onChange={(e) => handleIterationsChange(e.target.value)}
                disabled={submitting}
                className={cn(
                  'w-24 rounded-lg border bg-white/5 px-3 py-2 text-sm text-foreground',
                  'outline-none transition focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30',
                  iterationsError ? 'border-red-500/50' : 'border-white/10',
                  submitting && 'opacity-50',
                )}
              />
              <span className="text-xs text-muted-foreground">
                {ITERATION_MIN}–{ITERATION_MAX} iterations
              </span>
            </div>
            {iterationsError && <p className="text-xs text-red-400">{iterationsError}</p>}
          </div>

          {/* Auto-approve toggle */}
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">Auto-approve</span>
              <span className="text-xs text-muted-foreground">
                Execute tool calls without pausing for confirmation
              </span>
            </div>
            <Switch
              checked={autoApprove}
              onCheckedChange={setAutoApprove}
              disabled={submitting}
              className="data-[state=checked]:bg-teal-600"
            />
          </div>
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
