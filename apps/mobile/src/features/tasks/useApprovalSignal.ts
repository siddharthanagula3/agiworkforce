import { useEffect, useRef } from 'react';
import { notificationCenterStore, type NotificationEventType } from '@/services/notifications';

// `services/backgroundFetch.ts` already polls `/api/mobile/agent-status` while
// the app is backgrounded and raises the approval notification. Every received
// or tapped notification lands in the notification centre, so the run list
// re-reads on that signal instead of running a second poller of its own.
const APPROVAL_NOTIFICATION_TYPES: readonly NotificationEventType[] = [
  'agent_approval_needed',
  'approval_pending_escalation',
  'agent_paused',
];

export function useCloudRunApprovalSignal(onSignal: () => void): void {
  const handler = useRef(onSignal);
  handler.current = onSignal;
  const lastSignalId = useRef<string | null>(null);

  useEffect(() => {
    return notificationCenterStore.subscribe((items) => {
      const latest = items.find((item) => APPROVAL_NOTIFICATION_TYPES.includes(item.data.type));
      if (!latest || latest.id === lastSignalId.current) return;
      lastSignalId.current = latest.id;
      handler.current();
    });
  }, []);
}
