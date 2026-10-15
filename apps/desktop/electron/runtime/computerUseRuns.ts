/**
 * Which screen-control run the person at this computer has allowed. The
 * session grant says the agent may use the screen at all; it is given once
 * and any script on the page's origin can call a screen step after it. So
 * each run, which is the steps of one task a user turn started, takes a yes
 * of its own in a native dialog, and a step that names no run is refused.
 *
 * One run is allowed at a time. It ends when it is stopped, when the grant
 * is withdrawn, or when no step has arrived for `COMPUTER_RUN_IDLE_MS`. A run
 * that was refused stays refused: asking again under the same id raises
 * nothing.
 */
export const COMPUTER_RUN_IDLE_MS = 5 * 60_000;
const REFUSED_REMEMBERED = 200;

let allowed: { runId: string; lastStepAtMs: number } | null = null;
const refused = new Set<string>();

export function computerRunAllowed(runId: string, now: number): boolean {
  if (allowed === null || allowed.runId !== runId) return false;
  if (now - allowed.lastStepAtMs > COMPUTER_RUN_IDLE_MS) {
    allowed = null;
    return false;
  }
  return true;
}

export function allowComputerRun(runId: string, now: number): void {
  refused.delete(runId);
  allowed = { runId, lastStepAtMs: now };
}

export function noteComputerRunStep(runId: string, now: number): void {
  if (allowed?.runId === runId) allowed.lastStepAtMs = now;
}

export function refuseComputerRun(runId: string): void {
  refused.delete(runId);
  refused.add(runId);
  for (const oldest of refused) {
    if (refused.size <= REFUSED_REMEMBERED) break;
    refused.delete(oldest);
  }
}

export function computerRunRefused(runId: string): boolean {
  return refused.has(runId);
}

export function endComputerRun(): void {
  allowed = null;
}

export function resetComputerRuns(): void {
  allowed = null;
  refused.clear();
}
