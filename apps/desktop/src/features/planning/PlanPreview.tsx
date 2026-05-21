import { useState, useCallback } from 'react';
import {
  ListChecks,
  Loader2,
  Play,
  X,
  GripVertical,
  Trash2,
  Plus,
  Edit3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import type { TaskStep, PlanPreviewResponse } from '../../api/planning';
import { previewPlan, executePlan } from '../../api/planning';

interface PlanPreviewProps {
  /** If provided, start generating the plan immediately for this description. */
  initialDescription?: string;
  /** Called when plan execution starts. Passes the task ID. */
  onExecutionStarted?: (taskId: string) => void;
  /** Called when the panel is closed. */
  onClose?: () => void;
}

type PlanPhase = 'input' | 'generating' | 'preview' | 'executing' | 'done';

export function PlanPreview({ initialDescription, onExecutionStarted, onClose }: PlanPreviewProps) {
  const [description, setDescription] = useState(initialDescription ?? '');
  const [phase, setPhase] = useState<PlanPhase>(initialDescription ? 'generating' : 'input');
  const [steps, setSteps] = useState<TaskStep[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Generate plan
  const handleGeneratePlan = useCallback(
    async (desc?: string) => {
      const taskDesc = desc ?? description;
      if (!taskDesc.trim()) return;
      setPhase('generating');
      setError(null);

      try {
        const result: PlanPreviewResponse = await previewPlan(taskDesc);
        setSteps(result.steps);
        setPhase('preview');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('input');
      }
    },
    [description],
  );

  // Auto-generate if initialDescription is provided
  useState(() => {
    if (initialDescription) {
      handleGeneratePlan(initialDescription);
    }
  });

  // Execute approved plan
  const handleExecute = useCallback(async () => {
    if (steps.length === 0) return;
    setPhase('executing');
    setError(null);

    try {
      const result = await executePlan(description, steps);
      setTaskId(result.taskId);
      setPhase('done');
      onExecutionStarted?.(result.taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('preview');
    }
  }, [description, steps, onExecutionStarted]);

  // Step management
  const deleteStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    setSteps((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(from, 1);
      if (!removed) return prev;
      updated.splice(to, 0, removed);
      return updated;
    });
  };

  const startEdit = (step: TaskStep) => {
    setEditingStep(step.id);
    setEditValue(step.description);
  };

  const saveEdit = (stepId: string) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, description: editValue } : s)));
    setEditingStep(null);
  };

  const addStep = () => {
    const newStep: TaskStep = {
      id: `step_${steps.length + 1}`,
      action: { type: 'screenshot' },
      description: 'New step — click edit to configure',
      timeout: 10,
      retryOnFailure: false,
    };
    setSteps((prev) => [...prev, newStep]);
  };

  // Drag handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveStep(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'screenshot':
        return '📸';
      case 'click':
        return '🖱️';
      case 'type':
        return '⌨️';
      case 'navigate':
        return '🌐';
      case 'waitForElement':
        return '⏳';
      case 'executeCommand':
        return '💻';
      case 'readFile':
        return '📖';
      case 'writeFile':
        return '📝';
      case 'searchText':
        return '🔍';
      case 'scroll':
        return '📜';
      case 'pressKey':
        return '⌨️';
      default:
        return '⚡';
    }
  };

  const getActionLabel = (action: TaskStep['action']): string => {
    switch (action.type) {
      case 'screenshot':
        return 'Screenshot';
      case 'click':
        return `Click (${action.target.type})`;
      case 'type':
        return `Type "${action.text.slice(0, 30)}${action.text.length > 30 ? '...' : ''}"`;
      case 'navigate':
        return `Navigate → ${action.url}`;
      case 'waitForElement':
        return `Wait for element (${action.target.type})`;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <ListChecks className="h-4 w-4" />
          Interactive Plan Preview
        </div>
        {onClose && (
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Input phase */}
      {phase === 'input' && (
        <div className="flex flex-col gap-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want the agent to do..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
            rows={3}
          />
          <button
            onClick={() => handleGeneratePlan()}
            disabled={!description.trim()}
            className="self-start inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            Preview Plan
          </button>
        </div>
      )}

      {/* Generating phase */}
      {phase === 'generating' && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating plan for: &ldquo;{description.slice(0, 80)}
          {description.length > 80 ? '...' : ''}&rdquo;
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Preview phase — step list */}
      {phase === 'preview' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {steps.length} step{steps.length !== 1 ? 's' : ''} planned
            </span>
            <button
              onClick={() => handleGeneratePlan()}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          </div>

          {/* Step list */}
          <div className="flex flex-col gap-1">
            {steps.map((step, index) => {
              const isExpanded = expandedStep === step.id;
              const isEditing = editingStep === step.id;

              return (
                <div
                  key={step.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`rounded-md border transition-colors ${
                    dragIndex === index
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/30 bg-background/50 hover:border-border/60'
                  }`}
                >
                  {/* Step header */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
                    <span className="text-xs font-mono text-muted-foreground w-5">{index + 1}</span>
                    <span className="text-sm">{getActionIcon(step.action.type)}</span>

                    {isEditing ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(step.id)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(step.id)}
                        className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="flex-1 text-sm text-foreground/90 cursor-pointer"
                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                      >
                        {step.description}
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(step)}
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                        title="Edit step"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => deleteStep(index)}
                        className="p-0.5 text-muted-foreground hover:text-destructive"
                        title="Delete step"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                        className="p-0.5 text-muted-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Step detail */}
                  {isExpanded && (
                    <div className="border-t border-border/20 px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span>
                          <strong>Action:</strong> {getActionLabel(step.action)}
                        </span>
                        {step.expectedResult && (
                          <span>
                            <strong>Expected:</strong> {step.expectedResult}
                          </span>
                        )}
                        <div className="flex gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Timeout: {step.timeout}s
                          </span>
                          <span>Retry: {step.retryOnFailure ? '✅ Yes' : '❌ No'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add step button */}
          <button
            onClick={addStep}
            className="self-start inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Add step
          </button>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            <button
              onClick={handleExecute}
              disabled={steps.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Approve & Execute
            </button>
            <button
              onClick={() => {
                setPhase('input');
                setSteps([]);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Executing phase */}
      {phase === 'executing' && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Executing approved plan...
        </div>
      )}

      {/* Done phase */}
      {phase === 'done' && taskId && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Plan submitted for execution
          </div>
          <div className="text-xs text-muted-foreground">
            Task ID: <code className="rounded bg-muted px-1">{taskId}</code>
          </div>
          <button
            onClick={() => {
              setPhase('input');
              setSteps([]);
              setDescription('');
              setTaskId(null);
            }}
            className="self-start text-xs text-primary hover:underline"
          >
            New plan
          </button>
        </div>
      )}
    </div>
  );
}
