import type {
  LocalCodeSessionActivity,
  LocalCodeSessionActivityEvent,
} from '@agiworkforce/cloud-contracts';
import type { DeveloperSessionEvent } from '@agiworkforce/local-runtime-contract';

export interface CodeSessionActivityDependencies {
  sessionTitle: (rootId: string, threadId: string) => Promise<string | null>;
  remoteControlActive: () => boolean;
  report: (activity: LocalCodeSessionActivity) => Promise<void>;
}

interface ActivityStep {
  event: LocalCodeSessionActivityEvent;
  turnId: string;
  approvalId?: string;
}

function activityStep(event: DeveloperSessionEvent): ActivityStep | null {
  if (event.type === 'approval-requested') {
    return { event: 'approval_required', turnId: event.turnId, approvalId: event.requestId };
  }
  if (event.type !== 'turn-finished') return null;
  if (event.outcome === 'completed') return { event: 'completed', turnId: event.turnId };
  if (event.outcome === 'failed') return { event: 'failed', turnId: event.turnId };
  return null;
}

export function createCodeSessionActivity(deps: CodeSessionActivityDependencies) {
  return async function handle(rootId: string, event: DeveloperSessionEvent): Promise<void> {
    if (event.type === 'runtime-stopped') return;
    const step = activityStep(event);
    if (!step || !deps.remoteControlActive()) return;

    const sessionTitle = await deps.sessionTitle(rootId, event.threadId).catch(() => null);
    await deps.report({
      event: step.event,
      rootId,
      threadId: event.threadId,
      turnId: step.turnId,
      ...(step.approvalId ? { approvalId: step.approvalId } : {}),
      sessionTitle,
    });
  };
}
