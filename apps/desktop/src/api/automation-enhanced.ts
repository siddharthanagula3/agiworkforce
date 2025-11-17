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

// ============================================================================
// Type Conversions (snake_case ↔ camelCase)
// ============================================================================

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1]?.toUpperCase() ?? g);
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function convertKeysToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertKeysToCamelCase(obj[key]);
      return result;
    }, {} as Record<string, any>); // Updated Nov 16, 2025: Improved type safety
  }
  return obj;
}

function convertKeysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToSnakeCase);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = toSnakeCase(key);
      result[snakeKey] = convertKeysToSnakeCase(obj[key]);
      return result;
    }, {} as Record<string, any>); // Updated Nov 16, 2025: Improved type safety
  }
  return obj;
}

// ============================================================================
// Recorder API
// ============================================================================

export async function startRecording(): Promise<RecordingSession> {
  const result = await invoke<any>('automation_record_start');
  return convertKeysToCamelCase(result);
}

export async function stopRecording(): Promise<Recording> {
  const result = await invoke<any>('automation_record_stop');
  return convertKeysToCamelCase(result);
}

export async function recordClick(x: number, y: number, button: string = 'left'): Promise<void> {
  await invoke('automation_record_action_click', { x, y, button });
}

export async function recordType(text: string, x: number, y: number): Promise<void> {
  await invoke('automation_record_action_type', { text, x, y });
}

export async function recordScreenshot(): Promise<void> {
  await invoke('automation_record_action_screenshot');
}

export async function recordWait(durationMs: number): Promise<void> {
  await invoke('automation_record_action_wait', { duration_ms: durationMs });
}

export async function isRecording(): Promise<boolean> {
  return invoke<boolean>('automation_record_is_recording');
}

export async function getRecordingSession(): Promise<RecordingSession | null> {
  const result = await invoke<any>('automation_record_get_session');
  return result ? convertKeysToCamelCase(result) : null;
}

// ============================================================================
// Inspector API
// ============================================================================

export async function inspectElementAtPoint(x: number, y: number): Promise<DetailedElementInfo> {
  const result = await invoke<any>('automation_inspect_element_at_point', { x, y });
  return convertKeysToCamelCase(result);
}

export async function inspectElementById(elementId: string): Promise<DetailedElementInfo> {
  const result = await invoke<any>('automation_inspect_element_by_id', { element_id: elementId });
  return convertKeysToCamelCase(result);
}

export async function findElementBySelector(selector: ElementSelector): Promise<string | null> {
  const snakeSelector = convertKeysToSnakeCase(selector);
  return invoke<string | null>('automation_find_element_by_selector', { selector: snakeSelector });
}

export async function generateSelector(elementId: string): Promise<ElementSelector[]> {
  const result = await invoke<any[]>('automation_generate_selector', { element_id: elementId });
  return result.map(convertKeysToCamelCase);
}

export async function getElementTree(
  elementId: string,
): Promise<{
  parent: any | null;
  children: any[];
}> {
  const result = await invoke<[any | null, any[]]>('automation_get_element_tree', {
    element_id: elementId,
  });
  return {
    parent: result[0] ? convertKeysToCamelCase(result[0]) : null,
    children: result[1].map(convertKeysToCamelCase),
  };
}

// ============================================================================
// Executor API
// ============================================================================

export async function executeScript(script: AutomationScript): Promise<ExecutionResult> {
  const snakeScript = convertKeysToSnakeCase(script);
  const result = await invoke<any>('automation_execute_script', { script: snakeScript });
  return convertKeysToCamelCase(result);
}

export async function saveScript(script: AutomationScript): Promise<void> {
  const snakeScript = convertKeysToSnakeCase(script);
  await invoke('automation_save_script', { script: snakeScript });
}

export async function loadScript(scriptId: string): Promise<AutomationScript> {
  const result = await invoke<any>('automation_load_script', { script_id: scriptId });
  return convertKeysToCamelCase(result);
}

export async function listScripts(): Promise<AutomationScript[]> {
  const result = await invoke<any[]>('automation_list_scripts');
  return result.map(convertKeysToCamelCase);
}

export async function deleteScript(scriptId: string): Promise<void> {
  await invoke('automation_delete_script', { script_id: scriptId });
}

export async function saveRecordingAsScript(
  recording: Recording,
  name: string,
  description: string,
  tags: string[],
): Promise<AutomationScript> {
  const snakeRecording = convertKeysToSnakeCase(recording);
  const result = await invoke<any>('automation_save_recording_as_script', {
    recording: snakeRecording,
    name,
    description,
    tags,
  });
  return convertKeysToCamelCase(result);
}

// ============================================================================
// Code Generation API
// ============================================================================

export async function generateCode(
  script: AutomationScript,
  language: CodeLanguage,
): Promise<GeneratedCode> {
  const snakeScript = convertKeysToSnakeCase(script);
  const result = await invoke<any>('automation_generate_code', {
    script: snakeScript,
    language: language.toLowerCase(),
  });
  return convertKeysToCamelCase(result);
}
