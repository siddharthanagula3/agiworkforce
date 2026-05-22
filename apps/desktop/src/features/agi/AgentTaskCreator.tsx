import { Loader2, Rocket, Sparkles, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAgentTaskStore } from '../../stores/agentTaskStore';

type ExecutionMode = 'auto' | 'sequential' | 'parallel' | 'swarm';

interface AgentTaskCreatorProps {
  onTaskCreated?: () => void;
}

export function AgentTaskCreator({ onTaskCreated }: AgentTaskCreatorProps) {
  const submitGoal = useAgentTaskStore((s) => s.submitGoal);
  const submitGoalSwarm = useAgentTaskStore((s) => s.submitGoalSwarm);
  const submitGoalAuto = useAgentTaskStore((s) => s.submitGoalAuto);
  const shouldUseSwarm = useAgentTaskStore((s) => s.shouldUseSwarm);

  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(10);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto');
  const [submitting, setSubmitting] = useState(false);
  const [swarmRecommended, setSwarmRecommended] = useState(false);

  // Check if swarm is recommended when goal changes
  useEffect(() => {
    const trimmed = goal.trim();
    if (trimmed.length < 20) {
      setSwarmRecommended(false);
      return;
    }

    const timer = setTimeout(() => {
      shouldUseSwarm(trimmed)
        .then(setSwarmRecommended)
        .catch((err: unknown) => {
          console.error('Failed to check swarm recommendation:', err);
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [goal, shouldUseSwarm]);

  const handleSubmit = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed) {
      toast.error('Please describe what you want the AI to accomplish.');
      return;
    }

    setSubmitting(true);
    try {
      switch (executionMode) {
        case 'swarm':
          await submitGoalSwarm(trimmed);
          break;
        case 'auto':
          await submitGoalAuto(trimmed);
          break;
        case 'parallel':
          await submitGoal(trimmed, { maxIterations, parallel: true });
          break;
        default:
          await submitGoal(trimmed, { maxIterations, parallel: false });
          break;
      }
      toast.success('Task launched successfully');
      setGoal('');
      onTaskCreated?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit task';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    goal,
    maxIterations,
    executionMode,
    submitGoal,
    submitGoalSwarm,
    submitGoalAuto,
    onTaskCreated,
  ]);

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
        {swarmRecommended && executionMode !== 'swarm' && (
          <button
            type="button"
            onClick={() => setExecutionMode('swarm')}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition"
          >
            <Zap className="h-3 w-3" />
            Swarm execution recommended for this goal
          </button>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Execution mode</label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              {
                mode: 'auto' as const,
                label: 'Auto',
                desc: 'AI picks best strategy',
                icon: Sparkles,
              },
              {
                mode: 'sequential' as const,
                label: 'Sequential',
                desc: 'Step by step',
                icon: Rocket,
              },
              { mode: 'parallel' as const, label: 'Parallel', desc: 'Multiple agents', icon: Zap },
              { mode: 'swarm' as const, label: 'Swarm', desc: 'Max parallelism', icon: Zap },
            ] as const
          ).map(({ mode, label, desc, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setExecutionMode(mode)}
              disabled={submitting}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition',
                executionMode === mode
                  ? 'border-teal-500/50 bg-teal-500/10 text-teal-300'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <div>
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[10px] opacity-60">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {(executionMode === 'sequential' || executionMode === 'parallel') && (
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
      )}

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
