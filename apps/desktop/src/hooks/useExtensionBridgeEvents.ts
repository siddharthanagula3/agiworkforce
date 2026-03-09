/**
 * useExtensionBridgeEvents
 *
 * Listens to Chrome extension bridge events emitted by Rust:
 * - extension:page-context
 * - extension:connection-status
 * - extension:task-result
 *
 * Handles preflight diagnostics and writes extension artifacts into
 * the unified chat store (action log + inline message artifacts).
 *
 * Extracted from useAgenticEvents.ts.
 */
import { invoke, listen, UnlistenFn } from '../lib/tauri-mock';
import { useEffect, useRef } from 'react';
import { isTauri } from '../lib/tauri-mock';
import type {
  ActionLogEntry,
  ActionLogEntryType,
  ActionLogStatus,
} from '../stores/unifiedChatStore';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type { Artifact } from '../types/chat';
import type { EnhancedMessage } from '../stores/chat/types';

// =============================================================================
// Event payload types (also exported for useExtensionEvents.ts import compat)
// =============================================================================

interface ExtensionPageAction {
  id: string;
  type: string;
  selector?: string | null;
  value?: string | null;
  delay?: number | null;
}

export interface ExtensionPageContextEvent {
  task_id: string;
  url: string;
  title: string;
  tab_id: number;
  timestamp: number;
  selected_text?: string | null;
  actions?: ExtensionPageAction[];
}

export interface ExtensionTaskResultEvent {
  task_id: string;
  success: boolean;
  screenshot_path?: string | null;
  result?: unknown;
  error?: string | null;
  actions_performed?: number;
  duration?: number;
}

export interface ExtensionConnectionStatusEvent {
  connected: boolean;
  status?: string;
  extension_id?: string;
  reason?: string;
  timestamp?: number;
}

interface ExtensionStatusDiagnosticsPayload {
  status?: string;
  diagnostics?: {
    recommendations?: string[];
    realtime_token?: {
      valid?: boolean;
      exists?: boolean;
      error?: string | null;
    };
    native_connection?: {
      state?: string;
      extension_id?: string | null;
      ready?: boolean;
    };
  };
}

// =============================================================================
// Shared utility types (passed in by the parent hook)
// =============================================================================

export interface ExtensionBridgeEventDeps {
  isMountedRef: React.MutableRefObject<boolean>;
  upsertActionLogEntry: (
    entry: Partial<ActionLogEntry> & { id?: string; actionId?: string; type?: ActionLogEntryType },
  ) => void;
  safeJsonStringify: (value: unknown) => string | undefined;
  focusSidecar: (eventType: string) => void;
  resolveActiveConversationMessages: () => EnhancedMessage[];
}

// =============================================================================
// Hook
// =============================================================================

