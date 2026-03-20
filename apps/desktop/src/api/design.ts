/**
 * Design API
 *
 * TypeScript bindings for the AI-powered CSS design assistant.
 * Wraps the Rust design commands: generate_css, apply_css, get_element_styles,
 * generate_color_scheme, suggest_improvements, tokens_to_css, check_accessibility.
 */

import { invoke } from '../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Types (mirror Rust structs — field names are camelCase for IPC)
// ---------------------------------------------------------------------------

export interface DesignContext {
  currentStyles?: string;
  elementType?: string;
  parentStyles?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface DesignConstraints {
  colorScheme?: string;
  maxWidth?: number;
  responsive: boolean;
  accessibility: boolean;
}

export interface DesignRequest {
  description: string;
  selector?: string;
  context?: DesignContext;
  constraints?: DesignConstraints;
}

export interface DesignResponse {
  css: string;
  explanation: string;
  previewHtml?: string;
  accessibilityNotes?: string;
}

export interface ColorScheme {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
}

export interface DesignSuggestion {
  title: string;
  description: string;
  css: string;
  impact: string;
}

export interface DesignTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, string>;
  shadows: Record<string, string>;
  radii: Record<string, string>;
}

export interface AccessibilityIssue {
  severity: string;
  description: string;
  suggestion: string;
  wcagCriterion: string;
}

export interface AccessibilityReport {
  score: number;
  level: string;
  issues: AccessibilityIssue[];
  passedChecks: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Generate CSS from a natural-language description using an LLM.
 *
 * @example
 * ```ts
 * const result = await generateCss({
 *   description: 'A modern card with rounded corners and a subtle shadow',
 *   selector: '.card',
 *   constraints: { responsive: true, accessibility: true },
 * });
 * console.log(result.css);
 * ```
 */
export async function generateCss(request: DesignRequest): Promise<DesignResponse> {
  return invoke<DesignResponse>('design_generate_css', { request });
}

/**
 * Apply CSS to a selector (returns an instruction string for the frontend to act on).
 */
export async function applyCss(selector: string, css: string): Promise<string> {
  return invoke<string>('design_apply_css', { selector, css });
}

/**
 * Get the computed styles for a given CSS selector.
 */
export async function getElementStyles(selector: string): Promise<string> {
  return invoke<string>('design_get_element_styles', { selector });
}

/**
 * Generate a full color scheme from a base color and theme name.
 *
 * @param baseColor - A CSS hex color, e.g. "#3B82F6"
 * @param theme - Theme style, e.g. "dark", "light", "warm"
 */
export async function generateColorScheme(
  baseColor: string,
  theme: string,
): Promise<ColorScheme> {
  return invoke<ColorScheme>('design_generate_color_scheme', { baseColor, theme });
}

/**
 * Suggest improvements for existing CSS, guided by a list of goals.
 *
 * @param currentCss - The CSS to analyze
 * @param goals - e.g. ["improve readability", "add dark mode support"]
 */
export async function suggestImprovements(
  currentCss: string,
  goals: string[],
): Promise<DesignSuggestion[]> {
  return invoke<DesignSuggestion[]>('design_suggest_improvements', { currentCss, goals });
}

/**
 * Convert a design-tokens object to a CSS custom-properties stylesheet.
 */
export async function designTokensToCss(tokens: DesignTokens): Promise<string> {
  return invoke<string>('design_tokens_to_css', { tokens });
}

/**
 * Check CSS for WCAG accessibility issues.
 * Returns a report with a score, issue list, and passed checks.
 */
export async function checkAccessibility(css: string): Promise<AccessibilityReport> {
  return invoke<AccessibilityReport>('design_check_accessibility', { css });
}
