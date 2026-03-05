import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '../lib/tauri-mock';
import { useAutomationStore } from '../stores/automationStore';
import type { RecordedAction, Recording } from '../types/automationEnhanced';

interface RawRecordedAction {
  id: string;
  action_type: string;
  timestamp_ms: number;
  target?: RecordedAction['target'];
  value?: string;
  metadata?: Record<string, unknown>;
}

interface RawRecordingStartedEvent {
  session_id: string;
  start_time: number;
  is_recording: boolean;
}

interface RawRecordingStoppedEvent {
  id: string;
  name: string;
  description?: string;
  actions: RawRecordedAction[];
  duration_ms: number;
  created_at: number;
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

function normalizeRecordedAction(action: RawRecordedAction): RecordedAction {
  return {
    id: action.id,
    actionType: action.action_type as RecordedAction['actionType'],
    timestampMs: action.timestamp_ms,
    target: action.target,
    value: action.value,
    metadata: action.metadata,
  };
}

function normalizeRecording(recording: RawRecordingStoppedEvent): Recording {
  return {
    id: recording.id,
    name: recording.name,
    description: recording.description,
    actions: recording.actions.map(normalizeRecordedAction),
    durationMs: recording.duration_ms,
    createdAt: recording.created_at,
  };
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

    registerListener<RawRecordingStartedEvent>('automation:recording_started', (event) => {
      handlersRef.current.handleRecordingStarted({
        sessionId: event.payload.session_id,
        startTime: event.payload.start_time,
        isRecording: event.payload.is_recording,
      });
    });

    registerListener<RawRecordingStoppedEvent>('automation:recording_stopped', (event) => {
      handlersRef.current.handleRecordingStopped(normalizeRecording(event.payload));
    });

    registerListener<RawRecordedAction>('automation:action_recorded', (event) => {
      handlersRef.current.handleActionRecorded(normalizeRecordedAction(event.payload));
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
