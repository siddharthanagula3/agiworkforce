import {
  canAccessModelForSubscriptionTier,
  getSelectableModels,
  type CloudCodeRuntime,
} from '@agiworkforce/types';
import { selectHarnessRunner } from '@/lib/e2b/harnesses/registry';
import { HARNESS_MAX_TURNS, HARNESS_RUN_DEADLINE_MS } from '@/lib/e2b/harnesses/budget';
import { CODE_COPY } from './code-surface';

const HARNESS_HINT_TASK_PLACEHOLDER = 'your task';
const MS_PER_MINUTE = 60_000;
const BYTES_PER_GIGABYTE = 1024;

export const HARNESS_BUDGET_MINUTES = Math.round(HARNESS_RUN_DEADLINE_MS / MS_PER_MINUTE);

export function headlessHarnessCommand(runtimeId: string): string | null {
  const runner = selectHarnessRunner(runtimeId);
  if (!runner) return null;
  return runner.buildCommand({
    prompt: HARNESS_HINT_TASK_PLACEHOLDER,
    workspacePath: '',
    maxTurns: HARNESS_MAX_TURNS,
    timeoutMs: HARNESS_RUN_DEADLINE_MS,
    resumeSessionId: null,
  });
}

export function describeRuntime(runtime: CloudCodeRuntime): string {
  const cores = runtime.cpuCount > 0 ? `${runtime.cpuCount} vCPU` : null;
  const memory =
    runtime.memoryMB > 0 ? `${Math.round(runtime.memoryMB / BYTES_PER_GIGABYTE)} GB RAM` : null;
  const detail = [runtime.summary, [cores, memory].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  const label = detail ? `${runtime.name}, ${detail}` : runtime.name;
  return runtime.needsUserCredential ? `${label}, needs your own API key` : label;
}

export function runtimeHelpText(
  runtimeCount: number,
  selectedRuntime: CloudCodeRuntime | null,
): string {
  if (runtimeCount === 0) return CODE_COPY.emptyRuntimeCatalogue;
  if (!selectedRuntime?.agentCommand) {
    return 'Pick an agent to preinstall, or an environment to drive yourself. It can’t be changed later.';
  }
  const headless = headlessHarnessCommand(selectedRuntime.id);
  if (!headless) {
    return `${selectedRuntime.name} comes installed, but turns use the generic tool-calling loop. Run \`${selectedRuntime.agentCommand}\` in the terminal to use it. It can’t be changed later.`;
  }
  return `${selectedRuntime.name} comes installed and runs as \`${headless}\`, capped at ${HARNESS_BUDGET_MINUTES} minutes a turn. It can’t be changed later.`;
}

export interface HarnessModelChoice {
  id: string;
  name: string;
}

export function harnessModelChoices(
  runtime: CloudCodeRuntime | null,
  planTier: string | null,
): HarnessModelChoice[] {
  const provider = runtime?.modelProvider;
  if (!provider || !planTier) return [];
  return getSelectableModels()
    .filter(
      (model) =>
        model.provider === provider && canAccessModelForSubscriptionTier(model.id, planTier),
    )
    .map((model) => ({ id: model.id, name: model.name }));
}
