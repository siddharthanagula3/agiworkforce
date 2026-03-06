import { invoke } from '../lib/tauri-mock';
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
import type { CaptureResult } from '../types/capture';
import { normalizeCaptureResult, type RawCaptureResult } from '../utils/captureTransforms';

const AUTOMATION_TIMEOUT_MS = 30000;

async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = AUTOMATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Automation command '${command}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke<T>(command, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Automation command '${command}' failed: ${error}`));
      });
  });
}

function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

function validateCoordinates(x: number | undefined, y: number | undefined): void {
  if (x !== undefined && (x < 0 || !Number.isFinite(x))) {
    throw new Error(`Invalid x coordinate: ${x}`);
  }
  if (y !== undefined && (y < 0 || !Number.isFinite(y))) {
    throw new Error(`Invalid y coordinate: ${y}`);
  }
}

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
  if (query.parentId) payload['parentId'] = query.parentId;
  if (query.window) payload['window'] = query.window;
  if (query.windowClass) payload['windowClass'] = query.windowClass;
  if (query.name) payload['name'] = query.name;
  if (query.className) payload['className'] = query.className;
  if (query.automationId) payload['automationId'] = query.automationId;
  if (query.controlType) payload['controlType'] = query.controlType;
  if (query.maxResults != null) payload['maxResults'] = query.maxResults;
  return payload;
}

function buildClickRequest(request: AutomationClickRequest): RawAutomationQuery {
  const payload: RawAutomationQuery = {};
  if (request.elementId) payload['elementId'] = request.elementId;
  if (request.x != null) payload['x'] = request.x;
  if (request.y != null) payload['y'] = request.y;
  if (request.button) payload['button'] = request.button;
  return payload;
}

function buildScreenshotRequest(options: AutomationScreenshotOptions): RawAutomationQuery {
  const payload: RawAutomationQuery = {};
  if (options.elementId) payload['elementId'] = options.elementId;
  if (options.x != null) payload['x'] = options.x;
  if (options.y != null) payload['y'] = options.y;
  if (options.width != null) payload['width'] = options.width;
  if (options.height != null) payload['height'] = options.height;
  if (options.conversationId != null) payload['conversationId'] = options.conversationId;
  return payload;
}

export async function listAutomationWindows(): Promise<AutomationElementInfo[]> {
  try {
    const raw = await invokeWithTimeout<RawAutomationElementInfo[]>('automation_list_windows');
    return raw.map(normalizeAutomationElement);
  } catch (error) {
    throw new Error(`Failed to list automation windows: ${error}`);
  }
}

export async function findAutomationElements(
  query: AutomationQuery,
): Promise<AutomationElementInfo[]> {
  try {
    if (!query || Object.keys(query).length === 0) {
      throw new Error('Query object cannot be empty');
    }
    const raw = await invokeWithTimeout<RawAutomationElementInfo[]>('automation_find_elements', {
      request: buildAutomationQuery(query),
    });
    return raw.map(normalizeAutomationElement);
  } catch (error) {
    throw new Error(`Failed to find automation elements: ${error}`);
  }
}

export async function invokeElement(elementId: string): Promise<void> {
  try {
    validateNonEmpty(elementId, 'elementId');
    await invokeWithTimeout('automation_invoke', { request: { elementId } });
  } catch (error) {
    throw new Error(`Failed to invoke element ${elementId}: ${error}`);
  }
}

export async function setElementValue(
  elementId: string,
  value: string,
  focus = false,
): Promise<void> {
  try {
    validateNonEmpty(elementId, 'elementId');
    if (value === undefined || value === null) {
      throw new Error('value cannot be null or undefined');
    }
    await invokeWithTimeout('automation_set_value', {
      request: {
        elementId,
        value,
        focus,
      },
    });
  } catch (error) {
    throw new Error(`Failed to set element value for ${elementId}: ${error}`);
  }
}

export async function getElementValue(elementId: string): Promise<string> {
  try {
    validateNonEmpty(elementId, 'elementId');
    return await invokeWithTimeout<string>('automation_get_value', { elementId });
  } catch (error) {
    throw new Error(`Failed to get element value for ${elementId}: ${error}`);
  }
}

export async function toggleElement(elementId: string): Promise<void> {
  try {
    validateNonEmpty(elementId, 'elementId');
    await invokeWithTimeout('automation_toggle', { elementId });
  } catch (error) {
    throw new Error(`Failed to toggle element ${elementId}: ${error}`);
  }
}

export async function focusWindow(elementId: string): Promise<void> {
  try {
    validateNonEmpty(elementId, 'elementId');
    await invokeWithTimeout('automation_focus_window', { elementId });
  } catch (error) {
    throw new Error(`Failed to focus window ${elementId}: ${error}`);
  }
}

