import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import { useAutomationStore } from '../stores/automationStore';
import type { RecordedAction, Recording } from '../types/automation-enhanced';

/**
 * Event payloads emitted from Tauri backend
 */
export interface RecordingStartedEvent {
  sessionId: string;
  startTime: number;
  isRecording: boolean;
}

export interface RecordingStoppedEvent {
  recording: Recording;
}

export interface ActionRecordedEvent {
  action: RecordedAction;
  sessionId: string;
}

export interface ShortcutActionEvent {
  action: string;
}

export interface ShortcutRegisteredEvent {
  shortcut: Shortcut;
}

export interface ShortcutUnregisteredEvent {
  shortcutId: string;
}

export interface Shortcut {
  id: string;
  key: string; // e.g., "CommandOrControl+K"
  description: string;
  action: string; // e.g., "open_chat", "toggle_window"
  enabled: boolean;
}

/**
 * Hook to listen to automation and shortcut events from Tauri backend
 *
 * This hook establishes listeners for automation recording and keyboard shortcut
 * events and automatically updates the automation store when events occur.
 * It handles cleanup on unmount.
 *
 * Updated Nov 16, 2025: Fixed missing dependencies and race conditions
 *
 * @example
 * ```tsx
 * function AutomationView() {
 *   useAutomationEvents();
 *   return <AutomationRecorder />;
 * }
 * ```
 */
export function useAutomationEvents() {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isMountedRef = useRef(true);

  // Store handler refs to avoid dependency issues
  const handlersRef = useRef({
    handleRecordingStarted: useAutomationStore.getState().handleRecordingStarted,
    handleRecordingStopped: useAutomationStore.getState().handleRecordingStopped,
    handleActionRecorded: useAutomationStore.getState().handleActionRecorded,
    handleShortcutAction: useAutomationStore.getState().handleShortcutAction,
    handleShortcutRegistered: useAutomationStore.getState().handleShortcutRegistered,
    handleShortcutUnregistered: useAutomationStore.getState().handleShortcutUnregistered,
  });

  // Update handler refs when store changes
  useEffect(() => {
    const unsubscribe = useAutomationStore.subscribe((state) => {
      handlersRef.current = {
        handleRecordingStarted: state.handleRecordingStarted,
        handleRecordingStopped: state.handleRecordingStopped,
        handleActionRecorded: state.handleActionRecorded,
        handleShortcutAction: state.handleShortcutAction,
        handleShortcutRegistered: state.handleShortcutRegistered,
        handleShortcutUnregistered: state.handleShortcutUnregistered,
      };
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const setupListeners = async () => {
      // Recording Started Event
      const unlistenRecordingStarted = await listen<RecordingStartedEvent>(
        'automation:recording_started',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleRecordingStarted(event.payload);
        },
      );
      unlistenFns.current.push(unlistenRecordingStarted);

      // Recording Stopped Event
      const unlistenRecordingStopped = await listen<RecordingStoppedEvent>(
        'automation:recording_stopped',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleRecordingStopped(event.payload.recording);
        },
      );
      unlistenFns.current.push(unlistenRecordingStopped);

      // Action Recorded Event
      const unlistenActionRecorded = await listen<ActionRecordedEvent>(
        'automation:action_recorded',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleActionRecorded(event.payload.action);
        },
      );
      unlistenFns.current.push(unlistenActionRecorded);

      // Shortcut Action Event
      const unlistenShortcutAction = await listen<string>('shortcut_action', (event) => {
        if (!isMountedRef.current) return;

        handlersRef.current.handleShortcutAction(event.payload);
      });
      unlistenFns.current.push(unlistenShortcutAction);

      // Shortcut Registered Event
      const unlistenShortcutRegistered = await listen<Shortcut>('shortcut_registered', (event) => {
        if (!isMountedRef.current) return;

        handlersRef.current.handleShortcutRegistered(event.payload);
      });
      unlistenFns.current.push(unlistenShortcutRegistered);

      // Shortcut Unregistered Event
      const unlistenShortcutUnregistered = await listen<string>(
        'shortcut_unregistered',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleShortcutUnregistered(event.payload);
        },
      );
      unlistenFns.current.push(unlistenShortcutUnregistered);
    };

    setupListeners().catch((error) => {
      console.error('[useAutomationEvents] Failed to setup listeners:', error);
    });

    // Cleanup: unlisten all events on unmount
    return () => {
      isMountedRef.current = false;

      unlistenFns.current.forEach((unlisten) => {
        unlisten();
      });
      unlistenFns.current = [];
    };
  }, []); // Empty deps - setup once on mount, handlers updated via refs

  return null;
}

export default useAutomationEvents;
