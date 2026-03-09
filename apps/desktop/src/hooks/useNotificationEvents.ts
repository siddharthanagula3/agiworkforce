/**
 * useNotificationEvents
 *
 * Listens to notification and background task events:
 * - task:progress, task:completed, task:failed
 * - automation:permission_required
 * - calendar:*, automation:*, cloud:*, gmail:* integration events
 * - mcp:server_unhealthy, mcp:tools_updated, mcp:system_initialized
 *
 * Extracted from useAgenticEvents.ts.
 */
import { invoke, listen, UnlistenFn } from '../lib/tauri-mock';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';
import { isTauri } from '../lib/tauri-mock';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  BackgroundTask,
} from '../stores/unifiedChatStore';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';

// =============================================================================
// Shared utility types (passed in by the parent hook)
// =============================================================================

export interface NotificationEventDeps {
  isMountedRef: React.MutableRefObject<boolean>;
  upsertActionLogEntry: (
    entry: Partial<ActionLogEntry> & { id?: string; actionId?: string; type?: ActionLogEntryType },
  ) => void;
  focusSidecar: (eventType: string) => void;
  handlersRef: React.MutableRefObject<{
    addBackgroundTask: (task: BackgroundTask) => void;
    updateBackgroundTask: (id: string, updates: Partial<BackgroundTask>) => void;
  }>;
}

// =============================================================================
// Hook
// =============================================================================

