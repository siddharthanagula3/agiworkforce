import { invoke } from '@tauri-apps/api/core';
import type { CaptureResult } from '../types/capture';
import type {
  AutomationClickRequest,
  AutomationElementInfo,
  AutomationOcrResult,
  AutomationQuery,
  AutomationScreenshotOptions,
  OverlayClickPayload,
  OverlayRegionPayload,
  OverlayTypePayload,
} from '../types/automation';
import { normalizeCaptureResult, type RawCaptureResult } from '../utils/captureTransforms';

interface RawBoundingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RawAutomationElementInfo {
  id: string;
  name: string;
  class_name: string;
  control_type: string;
  bounding_rect?: RawBoundingRect | null;
}

type RawAutomationQuery = Record<string, unknown>;

function normalizeAutomationElement(raw: RawAutomationElementInfo): AutomationElementInfo {
  return {
    id: raw.id,
    name: raw.name,
    className: raw.class_name,
    controlType: raw.control_type,
    boundingRect: raw.bounding_rect
      ? {
          left: raw.bounding_rect.left,
          top: raw.bounding_rect.top,
          width: raw.bounding_rect.width,
          height: raw.bounding_rect.height,
        }
      : null,
  };
}

function buildAutomationQuery(query: AutomationQuery): RawAutomationQuery {
  const payload: RawAutomationQuery = {};
  if (query.parentId) payload['parent_id'] = query.parentId;
  if (query.window) payload['window'] = query.window;
  if (query.windowClass) payload['window_class'] = query.windowClass;
  if (query.name) payload['name'] = query.name;
  if (query.className) payload['class_name'] = query.className;
  if (query.automationId) payload['automation_id'] = query.automationId;
  if (query.controlType) payload['control_type'] = query.controlType;
  if (query.maxResults != null) payload['max_results'] = query.maxResults;
  return payload;
}

function buildClickRequest(request: AutomationClickRequest): RawAutomationQuery {
  const payload: RawAutomationQuery = {};
  if (request.elementId) payload['element_id'] = request.elementId;
  if (request.x != null) payload['x'] = request.x;
  if (request.y != null) payload['y'] = request.y;
  if (request.button) payload['button'] = request.button;
  return payload;
}

function buildScreenshotRequest(options: AutomationScreenshotOptions): RawAutomationQuery {
  const payload: RawAutomationQuery = {};
  if (options.elementId) payload['element_id'] = options.elementId;
  if (options.x != null) payload['x'] = options.x;
  if (options.y != null) payload['y'] = options.y;
  if (options.width != null) payload['width'] = options.width;
  if (options.height != null) payload['height'] = options.height;
  if (options.conversationId != null) payload['conversation_id'] = options.conversationId;
  return payload;
}

export async function listAutomationWindows(): Promise<AutomationElementInfo[]> {
  const raw = await invoke<RawAutomationElementInfo[]>('automation_list_windows');
  return raw.map(normalizeAutomationElement);
}

export async function findAutomationElements(
  query: AutomationQuery,
): Promise<AutomationElementInfo[]> {
  const raw = await invoke<RawAutomationElementInfo[]>('automation_find_elements', {
    request: buildAutomationQuery(query),
  });
  return raw.map(normalizeAutomationElement);
}

export async function invokeElement(elementId: string): Promise<void> {
  await invoke('automation_invoke', { request: { element_id: elementId } });
}

export async function setElementValue(
  elementId: string,
  value: string,
  focus = false,
): Promise<void> {
  await invoke('automation_set_value', {
    request: {
      element_id: elementId,
      value,
      focus,
    },
  });
}

export async function getElementValue(elementId: string): Promise<string> {
  return invoke<string>('automation_get_value', { element_id: elementId });
}

export async function toggleElement(elementId: string): Promise<void> {
  await invoke('automation_toggle', { element_id: elementId });
}

export async function focusWindow(elementId: string): Promise<void> {
  await invoke('automation_focus_window', { element_id: elementId });
}

export async function sendKeys(
  text: string,
  options: { elementId?: string; x?: number; y?: number; focus?: boolean } = {},
): Promise<void> {
  await invoke('automation_send_keys', {
    request: {
      text,
      element_id: options.elementId,
      x: options.x,
      y: options.y,
      focus: options.focus,
    },
  });
}

export async function sendHotkey(key: number, modifiers: string[]): Promise<void> {
  await invoke('automation_hotkey', { request: { key, modifiers } });
}

export async function clickAutomation(request: AutomationClickRequest): Promise<void> {
  await invoke('automation_click', { request: buildClickRequest(request) });
}

export async function automationScreenshot(
  options: AutomationScreenshotOptions = {},
): Promise<CaptureResult> {
  const raw = await invoke<RawCaptureResult>('automation_screenshot', {
    request: buildScreenshotRequest(options),
  });
  return normalizeCaptureResult(raw);
}

export async function automationOcr(imagePath: string): Promise<AutomationOcrResult> {
  return invoke<AutomationOcrResult>('automation_ocr', { image_path: imagePath });
}

export async function getClipboardText(): Promise<string> {
  return invoke<string>('automation_clipboard_get');
}

export async function setClipboardText(text: string): Promise<void> {
  await invoke('automation_clipboard_set', { text });
}

export async function emitOverlayClick(payload: OverlayClickPayload): Promise<void> {
  await invoke('overlay_emit_click', { payload });
}

export async function emitOverlayType(payload: OverlayTypePayload): Promise<void> {
  await invoke('overlay_emit_type', { payload });
}

export async function emitOverlayRegion(payload: OverlayRegionPayload): Promise<void> {
  await invoke('overlay_emit_region', { payload });
}

export async function replayOverlayEvents(limit?: number): Promise<void> {
  await invoke('overlay_replay_recent', { limit });
}
