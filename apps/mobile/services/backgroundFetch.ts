import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { GATEWAY_URL } from '@/lib/constants';
import { useSettingsStore } from '@/stores/settingsStore';
import { notificationAllowed } from './notificationGate';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';

const BACKGROUND_FETCH_TASK = 'agent-status-check';

interface AgentStatusResponse {
  pendingApprovals: Array<{
    id: string;
    agentName: string;
    toolName: string;
    description: string;
  }>;
  runningAgents: number;
}

/**
 * Define the background task.
 * Must be called at module load time (top-level), before registerBackgroundFetch.
 */
/** Max retries for the background fetch API call (with exponential backoff). */
const BG_FETCH_MAX_RETRIES = 2;
let lastApprovalNotificationKey: string | null = null;

/** Forget account-scoped notification dedupe state on sign-out/account switch. */
export function resetBackgroundFetchAccountState(): void {
  lastApprovalNotificationKey = null;
}

function approvalNotificationKey(approvals: AgentStatusResponse['pendingApprovals']): string {
  return approvals
    .map((approval) => approval.id)
    .filter(Boolean)
    .sort()
    .join('|');
}

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const settings = useSettingsStore.getState?.();
  if (!settings?.backgroundFetchEnabled) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }
  // notificationsEnabled is mode-specific: check the active mode's store.
  const appMode = useChatAppModeStore.getState?.()?.appMode ?? 'local';
  const modeSettings =
    appMode === 'cloud' ? useCloudSettingsStore.getState?.() : useLocalSettingsStore.getState?.();
  if (!modeSettings?.notificationsEnabled) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  const controller = new AbortController();

  let lastError: unknown;
  for (let attempt = 0; attempt <= BG_FETCH_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      // STB-8: /api/mobile/agent-status is served only by the Express
      // api-gateway. Sending it to API_URL (the Next.js app) 404'd on every
      // background wake-up, so approval-needed push notifications never fired.
      const result = await api.get<AgentStatusResponse>('/api/mobile/agent-status', {
        baseUrl: GATEWAY_URL,
        timeout: 15_000,
        signal: controller.signal,
      });

      if (result.pendingApprovals.length > 0) {
        const notificationKey = approvalNotificationKey(result.pendingApprovals);
        if (notificationKey && notificationKey === lastApprovalNotificationKey) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Honor the user's Notification Preferences (Approvals category + quiet
        // hours). Previously these settings were inert — no live notification path
        // consulted them. We do NOT record lastApprovalNotificationKey here, so
        // re-enabling the category (or leaving quiet hours) re-evaluates this batch.
        if (!notificationAllowed('agent_approval_needed')) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        for (const approval of result.pendingApprovals) {
          // MED-MOB-08 fix (2026-05-04): the notification body previously
          // included `toolName: description`, which reveals agent task details
          // on the lock screen without authentication. We now show only a
          // generic count notification; full details are behind the biometric
          // gate inside the app.
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'AGI Workforce',
              body: `${result.pendingApprovals.length} agent action${result.pendingApprovals.length === 1 ? '' : 's'} need your approval`,
              data: {
                type: 'agent_approval_needed',
                approvalId: approval.id,
                route: '/(app)/companion',
              },
              categoryIdentifier: 'agent-approvals',
            },
            trigger: null,
          });
          lastApprovalNotificationKey = notificationKey;
          // Only send one notification per batch — the user taps through to the
          // app (behind biometric) to see per-approval detail.
          break;
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }

      lastApprovalNotificationKey = null;
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (err) {
      lastError = err;
      // Don't retry abort errors
      if (err instanceof Error && err.name === 'AbortError') break;
    }
  }

  console.warn(
    '[backgroundFetch] Agent status check failed after retries:',
    lastError instanceof Error ? lastError.message : lastError,
  );
  return BackgroundFetch.BackgroundFetchResult.Failed;
});

/**
 * Register the background fetch task.
 * Call once during app initialization.
 */
export async function registerBackgroundFetch(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();

  if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    console.warn('[backgroundFetch] Background fetch is denied by the OS');
    return;
  }

  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
    console.warn('[backgroundFetch] Background fetch is restricted');
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  if (isRegistered) {
    return; // already registered
  }

  await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 15 * 60, // 15 minutes (in seconds)
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

/**
 * Unregister the background fetch task.
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
  }
}

/**
 * Check if background fetch is currently registered.
 */
export async function isBackgroundFetchRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
}
