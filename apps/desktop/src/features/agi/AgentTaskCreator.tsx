import { ExternalLink, Loader2, Rocket, Sparkles, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  DEFAULT_GOAL_ITERATIONS,
  DEFAULT_PARALLEL_AGENTS,
  MAX_GOAL_ITERATIONS,
  MAX_PARALLEL_AGENTS,
  useAgentTaskStore,
} from '../../stores/agentTaskStore';
import { useIsMounted } from '../../hooks/useIsMounted';
import { invoke, isTauri, relaunchApp } from '../../lib/tauri-mock';
import { getAgiTaskModelEligibility } from '../../lib/modelCapabilityGates';
import { useChatModelStore } from '@agiworkforce/unified-chat';

type ExecutionMode = 'auto' | 'sequential' | 'parallel' | 'swarm';
type TaskAutomationState = 'checking' | 'ready' | 'blocked' | 'restart-required' | 'error';

interface AutomationReadiness {
  accessibility: boolean;
  automation_service_ready: boolean;
}

export function resolveTaskAutomationState(
  readiness: AutomationReadiness,
): Exclude<TaskAutomationState, 'checking' | 'error'> {
  if (!readiness.accessibility) return 'blocked';
  if (readiness.automation_service_ready) return 'ready';
  return 'restart-required';
}

interface AgentTaskCreatorProps {
  onTaskCreated?: () => void;
}

