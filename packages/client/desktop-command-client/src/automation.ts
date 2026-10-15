import { command } from '@agiworkforce/client-runtime';

export interface RecordingSession {
  sessionId: string;
  startTime: number;
  isRecording: boolean;
}
export interface RecordingStatus extends RecordingSession {
  actionCount: number;
  durationMs: number;
}
export interface DiscardedRecording {
  sessionId: string;
  actionCount: number;
  durationMs: number;
}
export type RecordedActionType =
  | 'click'
  | 'right_click'
  | 'double_click'
  | 'type'
  | 'hotkey'
  | 'wait'
  | 'screenshot'
  | 'drag'
  | 'scroll'
  | 'narration';
export interface RecordedAction {
  id: string;
  actionType: RecordedActionType;
  timestampMs: number;
  target?: {
    x: number;
    y: number;
    elementId?: string;
    elementName?: string;
    elementType?: string;
  };
  value?: string;
  metadata?: Record<string, unknown>;
  /** The app the step acted in (bundle id, else name), captured while recording. */
  app?: string;
}
export interface Recording {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  durationMs: number;
  createdAt: number;
}
export interface RecordingCommandPayload {
  id: string;
  name: string;
  description?: string;
  actions: Array<{
    id: string;
    action_type: RecordedActionType;
    timestamp_ms: number;
    target?: {
      x: number;
      y: number;
      element_id?: string;
      element_name?: string;
      element_type?: string;
    };
    value?: string;
    metadata?: Record<string, unknown>;
    app?: string;
  }>;
  duration_ms: number;
  created_at: number;
}

export function recordingToCommandPayload(recording: Recording): RecordingCommandPayload {
  return {
    id: recording.id,
    name: recording.name,
    description: recording.description,
    actions: recording.actions.map((action) => ({
      id: action.id,
      action_type: action.actionType,
      timestamp_ms: action.timestampMs,
      target: action.target
        ? {
            x: action.target.x,
            y: action.target.y,
            element_id: action.target.elementId,
            element_name: action.target.elementName,
            element_type: action.target.elementType,
          }
        : undefined,
      value: action.value,
      metadata: action.metadata,
      app: action.app,
    })),
    duration_ms: recording.durationMs,
    created_at: recording.createdAt,
  };
}

function recordingFromCommandPayload(recording: RecordingCommandPayload): Recording {
  return {
    id: recording.id,
    name: recording.name,
    description: recording.description,
    actions: recording.actions.map((action) => ({
      id: action.id,
      actionType: action.action_type,
      timestampMs: action.timestamp_ms,
      target: action.target
        ? {
            x: action.target.x,
            y: action.target.y,
            elementId: action.target.element_id,
            elementName: action.target.element_name,
            elementType: action.target.element_type,
          }
        : undefined,
      value: action.value,
      metadata: action.metadata,
      app: action.app,
    })),
    durationMs: recording.duration_ms,
    createdAt: recording.created_at,
  };
}

export async function automationRecordStart(): Promise<RecordingSession> {
  const session = await command<{
    session_id: string;
    start_time: number;
    is_recording: boolean;
  }>('automation_record_start');
  return {
    sessionId: session.session_id,
    startTime: session.start_time,
    isRecording: session.is_recording,
  };
}
export async function automationRecordStop(): Promise<Recording> {
  const recording = await command<RecordingCommandPayload>('automation_record_stop');
  return recordingFromCommandPayload(recording);
}
export async function automationRecordDiscard(): Promise<DiscardedRecording> {
  const discarded = await command<{
    session_id: string;
    action_count: number;
    duration_ms: number;
  }>('automation_record_discard');
  return {
    sessionId: discarded.session_id,
    actionCount: discarded.action_count,
    durationMs: discarded.duration_ms,
  };
}
export async function automationRecordActionNarration(text: string): Promise<void> {
  return command<void>('automation_record_action_narration', { text });
}
export async function automationRecordGetStatus(): Promise<RecordingStatus | null> {
  const status = await command<{
    session_id: string;
    start_time: number;
    is_recording: boolean;
    action_count: number;
    duration_ms: number;
  } | null>('automation_record_get_status');
  return status
    ? {
        sessionId: status.session_id,
        startTime: status.start_time,
        isRecording: status.is_recording,
        actionCount: status.action_count,
        durationMs: status.duration_ms,
      }
    : null;
}
export async function automationRecordGetLast(): Promise<Recording | null> {
  const recording = await command<RecordingCommandPayload | null>('automation_record_get_last');
  return recording ? recordingFromCommandPayload(recording) : null;
}
export async function automationRecordClearLast(): Promise<void> {
  return command<void>('automation_record_clear_last');
}

export type AutomationCapabilitySupport = 'needs_grant' | 'no_grant_needed' | 'unsupported';

export interface PlatformAutomationSupport {
  accessibility: AutomationCapabilitySupport;
  screenRecording: AutomationCapabilitySupport;
  inputMonitoring: AutomationCapabilitySupport;
  windowControlMissingProgram: string | null;
}

export interface AutomationPermissions {
  accessibility: boolean;
  screenRecording: boolean;
  inputMonitoring: boolean;
  automationServiceReady: boolean;
  support: PlatformAutomationSupport;
}

export async function checkAutomationPermissions(): Promise<AutomationPermissions> {
  const permissions = await command<{
    accessibility: boolean;
    screen_recording: boolean;
    input_monitoring: boolean;
    automation_service_ready: boolean;
    support: {
      accessibility: AutomationCapabilitySupport;
      screen_recording: AutomationCapabilitySupport;
      input_monitoring: AutomationCapabilitySupport;
      window_control_missing_program: string | null;
    };
  }>('check_automation_permissions');
  return {
    accessibility: permissions.accessibility,
    screenRecording: permissions.screen_recording,
    inputMonitoring: permissions.input_monitoring,
    automationServiceReady: permissions.automation_service_ready,
    support: {
      accessibility: permissions.support.accessibility,
      screenRecording: permissions.support.screen_recording,
      inputMonitoring: permissions.support.input_monitoring,
      windowControlMissingProgram: permissions.support.window_control_missing_program,
    },
  };
}

export async function requestAutomationPermission(kind: string): Promise<void> {
  return command<void>('request_automation_permission', { kind });
}
