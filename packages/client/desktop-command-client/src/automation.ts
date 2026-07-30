/**
 * Automation API — typed wrappers for automation_*, overlay_*, computer_use_*, screen_watcher_*,
 * ocr_*, and capture_* Tauri commands.
 */

import { command } from '@agiworkforce/client-runtime';

// ---- Types ----

export interface UIElementInfo {
  id: string;
  role: string;
  name: string;
  value?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}
export interface FindElementsRequest {
  parentId?: string;
  window?: string;
  windowClass?: string;
}
export interface InvokeRequest {
  elementId: string;
  action: string;
}
export interface ValueRequest {
  elementId: string;
  value: string;
}
export interface SendKeysRequest {
  keys: string;
  delay?: number;
}
export interface HotkeyRequest {
  keys: string[];
}
export interface ClickRequest {
  x: number;
  y: number;
  button?: string;
  clicks?: number;
}
export interface DragDropRequest {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
export interface ScreenshotRequest {
  fullscreen?: boolean;
  region?: { x: number; y: number; width: number; height: number };
}
export interface OcrResult {
  text: string;
  confidence: number;
  regions?: unknown[];
}
export interface CaptureResult {
  id: string;
  path: string;
  width: number;
  height: number;
  timestamp: string;
}
export interface OverlayClickPayload {
  x: number;
  y: number;
}
export interface OverlayTypePayload {
  text: string;
}
export interface OverlayRegionPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}
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
    })),
    durationMs: recording.duration_ms,
    createdAt: recording.created_at,
  };
}
export interface DetailedElementInfo {
  id: string;
  role: string;
  name: string;
  value?: string;
  properties: Record<string, unknown>;
}
export interface BasicElementInfo {
  id: string;
  role: string;
  name: string;
}
export interface ElementSelector {
  strategy: string;
  value: string;
}
export interface AutomationScript {
  id: string;
  name: string;
  description: string;
  actions: unknown[];
  tags?: string[];
}
export interface ExecutionResult {
  success: boolean;
  steps: number;
  duration: number;
  error?: string;
}
export interface ScreenCapture {
  id: string;
  path: string;
  width: number;
  height: number;
  timestamp: string;
}
export interface DesktopComputerUseSession {
  id: string;
  status: string;
  startedAt: string;
  actions: number;
}
export interface ZoomRegionRequest {
  x: number;
  y: number;
  width: number;
  height: number;
  zoomLevel?: number;
}
export interface ZoomRegionResponse {
  imagePath: string;
  width: number;
  height: number;
}
export interface WatcherStatus {
  running: boolean;
  paused: boolean;
  interval: number;
  captureCount: number;
}
export interface StartWatcherRequest {
  interval?: number;
  [key: string]: unknown;
}
export interface OCRResult {
  text: string;
  confidence: number;
  boxes?: unknown[];
  languages?: string[];
}
export interface Language {
  code: string;
  name: string;
}
export interface LanguageDetection {
  language: string;
  confidence: number;
}
export interface MultiLanguageResult {
  results: { language: string; text: string; confidence: number }[];
}
export interface WindowInfo {
  id: string;
  title: string;
  className: string;
  bounds: { x: number; y: number; width: number; height: number };
}
export interface CaptureRecord {
  id: string;
  path: string;
  conversationId?: number;
  timestamp: string;
}

// ---- Core Automation ----

