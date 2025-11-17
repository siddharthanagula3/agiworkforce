// Updated Nov 16, 2025: Added comprehensive error handling, validation, timeout handling, and stack overflow protection
import { invoke } from '@tauri-apps/api/core';
import type {
  AutomationScript,
  CodeLanguage,
  DetailedElementInfo,
  ElementSelector,
  ExecutionResult,
  GeneratedCode,
  Recording,
  RecordingSession,
} from '../types/automation-enhanced';

// Updated Nov 16, 2025: Configurable timeouts
const AUTOMATION_ENHANCED_TIMEOUT_MS = 30000; // 30 seconds default
const AUTOMATION_EXECUTE_TIMEOUT_MS = 120000; // 2 minutes for script execution

// Updated Nov 16, 2025: Maximum recursion depth to prevent stack overflow
const MAX_RECURSION_DEPTH = 100;

// Updated Nov 16, 2025: Wrapper for invoke with timeout and error handling
async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = AUTOMATION_ENHANCED_TIMEOUT_MS,
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

// Updated Nov 16, 2025: Input validation helper
function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

// Updated Nov 16, 2025: Validate coordinates
function validateCoordinates(x: number | undefined, y: number | undefined): void {
  if (x !== undefined && (x < 0 || !Number.isFinite(x))) {
    throw new Error(`Invalid x coordinate: ${x}`);
  }
  if (y !== undefined && (y < 0 || !Number.isFinite(y))) {
    throw new Error(`Invalid y coordinate: ${y}`);
  }
}

// ============================================================================
// Type Conversions (snake_case ↔ camelCase)
// ============================================================================

// Updated Nov 16, 2025: Fixed optional chaining issue
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (match, letter) => {
    return letter ? letter.toUpperCase() : match;
  });
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Updated Nov 16, 2025: Added stack overflow protection with depth tracking
function convertKeysToCamelCase(obj: unknown, depth = 0): unknown {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(
      `Maximum recursion depth exceeded (${MAX_RECURSION_DEPTH}) during camelCase conversion`,
    );
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeysToCamelCase(item, depth + 1));
  } else if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertKeysToCamelCase((obj as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }
  return obj;
}

// Updated Nov 16, 2025: Added stack overflow protection with depth tracking
function convertKeysToSnakeCase(obj: unknown, depth = 0): unknown {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(
      `Maximum recursion depth exceeded (${MAX_RECURSION_DEPTH}) during snake_case conversion`,
    );
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeysToSnakeCase(item, depth + 1));
  } else if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const snakeKey = toSnakeCase(key);
      result[snakeKey] = convertKeysToSnakeCase((obj as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }
  return obj;
}

// ============================================================================
// Recorder API
// ============================================================================

// Updated Nov 16, 2025: Added error handling and timeout
export async function startRecording(): Promise<RecordingSession> {
  try {
    const result = await invokeWithTimeout<unknown>('automation_record_start');
    return convertKeysToCamelCase(result) as RecordingSession;
  } catch (error) {
    throw new Error(`Failed to start recording: ${error}`);
  }
}

