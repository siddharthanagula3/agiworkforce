/**
 * Code Context Extractor
 * Extracts relevant context from Monaco editor for code completion
 */

import * as monaco from 'monaco-editor';
import type { CodeContext } from './completionProvider';

/**
 * Extract code context around cursor position
 * Optimized for sub-50ms extraction time
 */
export function extractCodeContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): CodeContext {
  const fullText = model.getValue();
  const offset = model.getOffsetAt(position);

  // Get text before and after cursor
  const beforeCursor = fullText.slice(0, offset);
  const afterCursor = fullText.slice(offset);

  // Extract imports (top of file, max 50 lines)
  const imports = extractImports(fullText);

  // Find current function/method context
  const currentFunction = extractCurrentFunction(beforeCursor);

  // Extract nearby variables (previous 20 lines)
  const nearbyVariables = extractNearbyVariables(beforeCursor);

  return {
    beforeCursor,
    afterCursor,
    imports,
    language: model.getLanguageId(),
    fileName: getFileNameFromUri(model.uri),
    currentFunction,
    nearbyVariables,
  };
}

/**
 * Extract import statements from file
 */
function extractImports(text: string): string[] {
  const imports: string[] = [];
  const lines = text.split('\n').slice(0, 50); // Check first 50 lines

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('from ') ||
      trimmed.startsWith('use ') ||
      trimmed.startsWith('#include')
    ) {
      imports.push(trimmed);
    }
  }

  return imports;
}

/**
 * Find the current function/method being edited
 */
function extractCurrentFunction(beforeCursor: string): string | undefined {
  const lines = beforeCursor.split('\n').reverse();

  // Look for function declaration patterns
  const patterns = [
    /function\s+(\w+)/,
    /const\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    /(\w+)\s*\([^)]*\)\s*{/,
    /fn\s+(\w+)/,
    /def\s+(\w+)/,
    /func\s+(\w+)/,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }
  }

  return undefined;
}

/**
 * Extract variable names from nearby code
 */
function extractNearbyVariables(beforeCursor: string): string[] {
  const lines = beforeCursor.split('\n').slice(-20); // Last 20 lines
  const variables = new Set<string>();

  const patterns = [
    /const\s+(\w+)/g,
    /let\s+(\w+)/g,
    /var\s+(\w+)/g,
    /(\w+)\s*:/g, // Object properties
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 1) {
          variables.add(match[1]);
        }
      }
    }
  }

  return Array.from(variables);
}

/**
 * Extract filename from Monaco URI
 */
function getFileNameFromUri(uri: monaco.Uri): string {
  const path = uri.path;
  const parts = path.split('/');
  return parts[parts.length - 1] || 'untitled';
}

/**
 * Estimate token count for context (rough approximation)
 * Target: Keep under 2000 tokens for fast completions
 */
export function estimateTokenCount(context: CodeContext): number {
  const totalChars =
    context.beforeCursor.length +
    context.afterCursor.length +
    context.imports.join('').length;

  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(totalChars / 4);
}