export async function sendKeys(
  text: string,
  options: { elementId?: string; x?: number; y?: number; focus?: boolean } = {},
): Promise<void> {
  try {
    if (text === undefined || text === null) {
      throw new Error('text cannot be null or undefined');
    }
    validateCoordinates(options.x, options.y);
    await invokeWithTimeout('automation_send_keys', {
      request: {
        text,
        elementId: options.elementId,
        x: options.x,
        y: options.y,
        focus: options.focus,
      },
    });
  } catch (error) {
    throw new Error(`Failed to send keys: ${error}`);
  }
}

export async function sendHotkey(key: number, modifiers: string[]): Promise<void> {
  try {
    if (!Number.isInteger(key) || key < 0) {
      throw new Error(`Invalid key code: ${key}`);
    }
    if (!Array.isArray(modifiers)) {
      throw new Error('modifiers must be an array');
    }
    await invokeWithTimeout('automation_hotkey', { request: { key, modifiers } });
  } catch (error) {
    throw new Error(`Failed to send hotkey: ${error}`);
  }
}

export async function clickAutomation(request: AutomationClickRequest): Promise<void> {
  try {
    if (!request || Object.keys(request).length === 0) {
      throw new Error('Click request cannot be empty');
    }
    validateCoordinates(request.x, request.y);
    await invokeWithTimeout('automation_click', { request: buildClickRequest(request) });
  } catch (error) {
    throw new Error(`Failed to perform automation click: ${error}`);
  }
}

export async function automationScreenshot(
  options: AutomationScreenshotOptions = {},
): Promise<CaptureResult> {
  try {
    validateCoordinates(options.x, options.y);
    if (options.width !== undefined && (options.width <= 0 || !Number.isFinite(options.width))) {
      throw new Error(`Invalid width: ${options.width}`);
    }
    if (options.height !== undefined && (options.height <= 0 || !Number.isFinite(options.height))) {
      throw new Error(`Invalid height: ${options.height}`);
    }
    const raw = await invokeWithTimeout<RawCaptureResult>(
      'automation_screenshot',
      { request: buildScreenshotRequest(options) },
      60000,
    );
    return normalizeCaptureResult(raw);
  } catch (error) {
    throw new Error(`Failed to capture automation screenshot: ${error}`);
  }
}

export async function automationOcr(imagePath: string): Promise<AutomationOcrResult> {
  try {
    validateNonEmpty(imagePath, 'imagePath');
    return await invokeWithTimeout<AutomationOcrResult>('automation_ocr', { imagePath }, 60000);
  } catch (error) {
    throw new Error(`Failed to perform OCR on ${imagePath}: ${error}`);
  }
}

export async function getClipboardText(): Promise<string> {
  try {
    return await invokeWithTimeout<string>('automation_clipboard_get');
  } catch (error) {
    throw new Error(`Failed to get clipboard text: ${error}`);
  }
}

export async function setClipboardText(text: string): Promise<void> {
  try {
    if (text === undefined || text === null) {
      throw new Error('text cannot be null or undefined');
    }
    await invokeWithTimeout('automation_clipboard_set', { text });
  } catch (error) {
    throw new Error(`Failed to set clipboard text: ${error}`);
  }
}

export async function emitOverlayClick(payload: OverlayClickPayload): Promise<void> {
  try {
    if (!payload) {
      throw new Error('payload cannot be null or undefined');
    }
    await invokeWithTimeout('overlay_emit_click', { payload });
  } catch (error) {
    throw new Error(`Failed to emit overlay click: ${error}`);
  }
}

export async function emitOverlayType(payload: OverlayTypePayload): Promise<void> {
  try {
    if (!payload) {
      throw new Error('payload cannot be null or undefined');
    }
    await invokeWithTimeout('overlay_emit_type', { payload });
  } catch (error) {
    throw new Error(`Failed to emit overlay type: ${error}`);
  }
}

export async function emitOverlayRegion(payload: OverlayRegionPayload): Promise<void> {
  try {
    if (!payload) {
      throw new Error('payload cannot be null or undefined');
    }
    await invokeWithTimeout('overlay_emit_region', { payload });
  } catch (error) {
    throw new Error(`Failed to emit overlay region: ${error}`);
  }
}

export async function replayOverlayEvents(limit?: number): Promise<void> {
  try {
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      throw new Error(`Invalid limit: ${limit}`);
    }
    await invokeWithTimeout('overlay_replay_recent', { limit });
  } catch (error) {
    throw new Error(`Failed to replay overlay events: ${error}`);
  }
}
