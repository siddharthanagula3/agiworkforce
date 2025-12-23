import * as monaco from 'monaco-editor';
import type { CodeContext } from './completionProvider';

export function extractCodeContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): CodeContext {
  const fullText = model.getValue();
  const offset = model.getOffsetAt(position);

  const beforeCursor = fullText.slice(0, offset);
  const afterCursor = fullText.slice(offset);

  const imports = extractImports(fullText);

  const currentFunction = extractCurrentFunction(beforeCursor);

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

function extractImports(text: string): string[] {
  const imports: string[] = [];
  const lines = text.split('\n').slice(0, 50);

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

function extractCurrentFunction(beforeCursor: string): string | undefined {
  const lines = beforeCursor.split('\n').reverse();

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

function extractNearbyVariables(beforeCursor: string): string[] {
  const lines = beforeCursor.split('\n').slice(-20);
  const variables = new Set<string>();

  const patterns = [/const\s+(\w+)/g, /let\s+(\w+)/g, /var\s+(\w+)/g, /(\w+)\s*:/g];

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

function getFileNameFromUri(uri: monaco.Uri): string {
  const path = uri.path;
  const parts = path.split('/');
  return parts[parts.length - 1] || 'untitled';
}

export function estimateTokenCount(context: CodeContext): number {
  const totalChars =
    context.beforeCursor.length + context.afterCursor.length + context.imports.join('').length;

  return Math.ceil(totalChars / 4);
}
