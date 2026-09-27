import {
  codeSessionActivityNotice,
  type LocalCodeSessionActivity,
  type LocalCodeSessionActivityEvent,
} from '@agiworkforce/cloud-contracts';
import type {
  DeveloperSessionEvent,
  SessionCompletionAlerts,
} from '@agiworkforce/local-runtime-contract';

export interface CodeSessionAlertPreferences {
  completion: SessionCompletionAlerts;
  approvals: boolean;
}

export interface CodeSessionActivityDependencies {
  sessionTitle: (rootId: string, threadId: string) => Promise<string | null>;
  remoteControlActive: () => boolean;
  report: (activity: LocalCodeSessionActivity) => Promise<void>;
  alertPreferences: () => CodeSessionAlertPreferences;
  inBackground: () => boolean;
  alert: (notice: { title: string; body: string }) => void;
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

function shouldAlert(
  step: ActivityStep,
  preferences: CodeSessionAlertPreferences,
  inBackground: boolean,
): boolean {
  if (step.event === 'approval_required') return preferences.approvals;
  return (
    preferences.completion === 'always' || (preferences.completion === 'background' && inBackground)
  );
}

export function createCodeSessionActivity(deps: CodeSessionActivityDependencies) {
  return async function handle(rootId: string, event: DeveloperSessionEvent): Promise<void> {
    if (event.type === 'runtime-stopped') return;
    const step = activityStep(event);
    if (!step) return;
    const alert = shouldAlert(step, deps.alertPreferences(), deps.inBackground());
    const report = deps.remoteControlActive();
    if (!alert && !report) return;

    const sessionTitle = await deps.sessionTitle(rootId, event.threadId).catch(() => null);
    if (alert) {
      deps.alert(
        codeSessionActivityNotice(
          step.event,
          sessionTitle ? `“${sessionTitle}”` : 'A coding session',
        ),
      );
    }
    if (report) {
      await deps.report({
        event: step.event,
        rootId,
        threadId: event.threadId,
        turnId: step.turnId,
        ...(step.approvalId ? { approvalId: step.approvalId } : {}),
        sessionTitle,
      });
    }
  };
}