export function useNotificationEvents(deps: NotificationEventDeps): void {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const { isMountedRef, upsertActionLogEntry, focusSidecar, handlersRef } = deps;

  useEffect(() => {
    const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);

    const setup = async () => {
      if (!isMountedRef.current) return;

      // ──────────────────────────────────────────────────────────────────────
      // Background task events
      // ──────────────────────────────────────────────────────────────────────

      const unlistenTaskProgress = await listen<{ task: BackgroundTask }>(
        'task:progress',
        (event) => {
          if (!isMountedRef.current) return;
          const existingTasks = useUnifiedChatStore.getState().backgroundTasks;
          const taskExists = existingTasks.some((t) => t.id === event.payload.task.id);
          if (taskExists) {
            handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
          } else {
            handlersRef.current.addBackgroundTask(event.payload.task);
          }
        },
      );
      push(unlistenTaskProgress);

      const unlistenTaskCompleted = await listen<{ task: BackgroundTask }>(
        'task:completed',
        (event) => {
          if (!isMountedRef.current) return;
          handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
        },
      );
      push(unlistenTaskCompleted);

      const unlistenTaskFailed = await listen<{ task: BackgroundTask }>('task:failed', (event) => {
        if (!isMountedRef.current) return;
        handlersRef.current.updateBackgroundTask(event.payload.task.id, event.payload.task);
      });
      push(unlistenTaskFailed);

      // ──────────────────────────────────────────────────────────────────────
      // Automation permission required
      // ──────────────────────────────────────────────────────────────────────

      const unlistenPermRequired = await listen<{
        reason: string;
        message: string;
        graceful?: boolean;
      }>('automation:permission_required', (event) => {
        if (!isMountedRef.current) return;
        const { message, reason, graceful } = event.payload;
        const openSettings = () => {
          void invoke('request_automation_permission', {
            kind: reason ?? 'accessibility',
          }).catch((err) => {
            console.error('Failed to request automation permission:', err);
          });
        };
        if (graceful) {
          toast(message, {
            duration: 8000,
            action: { label: 'Open Settings', onClick: openSettings },
          });
        } else {
          toast.error(message, {
            duration: 12000,
            action: { label: 'Open Settings', onClick: openSettings },
          });
          openSettings();
        }
      });
      push(unlistenPermRequired);

      // ──────────────────────────────────────────────────────────────────────
      // Calendar events
      // ──────────────────────────────────────────────────────────────────────

      const unlistenCalendarAuthStarted = await listen<string>('calendar:auth_started', (event) => {
        if (!isMountedRef.current) return;
        const providerLabel = String(event.payload || 'calendar').trim() || 'calendar';
        upsertActionLogEntry({
          id: `calendar-auth-${Date.now()}`,
          type: 'terminal',
          title: 'Calendar authorization started',
          description: `Opening ${providerLabel} authorization flow`,
          status: 'running',
          metadata: { provider: providerLabel },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'running',
          message: `Connecting ${providerLabel} calendar...`,
          fadeAfter: 3500,
        });
        focusSidecar('calendar');
      });
      push(unlistenCalendarAuthStarted);

      const unlistenCalendarConnected = await listen<string>('calendar:connected', (event) => {
        if (!isMountedRef.current) return;
        const id = String(event.payload || '').trim() || 'unknown';
        upsertActionLogEntry({
          id: `calendar-connected-${id}-${Date.now()}`,
          type: 'terminal',
          title: 'Calendar connected',
          description: `Connected calendar account ${id}`,
          status: 'success',
          metadata: { account_id: id },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'completed',
          message: 'Calendar connected',
          fadeAfter: 3500,
        });
        focusSidecar('calendar');
      });
      push(unlistenCalendarConnected);

      const unlistenCalendarDisconnected = await listen<string>(
        'calendar:disconnected',
        (event) => {
          if (!isMountedRef.current) return;
          const id = String(event.payload || '').trim() || 'unknown';
          upsertActionLogEntry({
            id: `calendar-disconnected-${id}-${Date.now()}`,
            type: 'terminal',
            title: 'Calendar disconnected',
            description: `Disconnected calendar account ${id}`,
            status: 'success',
            metadata: { account_id: id },
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: 'Calendar disconnected',
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        },
      );
      push(unlistenCalendarDisconnected);

      const unlistenCalendarEventCreated = await listen<Record<string, unknown>>(
        'calendar:event_created',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const title = String(payload['title'] ?? payload['summary'] ?? 'Calendar event');
          const eventId = String(payload['id'] ?? payload['event_id'] ?? '');
          upsertActionLogEntry({
            id: `calendar-event-created-${eventId || Date.now().toString()}`,
            type: 'terminal',
            title: 'Calendar event created',
            description: title,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Created event: ${title}`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        },
      );
      push(unlistenCalendarEventCreated);

      const unlistenCalendarEventUpdated = await listen<Record<string, unknown>>(
        'calendar:event_updated',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const title = String(payload['title'] ?? payload['summary'] ?? 'Calendar event');
          const eventId = String(payload['id'] ?? payload['event_id'] ?? '');
          upsertActionLogEntry({
            id: `calendar-event-updated-${eventId || Date.now().toString()}`,
            type: 'terminal',
            title: 'Calendar event updated',
            description: title,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Updated event: ${title}`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        },
      );
      push(unlistenCalendarEventUpdated);

      const unlistenCalendarEventDeleted = await listen<Record<string, unknown>>(
        'calendar:event_deleted',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const eventId = String(payload['event_id'] ?? payload['id'] ?? 'unknown');
          upsertActionLogEntry({
            id: `calendar-event-deleted-${eventId}-${Date.now()}`,
            type: 'terminal',
            title: 'Calendar event deleted',
            description: `Deleted calendar event ${eventId}`,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Deleted event ${eventId}`,
            fadeAfter: 3500,
          });
          focusSidecar('calendar');
        },
      );
      push(unlistenCalendarEventDeleted);

      // ──────────────────────────────────────────────────────────────────────
      // Automation recording events
      // ──────────────────────────────────────────────────────────────────────

      const unlistenAutomationRecordingStarted = await listen<Record<string, unknown>>(
        'automation:recording_started',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const sessionId = String(payload['session_id'] ?? payload['sessionId'] ?? 'unknown');
          upsertActionLogEntry({
            id: `automation-recording-started-${sessionId}`,
            actionId: sessionId,
            type: 'ui',
            title: 'Automation recording started',
            description: `Session ${sessionId}`,
            status: 'running',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: 'Automation recording started',
            fadeAfter: 3500,
          });
          focusSidecar('automation');
        },
      );
      push(unlistenAutomationRecordingStarted);

      const unlistenAutomationActionRecorded = await listen<Record<string, unknown>>(
        'automation:action_recorded',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const actionType = String(payload['action_type'] ?? payload['actionType'] ?? 'action');
          const actionId = String(payload['id'] ?? crypto.randomUUID());
          upsertActionLogEntry({
            id: `automation-action-${actionId}`,
            actionId,
            type: 'ui',
            title: 'Automation action recorded',
            description: actionType.replace(/_/g, ' '),
            status: 'running',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Recorded action: ${actionType.replace(/_/g, ' ')}`,
            fadeAfter: 2500,
          });
          focusSidecar('automation');
        },
      );
      push(unlistenAutomationActionRecorded);

      const unlistenAutomationRecordingStopped = await listen<Record<string, unknown>>(
        'automation:recording_stopped',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const recordingId = String(payload['id'] ?? payload['recording_id'] ?? 'unknown');
          const actionCount = Number(payload['actions_count'] ?? payload['action_count'] ?? 0);
          upsertActionLogEntry({
            id: `automation-recording-stopped-${recordingId}`,
            actionId: recordingId,
            type: 'ui',
            title: 'Automation recording stopped',
            description:
              actionCount > 0
                ? `Captured ${actionCount} action${actionCount === 1 ? '' : 's'}`
                : `Recording ${recordingId} completed`,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message:
              actionCount > 0
                ? `Recording complete: ${actionCount} action${actionCount === 1 ? '' : 's'}`
                : 'Automation recording completed',
            fadeAfter: 3500,
          });
          focusSidecar('automation');
        },
      );
      push(unlistenAutomationRecordingStopped);

      const unlistenAutomationScreenshotRequested = await listen<Record<string, unknown>>(
        'automation:request_screenshot',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const actionId = String(payload['action_id'] ?? payload['actionId'] ?? 'unknown');
          upsertActionLogEntry({
            id: `automation-screenshot-${actionId}-${Date.now()}`,
            actionId,
            type: 'ui',
            title: 'Automation screenshot requested',
            description: 'Capturing UI state for automation step',
            status: 'running',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: 'Capturing automation screenshot...',
            fadeAfter: 3000,
          });
          focusSidecar('automation');
        },
      );
      push(unlistenAutomationScreenshotRequested);

      // ──────────────────────────────────────────────────────────────────────
      // Cloud integration events
      // ──────────────────────────────────────────────────────────────────────

      const unlistenCloudAuthStarted = await listen<string>('cloud:auth_started', (event) => {
        if (!isMountedRef.current) return;
        const providerLabel = String(event.payload || 'cloud').trim() || 'cloud';
        upsertActionLogEntry({
          id: `cloud-auth-${Date.now()}`,
          type: 'terminal',
          title: 'Cloud authorization started',
          description: `Opening ${providerLabel} authorization flow`,
          status: 'running',
          metadata: { provider: providerLabel },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'running',
          message: `Connecting ${providerLabel} cloud account...`,
          fadeAfter: 3500,
        });
        focusSidecar('cloud');
      });
      push(unlistenCloudAuthStarted);

      const unlistenCloudConnected = await listen<string>('cloud:connected', (event) => {
        if (!isMountedRef.current) return;
        const id = String(event.payload || '').trim() || 'unknown';
        upsertActionLogEntry({
          id: `cloud-connected-${id}-${Date.now()}`,
          type: 'terminal',
          title: 'Cloud account connected',
          description: `Connected account ${id}`,
          status: 'success',
          metadata: { account_id: id },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'completed',
          message: 'Cloud account connected',
          fadeAfter: 3500,
        });
        focusSidecar('cloud');
      });
      push(unlistenCloudConnected);

      const unlistenCloudDisconnected = await listen<string>('cloud:disconnected', (event) => {
        if (!isMountedRef.current) return;
        const id = String(event.payload || '').trim() || 'unknown';
        upsertActionLogEntry({
          id: `cloud-disconnected-${id}-${Date.now()}`,
          type: 'terminal',
          title: 'Cloud account disconnected',
          description: `Disconnected account ${id}`,
          status: 'success',
          metadata: { account_id: id },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'completed',
          message: 'Cloud account disconnected',
          fadeAfter: 3500,
        });
        focusSidecar('cloud');
      });
      push(unlistenCloudDisconnected);

      const unlistenCloudFileUploaded = await listen<Record<string, unknown>>(
        'cloud:file_uploaded',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          upsertActionLogEntry({
            id: `cloud-file-uploaded-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud file uploaded',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Uploaded ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        },
      );
      push(unlistenCloudFileUploaded);

      const unlistenCloudFileDownloaded = await listen<Record<string, unknown>>(
        'cloud:file_downloaded',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          upsertActionLogEntry({
            id: `cloud-file-downloaded-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud file downloaded',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Downloaded ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        },
      );
      push(unlistenCloudFileDownloaded);

      const unlistenCloudFileDeleted = await listen<Record<string, unknown>>(
        'cloud:file_deleted',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'file');
          upsertActionLogEntry({
            id: `cloud-file-deleted-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud file deleted',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Deleted ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        },
      );
      push(unlistenCloudFileDeleted);

      const unlistenCloudFolderCreated = await listen<Record<string, unknown>>(
        'cloud:folder_created',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const remotePath = String(payload['remotePath'] ?? payload['remote_path'] ?? 'folder');
          upsertActionLogEntry({
            id: `cloud-folder-created-${Date.now()}`,
            type: 'filesystem',
            title: 'Cloud folder created',
            description: remotePath,
            status: 'success',
            metadata: payload,
          });
          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'completed',
            message: `Created folder ${remotePath}`,
            fadeAfter: 3000,
          });
          focusSidecar('cloud');
        },
      );
      push(unlistenCloudFolderCreated);

      // ──────────────────────────────────────────────────────────────────────
      // Gmail events
      // ──────────────────────────────────────────────────────────────────────

      const unlistenGmailAuthStarted = await listen<string>('gmail:auth_started', (event) => {
        if (!isMountedRef.current) return;
        upsertActionLogEntry({
          id: `gmail-auth-${Date.now()}`,
          type: 'terminal',
          title: 'Gmail authorization started',
          description: 'Opening Gmail OAuth flow',
          status: 'running',
          metadata: { oauth_state: event.payload },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'running',
          message: 'Connecting Gmail account...',
          fadeAfter: 3500,
        });
        focusSidecar('gmail');
      });
      push(unlistenGmailAuthStarted);

      const unlistenGmailConnected = await listen<string>('gmail:connected', (event) => {
        if (!isMountedRef.current) return;
        const id = String(event.payload || '').trim() || 'unknown';
        upsertActionLogEntry({
          id: `gmail-connected-${id}-${Date.now()}`,
          type: 'terminal',
          title: 'Gmail connected',
          description: `Connected account ${id}`,
          status: 'success',
          metadata: { account_id: id },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'completed',
          message: 'Gmail connected',
          fadeAfter: 3500,
        });
        focusSidecar('gmail');
      });
      push(unlistenGmailConnected);

      const unlistenGmailTokenRefreshed = await listen<string>('gmail:token_refreshed', (event) => {
        if (!isMountedRef.current) return;
        const id = String(event.payload || '').trim() || 'unknown';
        upsertActionLogEntry({
          id: `gmail-token-refreshed-${id}-${Date.now()}`,
          type: 'terminal',
          title: 'Gmail token refreshed',
          description: `Refreshed credentials for ${id}`,
          status: 'success',
          metadata: { account_id: id },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'completed',
          message: 'Gmail token refreshed',
          fadeAfter: 3000,
        });
        focusSidecar('gmail');
      });
      push(unlistenGmailTokenRefreshed);

      const unlistenGmailDisconnected = await listen<string>('gmail:disconnected', (event) => {
        if (!isMountedRef.current) return;
        const id = String(event.payload || '').trim() || 'unknown';
        upsertActionLogEntry({
          id: `gmail-disconnected-${id}-${Date.now()}`,
          type: 'terminal',
          title: 'Gmail disconnected',
          description: `Disconnected account ${id}`,
          status: 'success',
          metadata: { account_id: id },
        });
        useUnifiedChatStore.getState().addActionTrailEntry({
          type: 'completed',
          message: 'Gmail disconnected',
          fadeAfter: 3500,
        });
        focusSidecar('gmail');
      });
      push(unlistenGmailDisconnected);

      // ──────────────────────────────────────────────────────────────────────
      // MCP health/system events
      // ──────────────────────────────────────────────────────────────────────

      if (isTauri) {
        try {
          const { useMcpStore } = await import('../stores/mcpStore');

          const unlistenMcpServerUnhealthy = await listen<{ server_name: string; error?: string }>(
            'mcp:server_unhealthy',
            () => {
              useMcpStore.getState().refreshServers();
            },
          );
          push(unlistenMcpServerUnhealthy);

          const unlistenMcpToolsUpdated = await listen<{
            server_name: string;
            tools_count?: number;
          }>('mcp:tools_updated', () => {
            useMcpStore.getState().refreshTools();
          });
          push(unlistenMcpToolsUpdated);

          const unlistenMcpSystemInitialized = await listen<{
            servers_count?: number;
            tools_count?: number;
          }>('mcp:system_initialized', () => {
            const mcpState = useMcpStore.getState();
            mcpState.refreshServers();
            mcpState.refreshTools();
            mcpState.refreshStats();
          });
          push(unlistenMcpSystemInitialized);
        } catch (error) {
          console.error('[useNotificationEvents] Failed to setup MCP listeners:', error);
        }
      }
    };

    setup().catch((error) => {
      console.error('[useNotificationEvents] Failed to setup listeners:', error);
    });

    return () => {
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useNotificationEvents;
