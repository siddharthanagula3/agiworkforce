import { useState, useCallback } from 'react';
import { Check, X, GripVertical, Play, Loader2, AlertTriangle } from 'lucide-react';
import type { TaskStep } from '../../api/planning';
import { previewPlan, executePlan } from '../../api/planning';

interface PlanPreviewProps {
  onPlanExecuted?: (taskId: string) => void;
  onCancel?: () => void;
}

type PlanState = 'idle' | 'generating' | 'reviewing' | 'executing' | 'error';

export function PlanPreview({ onPlanExecuted, onCancel }: PlanPreviewProps) {
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [planState, setPlanState] = useState<PlanState>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePlan = useCallback(async () => {
    if (!description.trim()) return;
    setPlanState('generating');
    setError(null);

    try {
      const result = await previewPlan(description);
      setSteps(result.steps);
      setPlanState('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPlanState('error');
    }
  }, [description]);

  const handleExecutePlan = useCallback(async () => {
    setPlanState('executing');
    setError(null);

    try {
      const result = await executePlan(description, steps);
      onPlanExecuted?.(result.taskId);
      setPlanState('idle');
      setDescription('');
      setSteps([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPlanState('error');
    }
  }, [description, steps, onPlanExecuted]);

  const handleRemoveStep = useCallback((stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  }, []);

  const handleMoveStep = useCallback((fromIndex: number, toIndex: number) => {
    setSteps((prev) => {
      const updated = [...prev];
      const moved = updated.splice(fromIndex, 1)[0];
      if (!moved) return prev;
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const getActionLabel = (step: TaskStep): string => {
    const action = step.action;
    switch (action.type) {
      case 'screenshot':
        return 'Take Screenshot';
      case 'click':
        return `Click ${action.target.type === 'textMatch' ? `"${action.target.text}"` : action.target.type}`;
      case 'type':
        return `Type "${action.text.slice(0, 30)}${action.text.length > 30 ? '...' : ''}"`;
      case 'navigate':
        return `Navigate to ${action.url}`;
      case 'waitForElement':
        return `Wait for element`;
      case 'executeCommand':
        return `Run: ${action.command}`;
      case 'readFile':
        return `Read: ${action.path}`;
      case 'writeFile':
        return `Write: ${action.path}`;
      case 'searchText':
        return `Search: "${action.query}"`;
      case 'scroll':
        return `Scroll ${action.direction}`;
      case 'pressKey':
        return `Press: ${action.keys.join('+')}`;
      default:
        return 'Unknown action';
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <Play className="h-4 w-4" />
        Interactive Plan Preview
      </div>

      {planState === 'idle' || planState === 'error' ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()}
            placeholder="Describe what you want the agent to do..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={handleGeneratePlan}
            disabled={!description.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Generate Plan
          </button>
        </div>
      ) : null}

      {planState === 'generating' && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating execution plan...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {planState === 'reviewing' && steps.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">
            {steps.length} step{steps.length !== 1 ? 's' : ''} — review, reorder, or remove steps
            before executing
          </div>

          <div className="flex flex-col gap-1">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="group flex items-center gap-2 rounded-md border border-border/30 bg-background/50 px-3 py-2 text-sm"
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" />

                <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{step.description}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {getActionLabel(step)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {index > 0 && (
                    <button
                      onClick={() => handleMoveStep(index, index - 1)}
                      className="rounded p-0.5 hover:bg-accent"
                      title="Move up"
                    >
                      <span className="text-xs">↑</span>
                    </button>
                  )}
                  {index < steps.length - 1 && (
                    <button
                      onClick={() => handleMoveStep(index, index + 1)}
                      className="rounded p-0.5 hover:bg-accent"
                      title="Move down"
                    >
                      <span className="text-xs">↓</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveStep(step.id)}
                    className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                    title="Remove step"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => {
                setPlanState('idle');
                setSteps([]);
                onCancel?.();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              onClick={handleExecutePlan}
              disabled={steps.length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Execute Plan ({steps.length} steps)
            </button>
          </div>
        </>
      )}

      {planState === 'executing' && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Executing approved plan...
        </div>
      )}
    </div>
  );
}
