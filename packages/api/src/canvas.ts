/**
 * Canvas & Design API — typed wrappers for canvas_* and design_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Canvas {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: CanvasElement[];
}
export interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}
export interface A2UICommand {
  action: string;
  target?: string;
  params?: Record<string, unknown>;
}
export interface A2UIResponse {
  success: boolean;
  result?: unknown;
}
export interface DesignRequest {
  description: string;
  targetElement?: string;
  framework?: string;
}
export interface DesignResponse {
  css: string;
  explanation?: string;
}
export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}
export interface DesignSuggestion {
  description: string;
  css: string;
  priority: string;
}
export interface DesignTokens {
  colors?: Record<string, string>;
  spacing?: Record<string, string>;
  typography?: Record<string, string>;
}
export interface AccessibilityReport {
  issues: { element: string; issue: string; severity: string }[];
  score: number;
}

// ---- Canvas ----

export async function canvasCreate(name: string, width: number, height: number): Promise<string> {
  return command<string>('canvas_create', { name, width, height });
}
export async function canvasGet(id: string): Promise<Canvas | null> {
  return command<Canvas | null>('canvas_get', { id });
}
export async function canvasList(): Promise<[string, string][]> {
  return command<[string, string][]>('canvas_list');
}
export async function canvasDestroy(id: string): Promise<boolean> {
  return command<boolean>('canvas_destroy', { id });
}
export async function canvasSetActive(id?: string): Promise<void> {
  return command<void>('canvas_set_active', { id });
}
export async function canvasGetActive(): Promise<string | null> {
  return command<string | null>('canvas_get_active');
}
export async function canvasAddElement(canvasId: string, element: CanvasElement): Promise<void> {
  return command<void>('canvas_add_element', { canvasId, element });
}
export async function canvasRemoveElement(canvasId: string, elementId: string): Promise<boolean> {
  return command<boolean>('canvas_remove_element', { canvasId, elementId });
}
export async function canvasUpdateElement(
  canvasId: string,
  elementId: string,
  updates: unknown,
): Promise<boolean> {
  return command<boolean>('canvas_update_element', { canvasId, elementId, updates });
}
export async function canvasClear(canvasId: string): Promise<void> {
  return command<void>('canvas_clear', { canvasId });
}
export async function canvasExport(canvasId: string): Promise<string> {
  return command<string>('canvas_export', { canvasId });
}
export async function canvasA2uiExecute(cmd: A2UICommand): Promise<A2UIResponse> {
  return command<A2UIResponse>('canvas_a2ui_execute', { command: cmd });
}
export async function canvasAddText(
  canvasId: string,
  text: string,
  x: number,
  y: number,
  width?: number,
  style?: unknown,
): Promise<string> {
  return command<string>('canvas_add_text', { canvasId, text, x, y, width, style });
}

// ---- Design ----

export async function designGenerateCss(request: DesignRequest): Promise<DesignResponse> {
  return command<DesignResponse>('design_generate_css', { request });
}
export async function designApplyCss(selector: string, css: string): Promise<string> {
  return command<string>('design_apply_css', { selector, css });
}
export async function designGetElementStyles(selector: string): Promise<string> {
  return command<string>('design_get_element_styles', { selector });
}
export async function designGenerateColorScheme(
  baseColor: string,
  theme: string,
): Promise<ColorScheme> {
  return command<ColorScheme>('design_generate_color_scheme', { baseColor, theme });
}
export async function designSuggestImprovements(
  currentCss: string,
  goals: string[],
): Promise<DesignSuggestion[]> {
  return command<DesignSuggestion[]>('design_suggest_improvements', { currentCss, goals });
}
export async function designTokensToCss(tokens: DesignTokens): Promise<string> {
  return command<string>('design_tokens_to_css', { tokens });
}
export async function designCheckAccessibility(css: string): Promise<AccessibilityReport> {
  return command<AccessibilityReport>('design_check_accessibility', { css });
}
