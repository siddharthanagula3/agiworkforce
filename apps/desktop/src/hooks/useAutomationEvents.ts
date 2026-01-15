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

    // Helper to safely register listeners with proper cleanup on early unmount
    const registerListener = <T>(eventName: string, handler: (event: { payload: T }) => void) => {
      listen<T>(eventName, (event) => {
        if (isMountedRef.current) {
          handler(event);
        }
      }).then((unlisten) => {
        if (isMountedRef.current) {
          unlistenFns.current.push(unlisten);
        } else {
          // Component unmounted before listener was set up, clean up immediately
          unlisten();
        }
      });
    };

    registerListener<RecordingStartedEvent>('automation:recording_started', (event) => {
      handlersRef.current.handleRecordingStarted(event.payload);
    });

    registerListener<RecordingStoppedEvent>('automation:recording_stopped', (event) => {
      handlersRef.current.handleRecordingStopped(event.payload.recording);
    });

    registerListener<ActionRecordedEvent>('automation:action_recorded', (event) => {
      handlersRef.current.handleActionRecorded(event.payload.action);
    });

    registerListener<string>('shortcut_action', (event) => {
      handlersRef.current.handleShortcutAction(event.payload);
    });

    registerListener<Shortcut>('shortcut_registered', (event) => {
      handlersRef.current.handleShortcutRegistered(event.payload);
    });

    registerListener<string>('shortcut_unregistered', (event) => {
      handlersRef.current.handleShortcutUnregistered(event.payload);
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
