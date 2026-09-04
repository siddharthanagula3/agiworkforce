import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { useSettingsStore } from '@/stores/settingsStore';
import { notificationAllowed } from './notificationGate';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import {
  AGENT_APPROVAL_CATEGORY_IDENTIFIER,
  registerNotificationCategories,
} from './notificationCategories';

const BACKGROUND_FETCH_TASK = 'agent-status-check';

/**
 * Shape of `GET /api/mobile/agent-status` (apps/web). Each entry is one open
 * pause on a cloud agent run, a tool call awaiting approval, or a connector
 * question awaiting an answer, so the copy below covers both kinds.
 */
interface AgentStatusResponse {
  pendingApprovals: Array<{
    id: string;
    runId: string;
    kind: 'approval' | 'input';
    toolName: string | null;
    toolCount: number;
    model: string;
    requestedAt: string | null;
  }>;
  runningAgents: number;
}

const BG_FETCH_MAX_RETRIES = 2;
let lastApprovalNotificationKey: string | null = null;

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
    return BackgroundTask.BackgroundTaskResult.Success;
  }
  const appMode = useChatAppModeStore.getState?.()?.appMode ?? 'local';
  const modeSettings =
    appMode === 'cloud' ? useCloudSettingsStore.getState?.() : useLocalSettingsStore.getState?.();
  if (!modeSettings?.notificationsEnabled) {
    return BackgroundTask.BackgroundTaskResult.Success;
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
        const notificationKey = approvalNotificationKey(result.pendingApprovals);
        if (notificationKey && notificationKey === lastApprovalNotificationKey) {
          return BackgroundTask.BackgroundTaskResult.Success;
        }

        if (!notificationAllowed('agent_approval_needed')) {
          return BackgroundTask.BackgroundTaskResult.Success;
        }

        for (const approval of result.pendingApprovals) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'AGI Workforce',
              body: `${result.pendingApprovals.length} agent action${result.pendingApprovals.length === 1 ? ' is' : 's are'} waiting on you`,
              data: {
                type: 'agent_approval_needed',
                approvalId: approval.id,
                route: '/(app)/companion',
              },
              categoryIdentifier: AGENT_APPROVAL_CATEGORY_IDENTIFIER,
            },
            trigger: null,
          });
          lastApprovalNotificationKey = notificationKey;
          break;
        }
        return BackgroundTask.BackgroundTaskResult.Success;
      }

      lastApprovalNotificationKey = null;
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.name === 'AbortError') break;
    }
  }

  console.warn(
    '[backgroundFetch] Agent status check failed after retries:',
    lastError instanceof Error ? lastError.message : lastError,
  );
  return BackgroundTask.BackgroundTaskResult.Failed;
});

export async function registerBackgroundFetch(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();

  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    console.debug(
      '[backgroundFetch] Background tasks unavailable (Simulator, Low Power Mode, or device policy), approval polling is off',
    );
    return;
  }

  try {
    await registerNotificationCategories();
  } catch (err) {
    console.warn(
      '[backgroundFetch] Notification action registration failed:',
      err instanceof Error ? err.message : err,
    );
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  if (isRegistered) {
    return;
  }

  await BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 15,
  });
}

export async function unregisterBackgroundFetch(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
  }
}

export async function isBackgroundFetchRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
}
