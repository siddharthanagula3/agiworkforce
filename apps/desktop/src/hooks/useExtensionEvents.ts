/**
 * useExtensionEvents.ts
 *
 * Subscribes to Tauri events emitted by the extension→planner pipeline:
 *   - extension:page-context  (page load / nav detected by Chrome extension)
 *   - extension:task-result   (browser task completed by extension)
 *
 * Exposes live state for the BrowserAutomationPanel and lets the parent
 * open the extension sidecar when a new page context arrives.
 *
 * NOTE: This hook is intentionally separate from the existing
 * useBrowserAutomation.ts, which handles outbound browser playback
 * commands (navigate, click, screenshot) rather than inbound extension
 * lifecycle events.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { listen, invoke, UnlistenFn } from '../lib/tauri-mock';
import { EVENTS } from '../constants/event-names';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import type { ExtensionPageContextEvent, ExtensionTaskResultEvent } from './useAgenticEvents';

// ─── Public state shape ────────────────────────────────────────────────────────

export type ExtensionAgentStatus = 'idle' | 'planning' | 'executing' | 'done' | 'error';

export interface ExtensionEventState {
  /** URL of the most recently detected page */
  currentPageUrl: string | null;
  /** Page title of the most recently detected page */
  currentPageTitle: string | null;
  /** Short description of the last browser action performed */
  lastAction: string | null;
  /** Aggregate status derived from latest events */
  agentStatus: ExtensionAgentStatus;
  /** True while a task_result with success=false was received */
  hasError: boolean;
  /** Raw error string from the most recent failed task_result */
  lastError: string | null;
  /** Number of actions performed in the last completed task */
  lastTaskActionsPerformed: number;
  /** Whether the extension WebSocket bridge is active */
  extensionConnected: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseExtensionEventsReturn extends ExtensionEventState {
  /** Invoke agi-workforce.stopAgent Tauri command */
  stopAgent: () => Promise<void>;
  /** Reset state back to idle (e.g. after user dismisses error) */
  resetState: () => void;
}

const INITIAL_STATE: ExtensionEventState = {
  currentPageUrl: null,
  currentPageTitle: null,
  lastAction: null,
  agentStatus: 'idle',
  hasError: false,
  lastError: null,
  lastTaskActionsPerformed: 0,
  extensionConnected: false,
};

export function useExtensionEvents(): UseExtensionEventsReturn {
  const [state, setState] = useState<ExtensionEventState>(INITIAL_STATE);
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isMounted = useRef(false);

  const safeSetState = useCallback(
    (updater: (prev: ExtensionEventState) => ExtensionEventState) => {
      if (isMounted.current) {
        setState(updater);
      }
    },
    [],
  );

  useEffect(() => {
    isMounted.current = true;

    const setup = async () => {
      // ── extension:page-context ─────────────────────────────────────────────
      // Emitted by extension.rs#process_page_context_event after page nav.
      // Signals that the extension has seen a new page and (post-B3-fix)
      // the AutonomousAgent is planning actions for it.
      const unlistenPageCtx = await listen<ExtensionPageContextEvent>(
        EVENTS.EXTENSION_PAGE_CONTEXT,
        (event) => {
          const payload = event.payload;
          const actionSummary =
            payload.actions && payload.actions.length > 0
              ? `Planning ${payload.actions.length} action${payload.actions.length === 1 ? '' : 's'}`
              : 'Analysing page…';

          safeSetState((prev) => ({
            ...prev,
            currentPageUrl: payload.url,
            currentPageTitle: payload.title,
            lastAction: actionSummary,
            agentStatus: 'planning',
            hasError: false,
            lastError: null,
            extensionConnected: true,
          }));

          // Auto-open the extension sidecar on first page-context event so the
          // user can see the live status without manually switching panels.
          const storeState = useUnifiedChatStore.getState();
          if (!storeState.sidecar.isOpen) {
            storeState.openSidecar('extension', payload.task_id);
          }
        },
      );

      // ── extension:task-result ──────────────────────────────────────────────
      // Emitted by extension.rs#process_task_result_event after the extension
      // completes (or fails) a task dispatched to the page.
      const unlistenTaskResult = await listen<ExtensionTaskResultEvent>(
        EVENTS.EXTENSION_TASK_RESULT,
        (event) => {
          const payload = event.payload;
          const actionSummary = payload.success
            ? `Completed — ${payload.actions_performed ?? 0} action${(payload.actions_performed ?? 0) === 1 ? '' : 's'} in ${payload.duration != null ? `${(payload.duration / 1000).toFixed(1)}s` : 'unknown time'}`
            : `Failed: ${payload.error ?? 'Unknown error'}`;

          safeSetState((prev) => ({
            ...prev,
            lastAction: actionSummary,
            agentStatus: payload.success ? 'done' : 'error',
            hasError: !payload.success,
            lastError: payload.success ? null : (payload.error ?? null),
            lastTaskActionsPerformed: payload.actions_performed ?? 0,
            extensionConnected: true,
          }));
        },
      );

      // ── extension:connection-status (optional) ─────────────────────────────
      // Keep the extensionConnected flag in sync if the desktop emits this.
      // The event name matches what useAgenticEvents already handles.
      const unlistenConnStatus = await listen<{ connected: boolean }>(
        'extension:connection-status',
        (event) => {
          safeSetState((prev) => ({
            ...prev,
            extensionConnected: event.payload.connected,
            agentStatus: event.payload.connected ? prev.agentStatus : 'idle',
          }));
        },
      );

      if (isMounted.current) {
        unlistenFns.current = [unlistenPageCtx, unlistenTaskResult, unlistenConnStatus];
      } else {
        // Component unmounted before setup completed — clean up immediately
        unlistenPageCtx();
        unlistenTaskResult();
        unlistenConnStatus();
      }
    };

    setup().catch((err) => {
      console.warn('[useExtensionEvents] Failed to set up Tauri event listeners:', err);
    });

    return () => {
      isMounted.current = false;
      for (const unlisten of unlistenFns.current) {
        unlisten();
      }
      unlistenFns.current = [];
    };
  }, [safeSetState]);

  const stopAgent = useCallback(async () => {
    try {
      await invoke('agent_stop');
      safeSetState((prev) => ({
        ...prev,
        agentStatus: 'idle',
        lastAction: 'Stopped by user',
      }));
    } catch (err) {
      console.warn('[useExtensionEvents] agent_stop failed:', err);
    }
  }, [safeSetState]);

  const resetState = useCallback(() => {
    safeSetState(() => INITIAL_STATE);
  }, [safeSetState]);

  return {
    ...state,
    stopAgent,
    resetState,
  };
}
