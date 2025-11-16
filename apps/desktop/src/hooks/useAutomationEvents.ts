import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAutomationStore } from '../stores/automationStore';
import type { Recording, RecordedAction } from '../types/automation-enhanced';

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
  const handleRecordingStarted = useAutomationStore((state) => state.handleRecordingStarted);
  const handleRecordingStopped = useAutomationStore((state) => state.handleRecordingStopped);
  const handleActionRecorded = useAutomationStore((state) => state.handleActionRecorded);
  const handleShortcutAction = useAutomationStore((state) => state.handleShortcutAction);
  const handleShortcutRegistered = useAutomationStore((state) => state.handleShortcutRegistered);
  const handleShortcutUnregistered = useAutomationStore(
    (state) => state.handleShortcutUnregistered,
  );

  useEffect(() => {
    const setupListeners = async () => {
      // Recording Started Event
      const unlistenRecordingStarted = await listen<RecordingStartedEvent>(
        'automation:recording_started',
        (event) => {
          console.log('[useAutomationEvents] Recording started:', event.payload);
          handleRecordingStarted(event.payload);
        },
      );
      unlistenFns.current.push(unlistenRecordingStarted);

      // Recording Stopped Event
      const unlistenRecordingStopped = await listen<RecordingStoppedEvent>(
        'automation:recording_stopped',
        (event) => {
          console.log('[useAutomationEvents] Recording stopped:', event.payload);
          handleRecordingStopped(event.payload.recording);
        },
      );
      unlistenFns.current.push(unlistenRecordingStopped);

      // Action Recorded Event
      const unlistenActionRecorded = await listen<ActionRecordedEvent>(
        'automation:action_recorded',
        (event) => {
          console.log('[useAutomationEvents] Action recorded:', event.payload);
          handleActionRecorded(event.payload.action);
        },
      );
      unlistenFns.current.push(unlistenActionRecorded);

      // Shortcut Action Event
      const unlistenShortcutAction = await listen<string>('shortcut_action', (event) => {
        console.log('[useAutomationEvents] Shortcut action triggered:', event.payload);
        handleShortcutAction(event.payload);
      });
      unlistenFns.current.push(unlistenShortcutAction);

      // Shortcut Registered Event
      const unlistenShortcutRegistered = await listen<Shortcut>('shortcut_registered', (event) => {
        console.log('[useAutomationEvents] Shortcut registered:', event.payload);
        handleShortcutRegistered(event.payload);
      });
      unlistenFns.current.push(unlistenShortcutRegistered);

      // Shortcut Unregistered Event
      const unlistenShortcutUnregistered = await listen<string>(
        'shortcut_unregistered',
        (event) => {
          console.log('[useAutomationEvents] Shortcut unregistered:', event.payload);
          handleShortcutUnregistered(event.payload);
        },
      );
      unlistenFns.current.push(unlistenShortcutUnregistered);

      console.log('[useAutomationEvents] All automation event listeners established');
    };

    setupListeners().catch((error) => {
      console.error('[useAutomationEvents] Failed to setup listeners:', error);
    });

    // Cleanup: unlisten all events on unmount
    return () => {
      console.log('[useAutomationEvents] Cleaning up automation event listeners');
      unlistenFns.current.forEach((unlisten) => {
        unlisten();
      });
      unlistenFns.current = [];
    };
  }, []); // Empty deps - setup once on mount

  return null;
}

export default useAutomationEvents;
