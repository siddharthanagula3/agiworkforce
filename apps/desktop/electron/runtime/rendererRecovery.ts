import type { DesktopTelemetryCause } from './desktopTelemetry';

export type RendererGoneReason =
  | 'clean-exit'
  | 'abnormal-exit'
  | 'killed'
  | 'crashed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure';

export type RendererFault = { kind: 'gone'; reason: RendererGoneReason } | { kind: 'unresponsive' };

export type RendererRecoveryAction = 'ignore' | 'reload' | 'explain';

export interface RendererRecoveryPlan {
  readonly action: RendererRecoveryAction;
  readonly cause: DesktopTelemetryCause;
  readonly reference: string;
}

/** A window that answers again inside this long was busy, not broken. */
export const RENDERER_UNRESPONSIVE_GRACE_MS = 10_000;

/**
 * Where a recovered window opens: the page the reader was on when it is one of
 * ours, so a crash does not also cost them their place; otherwise the entry.
 */
export function resumeUrlAfterFault(currentUrl: string | null, entryUrl: string): string {
  if (!currentUrl) return entryUrl;
  try {
    const current = new URL(currentUrl);
    const entry = new URL(entryUrl);
    const ours = current.protocol === entry.protocol && current.origin === entry.origin;
    return ours && entry.origin !== 'null' ? current.href : entryUrl;
  } catch {
    return entryUrl;
  }
}

/** A second fault this soon after the first is a loop, not a blip. */
export const RENDERER_RECOVERY_WINDOW_MS = 30_000;

const GONE_CAUSES: Readonly<Record<RendererGoneReason, DesktopTelemetryCause>> = {
  'clean-exit': 'unknown',
  'abnormal-exit': 'crashed',
  killed: 'killed',
  crashed: 'crashed',
  oom: 'out_of_memory',
  'launch-failed': 'crashed',
  'integrity-failure': 'crashed',
};

function referenceFor(fault: RendererFault): string {
  return fault.kind === 'unresponsive' ? 'renderer-unresponsive' : `renderer-${fault.reason}`;
}

/**
 * What to do about a renderer that died or stopped answering. The first fault
 * reloads, because a reload is invisible and usually enough; a second inside the
 * window stops and explains, so the shell cannot reload itself forever.
 */
export function planRendererRecovery(
  fault: RendererFault,
  previousFaultAt: number | null,
  now: number,
): RendererRecoveryPlan {
  const reference = referenceFor(fault);
  if (fault.kind === 'gone' && fault.reason === 'clean-exit') {
    return { action: 'ignore', cause: 'unknown', reference };
  }
  const cause: DesktopTelemetryCause =
    fault.kind === 'unresponsive' ? 'unresponsive' : GONE_CAUSES[fault.reason];
  const repeated = previousFaultAt !== null && now - previousFaultAt <= RENDERER_RECOVERY_WINDOW_MS;
  return { action: repeated ? 'explain' : 'reload', cause, reference };
}
