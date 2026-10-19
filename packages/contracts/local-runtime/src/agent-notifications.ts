import {
  DEFAULT_HOST_AGENT_NOTIFICATIONS,
  DEFAULT_SESSION_COMPLETION_ALERTS,
  type HostAgentNotificationKind,
  type HostAgentNotificationPreferences,
  type HostPreferences,
} from './host-bridge';

type NotificationPreferenceFields = Partial<
  Pick<HostPreferences, 'agentNotifications' | 'sessionCompletionAlerts' | 'sessionApprovalAlerts'>
>;

/**
 * One set of notification choices. Shells written before the agent rows saved
 * finished-task and approval alerts on their own; those still narrow what the
 * agent rows say, so a choice made there is kept rather than silently undone.
 */
export function effectiveAgentNotifications(
  preferences: NotificationPreferenceFields,
): HostAgentNotificationPreferences {
  const base = preferences.agentNotifications ?? DEFAULT_HOST_AGENT_NOTIFICATIONS;
  const completion = preferences.sessionCompletionAlerts ?? DEFAULT_SESSION_COMPLETION_ALERTS;
  const muted = new Set<HostAgentNotificationKind>(base.muted);
  if (completion === 'never') {
    muted.add('turn-complete');
    muted.add('turn-failed');
  }
  if (preferences.sessionApprovalAlerts === false) muted.add('approval');
  return {
    ...base,
    when: completion === 'always' && base.when === 'unfocused' ? 'always' : base.when,
    muted: [...muted],
  };
}

/**
 * Saving the agent rows also writes the older fields back to values that change
 * nothing, so the one set the user sees is the one the shell applies.
 */
export function agentNotificationsWrite(
  next: HostAgentNotificationPreferences,
): Pick<HostPreferences, 'agentNotifications' | 'sessionCompletionAlerts' | 'sessionApprovalAlerts'> {
  return {
    agentNotifications: next,
    sessionCompletionAlerts: DEFAULT_SESSION_COMPLETION_ALERTS,
    sessionApprovalAlerts: true,
  };
}
