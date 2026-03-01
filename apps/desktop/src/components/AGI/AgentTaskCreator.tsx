import { Loader2, Rocket } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAgentTaskStore } from '../../stores/agentTaskStore';

interface AgentTaskCreatorProps {
  onTaskCreated?: () => void;
}

export function AgentTaskCreator({ onTaskCreated }: AgentTaskCreatorProps) {
  const submitGoal = useAgentTaskStore((s) => s.submitGoal);

  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(10);
  const [parallel, setParallel] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed) {
      toast.error('Please describe what you want the AI to accomplish.');
      return;
    }

    setSubmitting(true);
    try {
      await submitGoal(trimmed, { maxIterations, parallel });
      toast.success('Task launched successfully');
      setGoal('');
      onTaskCreated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit task';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [goal, maxIterations, parallel, submitGoal, onTaskCreated]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <label
          htmlFor="agent-task-goal"
          className="mb-1.5 block text-sm font-medium text-slate-300"
        >
          What do you want the AI to accomplish?
        </label>
        <textarea
          id="agent-task-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe a goal, e.g. 'Research competitor pricing models and create a summary report'"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30"
          rows={4}
          disabled={submitting}
        />
      </div>

      <div>
        <label
          htmlFor="agent-task-iterations"
          className="mb-1.5 block text-sm font-medium text-slate-300"
        >
          Max iterations: {maxIterations}
        </label>
        <input
          id="agent-task-iterations"
          type="range"
          min={1}
          max={20}
          value={maxIterations}
          onChange={(e) => setMaxIterations(Number(e.target.value))}
          className="w-full accent-teal-500"
          disabled={submitting}
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>1</span>
          <span>10</span>
          <span>20</span>
        </div>
      </div>

      <label
        htmlFor="agent-task-parallel"
        className="flex cursor-pointer items-center gap-2"
      >
        <input
          id="agent-task-parallel"
          type="checkbox"
          checked={parallel}
          onChange={(e) => setParallel(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5 accent-teal-500"
          disabled={submitting}
        />
        <span className="text-sm text-slate-300">Parallel execution</span>
        <span className="text-xs text-slate-500">(spawn multiple agents)</span>
      </label>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !goal.trim()}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition',
          submitting || !goal.trim()
            ? 'cursor-not-allowed bg-white/5 text-slate-500'
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
            <Rocket className="h-4 w-4" />
            Launch Task
          </>
        )}
      </button>
    </div>
  );
}
