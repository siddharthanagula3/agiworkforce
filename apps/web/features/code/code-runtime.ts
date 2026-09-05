import type { CloudCodeRuntime } from '@agiworkforce/types';
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
    return 'Pick a coding agent to have its CLI already installed in the workspace, or an environment to drive yourself. This cannot be changed after the session is created.';
  }
  const headless = headlessHarnessCommand(selectedRuntime.id);
  if (!headless) {
    return `The workspace starts with ${selectedRuntime.name} installed, but an agent turn runs the generic tool-calling loop rather than ${selectedRuntime.name} directly; run \`${selectedRuntime.agentCommand}\` yourself in the terminal to use it as a harness. This cannot be changed after the session is created.`;
  }
  return `The workspace starts with ${selectedRuntime.name} installed. An agent turn runs it headlessly as \`${headless}\`, capped at ${HARNESS_BUDGET_MINUTES} minutes; run it yourself in the terminal to drive it interactively, then use ${CODE_COPY.commitAction} to publish the result. This cannot be changed after the session is created.`;
}
