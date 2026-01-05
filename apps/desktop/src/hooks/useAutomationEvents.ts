import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '../lib/tauri-mock';
import { useAutomationStore } from '../stores/automationStore';
import type { RecordedAction, Recording } from '../types/automationEnhanced';

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
  key: string;
  description: string;
  action: string;
  enabled: boolean;
}

export function useAutomationEvents() {
  const unlistenFns = useRef<UnlistenFn[]>([]);
  const isMountedRef = useRef(true);

  const handlersRef = useRef({
    handleRecordingStarted: useAutomationStore.getState().handleRecordingStarted,
    handleRecordingStopped: useAutomationStore.getState().handleRecordingStopped,
    handleActionRecorded: useAutomationStore.getState().handleActionRecorded,
    handleShortcutAction: useAutomationStore.getState().handleShortcutAction,
    handleShortcutRegistered: useAutomationStore.getState().handleShortcutRegistered,
    handleShortcutUnregistered: useAutomationStore.getState().handleShortcutUnregistered,
  });

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
      const unlistenRecordingStarted = await listen<RecordingStartedEvent>(
        'automation:recording_started',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleRecordingStarted(event.payload);
        },
      );
      unlistenFns.current.push(unlistenRecordingStarted);

      const unlistenRecordingStopped = await listen<RecordingStoppedEvent>(
        'automation:recording_stopped',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleRecordingStopped(event.payload.recording);
        },
      );
      unlistenFns.current.push(unlistenRecordingStopped);

      const unlistenActionRecorded = await listen<ActionRecordedEvent>(
        'automation:action_recorded',
        (event) => {
          if (!isMountedRef.current) return;

          handlersRef.current.handleActionRecorded(event.payload.action);
        },
      );
      unlistenFns.current.push(unlistenActionRecorded);

      const unlistenShortcutAction = await listen<string>('shortcut_action', (event) => {
        if (!isMountedRef.current) return;

        handlersRef.current.handleShortcutAction(event.payload);
      });
      unlistenFns.current.push(unlistenShortcutAction);

      const unlistenShortcutRegistered = await listen<Shortcut>('shortcut_registered', (event) => {
        if (!isMountedRef.current) return;

        handlersRef.current.handleShortcutRegistered(event.payload);
      });
      unlistenFns.current.push(unlistenShortcutRegistered);

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

    return () => {
      isMountedRef.current = false;

      unlistenFns.current.forEach((unlisten) => {
        unlisten();
      });
      unlistenFns.current = [];
    };
  }, []);

  return null;
}

export default useAutomationEvents;
