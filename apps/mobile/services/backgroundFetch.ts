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
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const settings = useSettingsStore.getState();
  if (!settings.backgroundFetchEnabled || !settings.notificationsEnabled) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  try {
    const result = await api.get<AgentStatusResponse>('/api/mobile/agent-status', {
      timeout: 15_000,
    });

    if (result.pendingApprovals.length > 0) {
      // Schedule a local notification for each pending approval
      for (const approval of result.pendingApprovals) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${approval.agentName} needs approval`,
            body: `${approval.toolName}: ${approval.description}`,
            data: {
              type: 'agent_approval_needed',
              approvalId: approval.id,
              route: '/(app)/companion',
            },
            categoryIdentifier: 'agent-approvals',
          },
          trigger: null, // immediate
        });
      }
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
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
