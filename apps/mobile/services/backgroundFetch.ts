import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { useSettingsStore } from '@/stores/settingsStore';

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

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const settings = useSettingsStore.getState?.();
  if (!settings?.backgroundFetchEnabled || !settings.notificationsEnabled) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  const controller = new AbortController();

  let lastError: unknown;
  for (let attempt = 0; attempt <= BG_FETCH_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      const result = await api.get<AgentStatusResponse>('/api/mobile/agent-status', {
        timeout: 15_000,
        signal: controller.signal,
      });

      if (result.pendingApprovals.length > 0) {
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
          // Only send one notification per batch — the user taps through to the
          // app (behind biometric) to see per-approval detail.
          break;
        }
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }

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