export function AgentTaskCreator({ onTaskCreated }: AgentTaskCreatorProps) {
  const submitGoal = useAgentTaskStore((s) => s.submitGoal);
  const submitGoalSwarm = useAgentTaskStore((s) => s.submitGoalSwarm);
  const submitGoalAuto = useAgentTaskStore((s) => s.submitGoalAuto);
  const shouldUseSwarm = useAgentTaskStore((s) => s.shouldUseSwarm);
  const selectedModel = useChatModelStore((state) => state.getSelectedModel());
  const modelEligibility = getAgiTaskModelEligibility(selectedModel);

  const [goal, setGoal] = useState('');
  const [maxIterations, setMaxIterations] = useState(DEFAULT_GOAL_ITERATIONS);
  const [parallelAgents, setParallelAgents] = useState(DEFAULT_PARALLEL_AGENTS);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('auto');
  const [submitting, setSubmitting] = useState(false);
  const isMounted = useIsMounted();
  const [swarmRecommended, setSwarmRecommended] = useState(false);
  const [accessibilityState, setAccessibilityState] = useState<TaskAutomationState>(
    isTauri ? 'checking' : 'ready',
  );
  const [requestingAccessibility, setRequestingAccessibility] = useState(false);

  const refreshAccessibility = useCallback(async () => {
    if (!isTauri) {
      setAccessibilityState('ready');
      return;
    }
    setAccessibilityState('checking');
    try {
      const permissions = await invoke<AutomationReadiness>('check_automation_permissions');
      setAccessibilityState(resolveTaskAutomationState(permissions));
    } catch (error) {
      console.error('Failed to verify task automation permissions:', error);
      setAccessibilityState('error');
    }
  }, []);

  useEffect(() => {
    void refreshAccessibility();
  }, [refreshAccessibility]);

  const requestAccessibility = useCallback(async () => {
    setRequestingAccessibility(true);
    try {
      await invoke<void>('request_automation_permission', { kind: 'accessibility' });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not open macOS Accessibility settings.',
      );
    } finally {
      setRequestingAccessibility(false);
    }
  }, []);

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
    if (accessibilityState !== 'ready') {
      toast.error('Enable macOS Accessibility before launching a Task.');
      return;
    }
    const trimmed = goal.trim();
    if (!trimmed) {
      toast.error('Please describe what you want the AI to accomplish.');
      return;
    }
    if (!selectedModel) {
      toast.error('Choose an available model before launching a Task.');
      return;
    }
    if (!modelEligibility.eligible) {
      toast.error(modelEligibility.reason ?? 'The selected model is not verified for Tasks.');
      return;
    }

    const modelTarget = { modelId: selectedModel.id, provider: selectedModel.provider };

    setSubmitting(true);
    try {
      switch (executionMode) {
        case 'swarm':
          await submitGoalSwarm(trimmed, modelTarget);
          break;
        case 'auto':
          await submitGoalAuto(trimmed, modelTarget);
          break;
        case 'parallel':
          await submitGoal(trimmed, {
            ...modelTarget,
            numAgents: parallelAgents,
            parallel: true,
          });
          break;
        default:
          await submitGoal(trimmed, { ...modelTarget, maxIterations, parallel: false });
          break;
      }
      toast.success('Task launched successfully');
      if (isMounted.current) setGoal('');
      onTaskCreated?.();
    } catch {
      // The task store owns execution-error feedback so direct callers and the
      // creator surface show the same native message exactly once.
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  }, [
    accessibilityState,
    goal,
    isMounted,
    maxIterations,
    parallelAgents,
    executionMode,
    submitGoal,
    submitGoalSwarm,
    submitGoalAuto,
    onTaskCreated,
    modelEligibility.eligible,
    modelEligibility.reason,
    selectedModel,
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
              data-execution-mode={mode}
              aria-pressed={executionMode === mode}
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

      {executionMode === 'sequential' && (
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
            max={MAX_GOAL_ITERATIONS}
            value={maxIterations}
            onChange={(e) => setMaxIterations(Number(e.target.value))}
            className="w-full accent-teal-500"
            disabled={submitting}
          />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>1</span>
            <span>{MAX_GOAL_ITERATIONS}</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Execute-and-reflect passes one agent may take. Reaching the limit stops the run and
            marks it failed, so raise it for goals that need more passes.
          </p>
        </div>
      )}

      {executionMode === 'parallel' && (
        <div>
          <label
            htmlFor="agent-task-agents"
            className="mb-1.5 block text-sm font-medium text-slate-300"
          >
            Parallel agents: {parallelAgents}
          </label>
          <input
            id="agent-task-agents"
            type="range"
            min={1}
            max={MAX_PARALLEL_AGENTS}
            value={parallelAgents}
            onChange={(e) => setParallelAgents(Number(e.target.value))}
            className="w-full accent-teal-500"
            disabled={submitting}
          />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>1</span>
            <span>{MAX_PARALLEL_AGENTS}</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Each agent runs an isolated plan variant; review the selected execution before accepting
            it.
          </p>
        </div>
      )}

      {accessibilityState !== 'ready' && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"
        >
          <p className="font-medium">
            {accessibilityState === 'checking'
              ? 'Checking macOS Accessibility…'
              : accessibilityState === 'error'
                ? 'Accessibility status could not be verified'
                : accessibilityState === 'restart-required'
                  ? 'Restart AGI to finish enabling Tasks'
                  : 'Enable Accessibility to launch Tasks'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
            {accessibilityState === 'restart-required'
              ? 'macOS now allows Accessibility, but the protected automation service is created only when AGI starts. Quit and reopen AGI before launching a Task.'
              : 'Tasks can control approved apps while executing a plan, so macOS requires this system permission. AGI will still ask before privileged actions.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {accessibilityState === 'blocked' && (
              <button
                type="button"
                onClick={() => void requestAccessibility()}
                disabled={requestingAccessibility}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60"
              >
                {requestingAccessibility ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Open Accessibility settings
              </button>
            )}
            {accessibilityState !== 'checking' && (
              <button
                type="button"
                onClick={() => void refreshAccessibility()}
                className="rounded-lg border border-amber-200/20 px-3 py-1.5 text-xs font-medium hover:bg-amber-200/10"
              >
                Refresh status
              </button>
            )}
            {accessibilityState === 'restart-required' && (
              <button
                type="button"
                onClick={() => void relaunchApp()}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black"
              >
                Restart AGI
              </button>
            )}
          </div>
        </div>
      )}

      {!modelEligibility.eligible && (
        <div
          role="status"
          data-testid="agent-task-model-gate"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"
        >
          <p className="font-medium">This model is available for chat, not Tasks</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
            {modelEligibility.reason}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={
          submitting ||
          !goal.trim() ||
          !selectedModel ||
          !modelEligibility.eligible ||
          accessibilityState !== 'ready'
        }
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition',
          submitting ||
            !goal.trim() ||
            !selectedModel ||
            !modelEligibility.eligible ||
            accessibilityState !== 'ready'
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