// Updated Nov 16, 2025: Added error handling and timeout
export async function stopRecording(): Promise<Recording> {
  try {
    const result = await invokeWithTimeout<unknown>('automation_record_stop');
    return convertKeysToCamelCase(result) as Recording;
  } catch (error) {
    throw new Error(`Failed to stop recording: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation and error handling
export async function recordClick(x: number, y: number, button: string = 'left'): Promise<void> {
  try {
    validateCoordinates(x, y);
    if (!['left', 'right', 'middle'].includes(button)) {
      throw new Error(`Invalid button: ${button}. Must be 'left', 'right', or 'middle'`);
    }
    await invokeWithTimeout<void>('automation_record_action_click', { x, y, button });
  } catch (error) {
    throw new Error(`Failed to record click at (${x}, ${y}): ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation and error handling
export async function recordType(text: string, x: number, y: number): Promise<void> {
  try {
    if (text === undefined || text === null) {
      throw new Error('text cannot be null or undefined');
    }
    validateCoordinates(x, y);
    await invokeWithTimeout<void>('automation_record_action_type', { text, x, y });
  } catch (error) {
    throw new Error(`Failed to record typing: ${error}`);
  }
}

// Updated Nov 16, 2025: Added error handling
export async function recordScreenshot(): Promise<void> {
  try {
    await invokeWithTimeout<void>('automation_record_action_screenshot');
  } catch (error) {
    throw new Error(`Failed to record screenshot: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation and error handling
export async function recordWait(durationMs: number): Promise<void> {
  try {
    if (!Number.isInteger(durationMs) || durationMs < 0) {
      throw new Error(`Invalid duration: ${durationMs}`);
    }
    await invokeWithTimeout<void>('automation_record_action_wait', { duration_ms: durationMs });
  } catch (error) {
    throw new Error(`Failed to record wait: ${error}`);
  }
}

// Updated Nov 16, 2025: Added error handling
export async function isRecording(): Promise<boolean> {
  try {
    return await invokeWithTimeout<boolean>('automation_record_is_recording');
  } catch (error) {
    throw new Error(`Failed to check recording status: ${error}`);
  }
}

// Updated Nov 16, 2025: Added error handling and safe type conversion
export async function getRecordingSession(): Promise<RecordingSession | null> {
  try {
    const result = await invokeWithTimeout<unknown>('automation_record_get_session');
    return result ? (convertKeysToCamelCase(result) as RecordingSession) : null;
  } catch (error) {
    throw new Error(`Failed to get recording session: ${error}`);
  }
}

// ============================================================================
// Inspector API
// ============================================================================

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function inspectElementAtPoint(x: number, y: number): Promise<DetailedElementInfo> {
  try {
    validateCoordinates(x, y);
    const result = await invokeWithTimeout<unknown>('automation_inspect_element_at_point', {
      x,
      y,
    });
    return convertKeysToCamelCase(result) as DetailedElementInfo;
  } catch (error) {
    throw new Error(`Failed to inspect element at (${x}, ${y}): ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function inspectElementById(elementId: string): Promise<DetailedElementInfo> {
  try {
    validateNonEmpty(elementId, 'elementId');
    const result = await invokeWithTimeout<unknown>('automation_inspect_element_by_id', {
      element_id: elementId,
    });
    return convertKeysToCamelCase(result) as DetailedElementInfo;
  } catch (error) {
    throw new Error(`Failed to inspect element ${elementId}: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function findElementBySelector(selector: ElementSelector): Promise<string | null> {
  try {
    if (!selector || typeof selector !== 'object') {
      throw new Error('selector must be a valid ElementSelector object');
    }
    const snakeSelector = convertKeysToSnakeCase(selector);
    return await invokeWithTimeout<string | null>('automation_find_element_by_selector', {
      selector: snakeSelector,
    });
  } catch (error) {
    throw new Error(`Failed to find element by selector: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function generateSelector(elementId: string): Promise<ElementSelector[]> {
  try {
    validateNonEmpty(elementId, 'elementId');
    const result = await invokeWithTimeout<unknown[]>('automation_generate_selector', {
      element_id: elementId,
    });
    return result.map((item) => convertKeysToCamelCase(item) as ElementSelector);
  } catch (error) {
    throw new Error(`Failed to generate selector for element ${elementId}: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function getElementTree(elementId: string): Promise<{
  parent: unknown | null;
  children: unknown[];
}> {
  try {
    validateNonEmpty(elementId, 'elementId');
    const result = await invokeWithTimeout<[unknown | null, unknown[]]>(
      'automation_get_element_tree',
      { element_id: elementId },
    );
    return {
      parent: result[0] ? convertKeysToCamelCase(result[0]) : null,
      children: result[1].map((item) => convertKeysToCamelCase(item)),
    };
  } catch (error) {
    throw new Error(`Failed to get element tree for ${elementId}: ${error}`);
  }
}

// ============================================================================
// Executor API
// ============================================================================

// Updated Nov 16, 2025: Added validation, error handling, extended timeout, and safe type conversion
export async function executeScript(script: AutomationScript): Promise<ExecutionResult> {
  try {
    if (!script || typeof script !== 'object') {
      throw new Error('script must be a valid AutomationScript object');
    }
    const snakeScript = convertKeysToSnakeCase(script);
    const result = await invokeWithTimeout<unknown>(
      'automation_execute_script',
      { script: snakeScript },
      AUTOMATION_EXECUTE_TIMEOUT_MS,
    );
    return convertKeysToCamelCase(result) as ExecutionResult;
  } catch (error) {
    throw new Error(`Failed to execute script: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function saveScript(script: AutomationScript): Promise<void> {
  try {
    if (!script || typeof script !== 'object') {
      throw new Error('script must be a valid AutomationScript object');
    }
    const snakeScript = convertKeysToSnakeCase(script);
    await invokeWithTimeout<void>('automation_save_script', { script: snakeScript });
  } catch (error) {
    throw new Error(`Failed to save script: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function loadScript(scriptId: string): Promise<AutomationScript> {
  try {
    validateNonEmpty(scriptId, 'scriptId');
    const result = await invokeWithTimeout<unknown>('automation_load_script', {
      script_id: scriptId,
    });
    return convertKeysToCamelCase(result) as AutomationScript;
  } catch (error) {
    throw new Error(`Failed to load script ${scriptId}: ${error}`);
  }
}

// Updated Nov 16, 2025: Added error handling and safe type conversion
export async function listScripts(): Promise<AutomationScript[]> {
  try {
    const result = await invokeWithTimeout<unknown[]>('automation_list_scripts');
    return result.map((item) => convertKeysToCamelCase(item) as AutomationScript);
  } catch (error) {
    throw new Error(`Failed to list scripts: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation and error handling
export async function deleteScript(scriptId: string): Promise<void> {
  try {
    validateNonEmpty(scriptId, 'scriptId');
    await invokeWithTimeout<void>('automation_delete_script', { script_id: scriptId });
  } catch (error) {
    throw new Error(`Failed to delete script ${scriptId}: ${error}`);
  }
}

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function saveRecordingAsScript(
  recording: Recording,
  name: string,
  description: string,
  tags: string[],
): Promise<AutomationScript> {
  try {
    if (!recording || typeof recording !== 'object') {
      throw new Error('recording must be a valid Recording object');
    }
    validateNonEmpty(name, 'name');
    validateNonEmpty(description, 'description');
    if (!Array.isArray(tags)) {
      throw new Error('tags must be an array');
    }
    const snakeRecording = convertKeysToSnakeCase(recording);
    const result = await invokeWithTimeout<unknown>('automation_save_recording_as_script', {
      recording: snakeRecording,
      name,
      description,
      tags,
    });
    return convertKeysToCamelCase(result) as AutomationScript;
  } catch (error) {
    throw new Error(`Failed to save recording as script: ${error}`);
  }
}

// ============================================================================
// Code Generation API
// ============================================================================

// Updated Nov 16, 2025: Added validation, error handling, and safe type conversion
export async function generateCode(
  script: AutomationScript,
  language: CodeLanguage,
): Promise<GeneratedCode> {
  try {
    if (!script || typeof script !== 'object') {
      throw new Error('script must be a valid AutomationScript object');
    }
    validateNonEmpty(language, 'language');

    // Validate language is one of the supported types
    const validLanguages = ['python', 'javascript', 'typescript', 'csharp', 'java'];
    const normalizedLanguage = language.toLowerCase();
    if (!validLanguages.includes(normalizedLanguage)) {
      throw new Error(
        `Invalid language: ${language}. Must be one of: ${validLanguages.join(', ')}`,
      );
    }

    const snakeScript = convertKeysToSnakeCase(script);
    const result = await invokeWithTimeout<unknown>(
      'automation_generate_code',
      {
        script: snakeScript,
        language: normalizedLanguage,
      },
      AUTOMATION_EXECUTE_TIMEOUT_MS,
    );
    return convertKeysToCamelCase(result) as GeneratedCode;
  } catch (error) {
    throw new Error(`Failed to generate code for language ${language}: ${error}`);
  }
}