export async function automationListWindows(): Promise<UIElementInfo[]> {
  return command<UIElementInfo[]>('automation_list_windows');
}
export async function automationFindElements(
  request: FindElementsRequest,
): Promise<UIElementInfo[]> {
  return command<UIElementInfo[]>('automation_find_elements', { request });
}
export async function automationInvoke(request: InvokeRequest): Promise<void> {
  return command<void>('automation_invoke', { request });
}
export async function automationSetValue(request: ValueRequest): Promise<void> {
  return command<void>('automation_set_value', { request });
}
export async function automationGetValue(elementId: string): Promise<string> {
  return command<string>('automation_get_value', { elementId });
}
export async function automationGetText(elementId: string): Promise<string> {
  return command<string>('automation_get_text', { elementId });
}
export async function automationToggle(elementId: string): Promise<void> {
  return command<void>('automation_toggle', { elementId });
}
export async function automationFocusWindow(elementId: string): Promise<void> {
  return command<void>('automation_focus_window', { elementId });
}
export async function automationSendKeys(request: SendKeysRequest): Promise<void> {
  return command<void>('automation_send_keys', { request });
}
export async function automationHotkey(request: HotkeyRequest): Promise<void> {
  return command<void>('automation_hotkey', { request });
}
export async function automationClick(request: ClickRequest): Promise<void> {
  return command<void>('automation_click', { request });
}
export async function automationType(request: SendKeysRequest): Promise<void> {
  return command<void>('automation_type', { request });
}
export async function automationDragDrop(request: DragDropRequest): Promise<void> {
  return command<void>('automation_drag_drop', { request });
}
export async function automationClipboardGet(): Promise<string> {
  return command<string>('automation_clipboard_get');
}
export async function automationClipboardSet(text: string): Promise<void> {
  return command<void>('automation_clipboard_set', { text });
}
export async function automationOcr(imagePath: string): Promise<OcrResult> {
  return command<OcrResult>('automation_ocr', { imagePath });
}
export async function automationScreenshot(request: ScreenshotRequest): Promise<CaptureResult> {
  return command<CaptureResult>('automation_screenshot', { request });
}
export async function overlayEmitClick(payload: OverlayClickPayload): Promise<void> {
  return command<void>('overlay_emit_click', { payload });
}
export async function overlayEmitType(payload: OverlayTypePayload): Promise<void> {
  return command<void>('overlay_emit_type', { payload });
}
export async function overlayEmitRegion(payload: OverlayRegionPayload): Promise<void> {
  return command<void>('overlay_emit_region', { payload });
}
export async function overlayReplayRecent(limit?: number): Promise<void> {
  return command<void>('overlay_replay_recent', { limit });
}