export function useExtensionBridgeEvents(deps: ExtensionBridgeEventDeps): void {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const extensionPreflightCheckedRef = useRef(false);
  // Keep a stable ref to deps so async callbacks always see current values
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const push = (fn: UnlistenFn) => unlistenFns.current.push(fn);
    // isMountedRef is stable across renders — safe to capture in closures
    const { isMountedRef } = depsRef.current;

    // ──────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────────────────

    const runExtensionPreflightCheck = () => {
      if (extensionPreflightCheckedRef.current || !isTauri) {
        return;
      }
      extensionPreflightCheckedRef.current = true;

      void (async () => {
        try {
          const response = (await invoke('extension_status')) as ExtensionStatusDiagnosticsPayload;
          const status = String(response?.status ?? 'unknown');
          const diagnostics = response?.diagnostics;
          const recommendations = diagnostics?.recommendations ?? [];
          const tokenValid = diagnostics?.realtime_token?.valid ?? false;
          const connectionState = String(diagnostics?.native_connection?.state ?? 'unknown');
          const transportReady = diagnostics?.native_connection?.ready === true;
          const degraded = status !== 'ok';

          depsRef.current.upsertActionLogEntry({
            id: 'extension-preflight',
            actionId: 'extension-preflight',
            type: 'browser',
            title: degraded
              ? 'Extension transport preflight degraded'
              : 'Extension transport preflight',
            description: degraded
              ? (recommendations[0] ?? 'Extension transport diagnostics reported degraded status')
              : 'Extension transport diagnostics passed',
            status: (degraded ? 'failed' : 'success') as ActionLogStatus,
            metadata: {
              status,
              tokenValid,
              connectionState,
              transportReady,
              recommendations,
              diagnostics,
            },
          });

          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: degraded ? 'error' : 'completed',
            message: degraded
              ? `Extension preflight degraded: ${recommendations[0] ?? 'check extension_status diagnostics'}`
              : 'Extension preflight checks passed',
            metadata: {
              status,
              connection_state: connectionState,
              token_valid: tokenValid,
              transport_ready: transportReady,
            },
            fadeAfter: 5000,
          });

          if (degraded) {
            extensionPreflightCheckedRef.current = false;
          }
        } catch (error) {
          extensionPreflightCheckedRef.current = false;
          depsRef.current.upsertActionLogEntry({
            id: 'extension-preflight',
            actionId: 'extension-preflight',
            type: 'browser',
            title: 'Extension transport preflight failed',
            description: 'Could not query extension transport diagnostics',
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown preflight error',
            metadata: { error: error instanceof Error ? error.message : String(error) },
          });
          const addActionTrailEntry = useUnifiedChatStore.getState().addActionTrailEntry;
          addActionTrailEntry?.({
            type: 'error',
            message: `Extension preflight failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            fadeAfter: 5000,
          });
        }
      })();
    };

    const getMergedMessageArtifacts = (message: EnhancedMessage): Artifact[] => {
      const artifacts = message.artifacts ?? [];
      const metadataArtifacts = Array.isArray(message.metadata?.artifacts)
        ? message.metadata.artifacts
        : [];
      if (metadataArtifacts.length === 0) return [...artifacts];
      const merged: Artifact[] = [...artifacts];
      const existingIds = new Set(artifacts.map((a) => a.id));
      for (const artifact of metadataArtifacts) {
        if (!existingIds.has(artifact.id)) merged.push(artifact);
      }
      return merged;
    };

    const resolveInlineExtensionTargetMessageId = (): string | null => {
      const state = useUnifiedChatStore.getState();
      const conversationMessages = depsRef.current.resolveActiveConversationMessages();
      if (conversationMessages.length === 0) return null;

      const streamingMessageId = state.currentStreamingMessageId;
      if (streamingMessageId && conversationMessages.some((msg) => msg.id === streamingMessageId)) {
        return streamingMessageId;
      }

      const latestAssistant = [...conversationMessages]
        .reverse()
        .find((msg) => msg.role === 'assistant');
      if (latestAssistant) return latestAssistant.id;

      const latestSystem = [...conversationMessages].reverse().find((msg) => msg.role === 'system');
      if (latestSystem) return latestSystem.id;

      return null;
    };

    const ensureExtensionMessageTarget = (
      fallbackContent: string,
      fallbackStatus: 'running' | 'completed' | 'failed',
    ): string | null => {
      const existingTarget = resolveInlineExtensionTargetMessageId();
      if (existingTarget) return existingTarget;

      const state = useUnifiedChatStore.getState();
      if (!state.activeConversationId) return null;

      return state.addMessage({
        role: 'assistant',
        content: fallbackContent,
        metadata: {
          event: 'extension',
          status: fallbackStatus,
          sidecarType: 'browser',
          streaming: false,
        },
        artifacts: [],
      });
    };

    const upsertInlineExtensionArtifact = (
      taskId: string,
      patch: Record<string, unknown>,
      options?: { fallbackContent?: string; fallbackStatus?: 'running' | 'completed' | 'failed' },
    ) => {
      const targetMessageId = ensureExtensionMessageTarget(
        options?.fallbackContent ?? 'Extension update received.',
        options?.fallbackStatus ?? 'running',
      );
      if (!targetMessageId) return;

      const state = useUnifiedChatStore.getState();
      const conversationMessages = depsRef.current.resolveActiveConversationMessages();
      const targetMessage = conversationMessages.find((msg) => msg.id === targetMessageId);
      if (!targetMessage) return;

      const artifactId = `extension-${taskId}`;
      const artifacts = getMergedMessageArtifacts(targetMessage);
      const index = artifacts.findIndex((a) => a.id === artifactId);
      const existingArtifact =
        index >= 0 ? (artifacts[index] as Artifact & Record<string, unknown>) : null;

      const patchMetadata = patch['metadata'];
      const mergedMetadata = {
        ...((existingArtifact?.metadata as Record<string, unknown> | undefined) ?? {}),
        ...(patchMetadata && typeof patchMetadata === 'object'
          ? (patchMetadata as Record<string, unknown>)
          : {}),
      };

      const nextArtifact = {
        id: artifactId,
        type: 'code' as const,
        title: 'Extension task',
        content: String(patch['content'] ?? existingArtifact?.content ?? ''),
        ...(existingArtifact ?? {}),
        ...patch,
        metadata: mergedMetadata,
      } as Artifact;

      const nextArtifacts =
        index >= 0
          ? artifacts.map((a, i) => (i === index ? nextArtifact : a))
          : [...artifacts, nextArtifact];

      const metadataStatus = (nextArtifact as unknown as Record<string, unknown>)['status'];
      const currentMetadata = targetMessage.metadata ?? {};
      state.updateMessage(targetMessageId, {
        artifacts: nextArtifacts,
        metadata: {
          ...currentMetadata,
          artifacts: nextArtifacts,
          event: 'extension',
          sidecarType: 'browser',
          ...(typeof metadataStatus === 'string' ? { status: metadataStatus } : {}),
        },
      });
    };

    // ──────────────────────────────────────────────────────────────────────────
    // Event listeners
    // ──────────────────────────────────────────────────────────────────────────

    const setup = async () => {
      if (!isMountedRef.current) return;

      // extension:page-context
      const unlistenExtensionPageContext = await listen<ExtensionPageContextEvent>(
        'extension:page-context',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const actionCount = payload.actions?.length ?? 0;
          const selectedText =
            typeof payload.selected_text === 'string' ? payload.selected_text.trim() : '';
          const selectedTextPreview =
            selectedText.length > 160 ? `${selectedText.slice(0, 160)}...` : selectedText;
          const actionSummary =
            actionCount > 0
              ? `${actionCount} planned action${actionCount === 1 ? '' : 's'}`
              : 'No planned actions';

          depsRef.current.upsertActionLogEntry({
            id: `extension-${payload.task_id}`,
            actionId: payload.task_id,
            type: 'browser',
            title: 'Extension page context received',
            description: `${payload.title || 'Untitled page'} (${payload.url})`,
            status: 'running',
            metadata: {
              tabId: payload.tab_id,
              actionCount,
              actions: payload.actions,
              selectedText: payload.selected_text ?? null,
            },
          });

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: 'running',
            message: `Extension captured page context: ${payload.title || payload.url}`,
            metadata: {
              task_id: payload.task_id,
              tab_id: payload.tab_id,
              action_count: actionCount,
            },
            fadeAfter: 4000,
          });

          const stdoutLines = [
            `URL: ${payload.url}`,
            `Title: ${payload.title || 'Untitled page'}`,
            `Tab ID: ${payload.tab_id}`,
            `Actions: ${actionSummary}`,
            selectedTextPreview ? `Selected text: ${selectedTextPreview}` : null,
          ].filter((line): line is string => Boolean(line));

          upsertInlineExtensionArtifact(
            payload.task_id,
            {
              toolName: 'extension_page_context',
              type: 'code',
              title: 'Extension page context',
              status: 'running',
              success: true,
              command: `extension.page_context tab=${payload.tab_id}`,
              stdout: stdoutLines.join('\n'),
              exitCode: 0,
              content: stdoutLines.join('\n'),
              metadata: {
                taskId: payload.task_id,
                tabId: payload.tab_id,
                url: payload.url,
                title: payload.title,
                actionCount,
                actions: payload.actions ?? [],
                selectedText: payload.selected_text ?? null,
                timestamp: payload.timestamp,
              },
            },
            {
              fallbackContent: `Analyzing page context for ${payload.title || payload.url}`,
              fallbackStatus: 'running',
            },
          );
          depsRef.current.focusSidecar('browser');
        },
      );
      push(unlistenExtensionPageContext);

      // extension:connection-status
      const unlistenExtensionConnectionStatus = await listen<ExtensionConnectionStatusEvent>(
        'extension:connection-status',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const isConnected = payload.connected === true;
          const statusLabel = String(
            payload.status ?? (isConnected ? 'connected' : 'disconnected'),
          );
          const description = isConnected
            ? `Extension connected${payload.extension_id ? ` (${payload.extension_id})` : ''}`
            : `Extension disconnected${payload.reason ? `: ${payload.reason}` : ''}`;

          depsRef.current.upsertActionLogEntry({
            id: 'extension-connection',
            actionId: 'extension-connection',
            type: 'browser',
            title: 'Extension connection status',
            description,
            status: isConnected ? 'success' : 'failed',
            metadata: {
              connected: isConnected,
              status: statusLabel,
              extensionId: payload.extension_id ?? null,
              reason: payload.reason ?? null,
              timestamp: payload.timestamp ?? Date.now(),
            },
          });

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: isConnected ? 'completed' : 'error',
            message: isConnected ? 'Browser extension connected' : 'Browser extension disconnected',
            metadata: {
              extension_id: payload.extension_id ?? null,
              reason: payload.reason ?? null,
            },
            fadeAfter: 4000,
          });

          if (!isConnected) {
            extensionPreflightCheckedRef.current = false;
          } else {
            runExtensionPreflightCheck();
          }

          depsRef.current.focusSidecar('browser');
        },
      );
      push(unlistenExtensionConnectionStatus);

      // extension:task-result
      const unlistenExtensionTaskResult = await listen<ExtensionTaskResultEvent>(
        'extension:task-result',
        (event) => {
          if (!isMountedRef.current) return;
          const payload = event.payload;
          const actionId = `extension-${payload.task_id}`;
          const status: ActionLogStatus = payload.success ? 'success' : 'failed';

          depsRef.current.upsertActionLogEntry({
            id: actionId,
            actionId: payload.task_id,
            type: 'browser',
            title: payload.success ? 'Extension task completed' : 'Extension task failed',
            description: payload.success
              ? `Performed ${payload.actions_performed ?? 0} action(s) in ${payload.duration ?? 0}ms`
              : (payload.error ?? 'Extension task failed'),
            status,
            result: payload.success ? JSON.stringify(payload.result ?? {}) : undefined,
            error: payload.success ? undefined : (payload.error ?? 'Unknown extension task error'),
            metadata: {
              screenshotPath: payload.screenshot_path ?? null,
              actionsPerformed: payload.actions_performed ?? 0,
              durationMs: payload.duration ?? 0,
            },
          });

          const summary = payload.success
            ? `Performed ${payload.actions_performed ?? 0} action(s) in ${payload.duration ?? 0}ms`
            : (payload.error ?? 'Extension task failed');

          useUnifiedChatStore.getState().addActionTrailEntry({
            type: payload.success ? 'completed' : 'error',
            message: payload.success
              ? `Extension task completed (${payload.actions_performed ?? 0} action${(payload.actions_performed ?? 0) === 1 ? '' : 's'})`
              : `Extension task failed: ${payload.error ?? 'Unknown error'}`,
            metadata: {
              task_id: payload.task_id,
              actions_performed: payload.actions_performed ?? 0,
              duration: payload.duration ?? 0,
            },
            fadeAfter: 4500,
          });

          const resultJson = depsRef.current.safeJsonStringify(payload.result);
          const stdout = payload.success
            ? [summary, resultJson].filter((part): part is string => Boolean(part)).join('\n\n')
            : '';

          upsertInlineExtensionArtifact(
            payload.task_id,
            {
              toolName: 'extension_task_result',
              type: 'code',
              title: payload.success ? 'Extension task completed' : 'Extension task failed',
              status: payload.success ? 'completed' : 'failed',
              success: payload.success,
              command: `extension.task_result task=${payload.task_id}`,
              stdout,
              stderr: payload.success ? '' : (payload.error ?? 'Unknown extension task error'),
              exitCode: payload.success ? 0 : 1,
              error: payload.success
                ? undefined
                : (payload.error ?? 'Unknown extension task error'),
              content: payload.success
                ? stdout || summary
                : (payload.error ?? 'Extension task failed'),
              metadata: {
                taskId: payload.task_id,
                screenshotPath: payload.screenshot_path ?? null,
                actionsPerformed: payload.actions_performed ?? 0,
                durationMs: payload.duration ?? 0,
                result: payload.result ?? null,
              },
            },
            {
              fallbackContent: payload.success
                ? `Extension task ${payload.task_id} completed`
                : `Extension task ${payload.task_id} failed`,
              fallbackStatus: payload.success ? 'completed' : 'failed',
            },
          );

          depsRef.current.focusSidecar('browser');
        },
      );
      push(unlistenExtensionTaskResult);
    };

    setup().catch((error) => {
      console.error('[useExtensionBridgeEvents] Failed to setup listeners:', error);
    });

    return () => {
      unlistenFns.current.forEach((fn) => fn());
      unlistenFns.current = [];
    };
  }, []);
}

export default useExtensionBridgeEvents;
