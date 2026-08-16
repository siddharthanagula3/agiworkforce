import { scheduleLocalNotification } from './notifications';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import type { NotificationEventType, NotificationPriority } from './notifications';
import { FEATURES } from '@/lib/v1FeatureFlags';

interface ControlPayload {
  action: string;
  requestId?: string;
  agentId?: string;
  agentName?: string;
  taskName?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

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

type CompanionMessageListener = (payload: ControlPayload) => void;
const listeners = new Set<CompanionMessageListener>();

export function addCompanionMessageListener(listener: CompanionMessageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyCompanionMessage(payload: ControlPayload): void {
  for (const listener of listeners) {
    listener(payload);
  }
}

export function setupCompanionNotifications(): () => void {
  if (!FEATURES.companion) return () => {};
  return addCompanionMessageListener((payload) => {
    dispatchCompanionNotification(payload).catch((err) => {
      console.warn('[CompanionNotifications] Dispatch failed:', err);
    });
  });
}
