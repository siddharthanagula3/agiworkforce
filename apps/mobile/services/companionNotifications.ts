/**
 * Companion Notification Bridge
 *
 * Listens to companion control messages (approval_request, agent_failed,
 * task_completed, etc.) and fires local push notifications through the
 * Wave 3 notification infrastructure.
 *
 * Call `setupCompanionNotifications()` once, after the connection store
 * is initialised (typically in the companion screen's useEffect).
 * Call the returned cleanup to unsubscribe.
 */
import { scheduleLocalNotification } from './notifications';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import type { NotificationEventType, NotificationPriority } from './notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of an inbound control message action payload */
interface ControlPayload {
  action: string;
  requestId?: string;
  agentId?: string;
  agentName?: string;
  taskName?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Action → notification mapping
// ---------------------------------------------------------------------------

interface NotificationSpec {
  type: NotificationEventType;
  priority: NotificationPriority;
  title: (payload: ControlPayload) => string;
  body: (payload: ControlPayload) => string;
  route?: string;
}

const ACTION_MAP: Record<string, NotificationSpec> = {
  approval_request: {
    type: 'agent_approval_needed',
    priority: 'high',
    title: (p) => 'Approval Required',
    body: (p) => {
      const name = p.agentName ?? 'An agent';
      const task = p.taskName ?? 'an action';
      return `${name} is waiting for your approval to perform ${task}.`;
    },
    route: '/(app)/companion',
  },
  agent_failed: {
    type: 'agent_failed',
    priority: 'critical',
    title: (p) => 'Agent Failed',
    body: (p) => {
      const name = p.agentName ?? 'An agent';
      // Sanitize: only show first line, max 100 chars — don't expose stack traces in notifications
      const rawMsg =
        typeof p.errorMessage === 'string' ? p.errorMessage.split('\n')[0]!.slice(0, 100) : '';
      const msg = rawMsg ? `: ${rawMsg}` : '';
      return `${name} encountered an error and stopped${msg}.`;
    },
  },
  emergency_stop: {
    type: 'emergency_stop_triggered',
    priority: 'critical',
    title: () => 'Emergency Stop',
    body: () => 'All running agents have been stopped.',
    route: '/(app)/companion',
  },
  task_completed: {
    type: 'task_completed',
    priority: 'normal',
    title: (p) => 'Task Completed',
    body: (p) => {
      const name = p.agentName ?? p.taskName ?? 'Your task';
      return `${name} completed successfully.`;
    },
  },
  agent_paused: {
    type: 'agent_paused',
    priority: 'high',
    title: (p) => 'Agent Paused',
    body: (p) => {
      const name = p.agentName ?? 'An agent';
      return `${name} has been paused and is waiting to resume.`;
    },
  },
  heartbeat_lost: {
    type: 'heartbeat_info',
    priority: 'high',
    title: () => 'Desktop Disconnected',
    body: () => 'Lost connection to your desktop. Agents may be paused.',
    route: '/(app)/companion',
  },
};

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * Given an inbound control message payload, fire a local notification
 * if the user's preferences allow it.
 */
export async function dispatchCompanionNotification(payload: ControlPayload): Promise<void> {
  const spec = ACTION_MAP[payload.action];
  if (!spec) return;

  const prefs = useNotificationPrefsStore.getState();
  if (!prefs.shouldNotify(spec.type)) return;

  await scheduleLocalNotification({
    title: spec.title(payload),
    body: spec.body(payload),
    type: spec.type,
    priority: spec.priority,
    agentId: typeof payload.agentId === 'string' ? payload.agentId : undefined,
    route: spec.route,
  });
}

// ---------------------------------------------------------------------------
// Listener setup
// ---------------------------------------------------------------------------

/** Subscribers registered via addCompanionMessageListener */
type CompanionMessageListener = (payload: ControlPayload) => void;
const listeners = new Set<CompanionMessageListener>();

/**
 * Register a listener that will be called for every inbound companion
 * control message. Returns an unsubscribe function.
 *
 * This is an internal pub-sub bus. The connectionStore should call
 * `notifyCompanionMessage()` whenever a control message arrives.
 */
export function addCompanionMessageListener(listener: CompanionMessageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notify all registered listeners of an inbound control message.
 * Call this from connectionStore.handleControlMessage() for non-agent actions.
 */
export function notifyCompanionMessage(payload: ControlPayload): void {
  for (const listener of listeners) {
    listener(payload);
  }
}

/**
 * Set up the companion→notification bridge.
 * Registers a listener that fires local notifications for companion events.
 * Returns a cleanup function.
 */
export function setupCompanionNotifications(): () => void {
  return addCompanionMessageListener((payload) => {
    dispatchCompanionNotification(payload).catch((err) => {
      // Notification dispatch failure is non-critical — don't crash
      console.warn('[CompanionNotifications] Dispatch failed:', err);
    });
  });
}