// ---- Enhanced Automation (Recording, Inspection, Scripts) ----

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
export async function automationRecordActionClick(
  x: number,
  y: number,
  button: string,
): Promise<void> {
  return command<void>('automation_record_action_click', { x, y, button });
}
export async function automationRecordActionType(
  text: string,
  x: number,
  y: number,
): Promise<void> {
  return command<void>('automation_record_action_type', { text, x, y });
}
export async function automationRecordActionScreenshot(): Promise<void> {
  return command<void>('automation_record_action_screenshot');
}
export async function automationRecordActionWait(durationMs: number): Promise<void> {
  return command<void>('automation_record_action_wait', { durationMs });
}
export async function automationRecordActionNarration(text: string): Promise<void> {
  return command<void>('automation_record_action_narration', { text });
}
export async function automationRecordIsRecording(): Promise<boolean> {
  return command<boolean>('automation_record_is_recording');
}
export async function automationRecordGetSession(): Promise<RecordingSession | null> {
  const session = await command<{
    session_id: string;
    start_time: number;
    is_recording: boolean;
  } | null>('automation_record_get_session');
  return session
    ? {
        sessionId: session.session_id,
        startTime: session.start_time,
        isRecording: session.is_recording,
      }
    : null;
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
export async function automationInspectElementAtPoint(
  x: number,
  y: number,
): Promise<DetailedElementInfo> {
  return command<DetailedElementInfo>('automation_inspect_element_at_point', { x, y });
}
export async function automationInspectElementById(
  elementId: string,
): Promise<DetailedElementInfo> {
  return command<DetailedElementInfo>('automation_inspect_element_by_id', { elementId });
}
export async function automationFindElementBySelector(
  selector: ElementSelector,
): Promise<BasicElementInfo | null> {
  return command<BasicElementInfo | null>('automation_find_element_by_selector', { selector });
}
export async function automationGenerateSelector(elementId: string): Promise<ElementSelector[]> {
  return command<ElementSelector[]>('automation_generate_selector', { elementId });
}
export async function automationGetElementTree(
  elementId: string,
): Promise<[BasicElementInfo | null, BasicElementInfo[]]> {
  return command<[BasicElementInfo | null, BasicElementInfo[]]>('automation_get_element_tree', {
    elementId,
  });
}
export async function automationExecuteScript(script: AutomationScript): Promise<ExecutionResult> {
  return command<ExecutionResult>('automation_execute_script', { script });
}
export async function automationSaveScript(script: AutomationScript): Promise<void> {
  return command<void>('automation_save_script', { script });
}
export async function automationLoadScript(scriptId: string): Promise<AutomationScript> {
  return command<AutomationScript>('automation_load_script', { scriptId });
}
export async function automationListScripts(): Promise<AutomationScript[]> {
  return command<AutomationScript[]>('automation_list_scripts');
}
export async function automationDeleteScript(scriptId: string): Promise<void> {
  return command<void>('automation_delete_script', { scriptId });
}
export async function listAutomationScripts(): Promise<AutomationScript[]> {
  return command<AutomationScript[]>('list_automation_scripts');
}
export async function saveAutomationScript(script: AutomationScript): Promise<void> {
  return command<void>('save_automation_script', { script });
}
export async function deleteAutomationScript(scriptId: string): Promise<void> {
  return command<void>('delete_automation_script', { scriptId });
}
export async function executeAutomationScript(
  scriptId: string,
  script?: AutomationScript,
): Promise<ExecutionResult> {
  return command<ExecutionResult>('execute_automation_script', { scriptId, script });
}
export async function saveRecordingAsScript(
  recordingId: string,
  name: string,
  description: string,
  tags: string[],
  actions?: RecordedAction[],
): Promise<AutomationScript> {
  return command<AutomationScript>('save_recording_as_script', {
    recordingId,
    name,
    description,
    tags,
    actions,
  });
}
export async function inspectElementAt(x: number, y: number): Promise<unknown> {
  return command<unknown>('inspect_element_at', { x, y });
}

// ---- Computer Use ----

export async function computerUseStartSession(): Promise<string> {
  return command<string>('computer_use_start_session');
}
export async function computerUseCaptureScreen(): Promise<ScreenCapture> {
  return command<ScreenCapture>('computer_use_capture_screen');
}
export async function computerUseClick(x: number, y: number): Promise<void> {
  return command<void>('computer_use_click', { x, y });
}
export async function computerUseMoveMouse(x: number, y: number): Promise<void> {
  return command<void>('computer_use_move_mouse', { x, y });
}
export async function computerUseTypeText(text: string): Promise<void> {
  return command<void>('computer_use_type_text', { text });
}
export async function computerUseGetSession(sessionId: string): Promise<DesktopComputerUseSession> {
  return command<DesktopComputerUseSession>('computer_use_get_session', { sessionId });
}
export async function computerUseListSessions(): Promise<DesktopComputerUseSession[]> {
  return command<DesktopComputerUseSession[]>('computer_use_list_sessions');
}
export async function computerUseExecuteTool(toolName: string, args: unknown): Promise<unknown> {
  return command<unknown>('computer_use_execute_tool', { toolName, args });
}
export async function computerUseZoomRegion(
  request: ZoomRegionRequest,
): Promise<ZoomRegionResponse> {
  return command<ZoomRegionResponse>('computer_use_zoom_region', { request });
}
export async function computerUseZoomAtPoint(
  x: number,
  y: number,
  contextSize?: number,
  zoomLevel?: number,
): Promise<ZoomRegionResponse> {
  return command<ZoomRegionResponse>('computer_use_zoom_at_point', {
    x,
    y,
    contextSize,
    zoomLevel,
  });
}
export async function computerUseSuggestZoomLevel(width: number, height: number): Promise<number> {
  return command<number>('computer_use_suggest_zoom_level', { width, height });
}
export async function computerUseExecuteOpaTask(
  description: string,
  timeoutMs?: number,
  maxActions?: number,
  targetApplication?: string,
  successIndicators?: string[],
): Promise<unknown> {
  return command<unknown>('computer_use_execute_opa_task', {
    description,
    timeoutMs,
    maxActions,
    targetApplication,
    successIndicators,
  });
}
export async function computerUseStopSession(sessionId: string): Promise<void> {
  return command<void>('computer_use_stop_session', { sessionId });
}

// ---- Screen Watcher ----

export async function screenWatcherStart(request?: StartWatcherRequest): Promise<void> {
  return command<void>('screen_watcher_start', { request });
}
export async function screenWatcherStop(): Promise<void> {
  return command<void>('screen_watcher_stop');
}
export async function screenWatcherPause(): Promise<void> {
  return command<void>('screen_watcher_pause');
}
export async function screenWatcherResume(): Promise<void> {
  return command<void>('screen_watcher_resume');
}
export async function screenWatcherStatus(): Promise<WatcherStatus> {
  return command<WatcherStatus>('screen_watcher_status');
}
export async function screenWatcherGetLatest(): Promise<ScreenCapture | null> {
  return command<ScreenCapture | null>('screen_watcher_get_latest');
}
export async function screenWatcherGetRecent(): Promise<ScreenCapture[]> {
  return command<ScreenCapture[]>('screen_watcher_get_recent');
}
export async function screenWatcherCaptureNow(): Promise<ScreenCapture> {
  return command<ScreenCapture>('screen_watcher_capture_now');
}

// ---- OCR ----

export async function ocrProcessImage(
  captureId: string,
  imagePath: string,
  language?: string,
): Promise<OCRResult> {
  return command<OCRResult>('ocr_process_image', { captureId, imagePath, language });
}
export async function ocrProcessRegion(
  imagePath: string,
  x: number,
  y: number,
  width: number,
  height: number,
  language?: string,
): Promise<OCRResult> {
  return command<OCRResult>('ocr_process_region', { imagePath, x, y, width, height, language });
}
export async function ocrGetLanguages(): Promise<Language[]> {
  return command<Language[]>('ocr_get_languages');
}
export async function ocrGetResult(captureId: string): Promise<OCRResult | null> {
  return command<OCRResult | null>('ocr_get_result', { captureId });
}
export async function ocrProcessWithBoxes(
  imagePath: string,
  language?: string,
  preprocess?: boolean,
): Promise<OCRResult> {
  return command<OCRResult>('ocr_process_with_boxes', { imagePath, language, preprocess });
}
export async function ocrDetectLanguages(imagePath: string): Promise<LanguageDetection[]> {
  return command<LanguageDetection[]>('ocr_detect_languages', { imagePath });
}
export async function ocrProcessMultiLanguage(
  imagePath: string,
  preprocess?: boolean,
): Promise<MultiLanguageResult> {
  return command<MultiLanguageResult>('ocr_process_multi_language', { imagePath, preprocess });
}
export async function ocrPreprocessImage(imagePath: string, outputPath?: string): Promise<string> {
  return command<string>('ocr_preprocess_image', { imagePath, outputPath });
}

// ---- Screen Capture ----

export async function captureScreenFull(conversationId?: number): Promise<CaptureResult> {
  return command<CaptureResult>('capture_screen_full', { conversationId });
}
export async function captureScreenRegion(
  x: number,
  y: number,
  width: number,
  height: number,
  conversationId?: number,
): Promise<CaptureResult> {
  return command<CaptureResult>('capture_screen_region', { x, y, width, height, conversationId });
}
export async function captureGetWindows(): Promise<WindowInfo[]> {
  return command<WindowInfo[]>('capture_get_windows');
}
export async function captureGetHistory(
  conversationId?: number,
  limit?: number,
): Promise<CaptureRecord[]> {
  return command<CaptureRecord[]>('capture_get_history', { conversationId, limit });
}
export async function captureDelete(captureId: string): Promise<void> {
  return command<void>('capture_delete', { captureId });
}
export async function captureSaveToClipboard(captureId: string): Promise<void> {
  return command<void>('capture_save_to_clipboard', { captureId });
}
export async function captureScreenWindow(
  hwnd: string,
  conversationId?: number,
): Promise<CaptureResult> {
  return command<CaptureResult>('capture_screen_window', { hwnd, conversationId });
}
export async function captureFromClipboard(conversationId?: number): Promise<CaptureResult> {
  return command<CaptureResult>('capture_from_clipboard', { conversationId });
}

// ---- System Permissions ----

export interface AutomationPermissions {
  accessibility: boolean;
  screenRecording: boolean;
  inputMonitoring: boolean;
}

export async function checkAutomationPermissions(): Promise<AutomationPermissions> {
  const permissions = await command<{
    accessibility: boolean;
    screen_recording: boolean;
    input_monitoring: boolean;
  }>('check_automation_permissions');
  return {
    accessibility: permissions.accessibility,
    screenRecording: permissions.screen_recording,
    inputMonitoring: permissions.input_monitoring,
  };
}

export async function requestAutomationPermission(kind: string): Promise<void> {
  return command<void>('request_automation_permission', { kind });
}
