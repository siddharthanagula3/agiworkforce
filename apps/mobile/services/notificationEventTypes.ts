export const NOTIFICATION_EVENT_TYPES = [
  'task_completed',
  'agent_approval_needed',
  'agent_failed',
  'emergency_stop_triggered',
  'approval_pending_escalation',
  'agent_paused',
  'status_update',
  'heartbeat_info',
  'schedule_triggered',
  // Emitted by the ONLY server-side push producer this app has:
  // `apps/web/lib/services/schedule-notification-service.ts` sends
  // `{ type: 'schedule_run', taskId }` after a scheduled run is finalized.
  // Without this member every real push fell through to `default:` and opened
  // app home instead of the schedules list.
  'schedule_run',
  'companion_connected',
  'chat_message',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/**
 * Types that stay audible inside quiet hours. The device applies this list in
 * the foreground handler and ships it with its registration so the server
 * applies the identical exemption before it hands a notice to Expo.
 */
export const QUIET_HOURS_EXEMPT_EVENT_TYPES: readonly NotificationEventType[] = [
  'agent_failed',
  'emergency_stop_triggered',
  'agent_approval_needed',
  'approval_pending_escalation',
];
