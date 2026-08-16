/**
 * Context Item Types
 *
 * Types for representing various forms of context that can be added to AI conversations.
 * Context items enrich prompts with files, URLs, images, code snippets, and more.
 *
 * @module context
 * @packageDocumentation
 *
 * @example Adding file context:
 * ```typescript
 * const fileContext: FileContextItem = {
 *   id: 'file-1',
 *   type: 'file',
 *   name: 'app.tsx',
 *   path: '/src/app.tsx',
 *   content: 'import React from "react";...',
 *   language: 'typescript',
 *   tokens: 1250,
 *   timestamp: new Date()
 * };
 * ```
 */

export type ContextItemType =
  | 'file'
  | 'folder'
  | 'url'
  | 'web'
  | 'image'
  | 'code-snippet'
  | 'selection'
  | 'clipboard';

export interface BaseContextItem {
  id: string;
  type: ContextItemType;
  name: string;
  description?: string;
  tokens?: number;
  timestamp: Date;
  icon?: string;
}

/**
 * Context item representing a file from the filesystem.
 *
 * @example
 * ```typescript
 * const file: FileContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'file',
 *   name: 'package.json',
 *   path: '/Users/dev/project/package.json',
 *   content: '{"name": "my-app", ...}',
 *   language: 'json',
 *   size: 2048,
 *   lineCount: 42,
 *   timestamp: new Date()
 * };
 * ```
 */
export interface FileContextItem extends BaseContextItem {
  type: 'file';
  path: string;
  content?: string;
  language?: string;
  size?: number;
  lineCount?: number;
  excerpt?: string;
}

/**
 * Context item representing a folder/directory.
 *
 * @example
 * ```typescript
 * const folder: FolderContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'folder',
 *   name: 'src',
 *   path: '/Users/dev/project/src',
 *   fileCount: 125,
 *   size: 524288,
 *   files: ['app.tsx', 'index.ts', 'utils.ts'],
 *   timestamp: new Date()
 * };
 * ```
 */
export interface FolderContextItem extends BaseContextItem {
  type: 'folder';
  path: string;
  fileCount?: number;
  size?: number;
  files?: string[];
}

/**
 * Context item representing web content from a URL.
 *
 * @example
 * ```typescript
 * const urlContext: UrlContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'url',
 *   name: 'React Documentation',
 *   url: 'https://react.dev/learn',
 *   title: 'Learn React',
 *   favicon: 'https://react.dev/favicon.ico',
 *   content: 'React is a JavaScript library...',
 *   metadata: {
 *     siteName: 'React',
 *     author: 'Meta',
 *     publishedDate: '2023-01-01'
 *   },
 *   timestamp: new Date()
 * };
 * ```
 */
export interface UrlContextItem extends BaseContextItem {
  type: 'url';
  url: string;
  title?: string;
  favicon?: string;
  content?: string;
  metadata?: {
    siteName?: string;
    author?: string;
    publishedDate?: string;
  };
}

/**
 * Context item representing web search results.
 *
 * @example
 * ```typescript
 * const webSearch: WebContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'web',
 *   name: 'Search: React hooks',
 *   query: 'React hooks best practices',
 *   results: [
 *     {
 *       title: 'Rules of Hooks',
 *       url: 'https://react.dev/reference/rules/rules-of-hooks',
 *       snippet: 'Only call Hooks at the top level...',
 *       source: 'react.dev'
 *     }
 *   ],
 *   timestamp: new Date()
 * };
 * ```
 */
export interface WebContextItem extends BaseContextItem {
  type: 'web';
  query: string;
  results?: Array<{
    title: string;
    url: string;
    snippet: string;
    source?: string;
  }>;
}

/**
 * Context item representing an image file.
 *
 * @example
 * ```typescript
 * const image: ImageContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'image',
 *   name: 'screenshot.png',
 *   path: '/Users/dev/screenshots/screenshot.png',
 *   width: 1920,
 *   height: 1080,
 *   format: 'png',
 *   size: 245760,
 *   ocrText: 'Welcome to the app',
 *   timestamp: new Date()
 * };
 * ```
 */
export interface ImageContextItem extends BaseContextItem {
  type: 'image';
  path?: string;
  url?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  ocrText?: string;
}

/**
 * Context item representing a code snippet or excerpt.
 *
 * @example
 * ```typescript
 * const snippet: CodeSnippetContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'code-snippet',
 *   name: 'useState hook',
 *   code: 'const [count, setCount] = useState(0);',
 *   language: 'typescript',
 *   filePath: '/src/Counter.tsx',
 *   startLine: 5,
 *   endLine: 5,
 *   timestamp: new Date()
 * };
 * ```
 */
export interface CodeSnippetContextItem extends BaseContextItem {
  type: 'code-snippet';
  code: string;
  language: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Context item representing selected text from an editor.
 *
 * @example
 * ```typescript
 * const selection: SelectionContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'selection',
 *   name: 'Selected text',
 *   content: 'function handleClick() { ... }',
 *   path: '/src/Button.tsx',
 *   size: 128,
 *   timestamp: new Date()
 * };
 * ```
 */
export interface SelectionContextItem extends BaseContextItem {
  type: 'selection';
  content?: string;
  path?: string;
  size?: number;
}

/**
 * Context item representing clipboard content.
 *
 * @example
 * ```typescript
 * const clipboard: ClipboardContextItem = {
 *   id: crypto.randomUUID(),
 *   type: 'clipboard',
 *   name: 'Clipboard',
 *   content: 'npm install @agiworkforce/types',
 *   size: 35,
 *   timestamp: new Date()
 * };
 * ```
 */
export interface ClipboardContextItem extends BaseContextItem {
  type: 'clipboard';
  content?: string;
  path?: string;
  size?: number;
}

/**
 * Union type of all context item types.
 *
 * This is a discriminated union keyed by the `type` field, enabling
 * type-safe narrowing in TypeScript.
 *
 * @example Type narrowing:
 * ```typescript
 * function processContext(item: ContextItem) {
 *   switch (item.type) {
 *     case 'file':
 *       // TypeScript knows item is FileContextItem
 *       console.log('File path:', item.path);
 *       break;
 *     case 'image':
 *       // TypeScript knows item is ImageContextItem
 *       console.log('Image dimensions:', item.width, 'x', item.height);
 *       break;
 *     // ... handle other types
 *   }
 * }
 * ```
 */
export type ContextItem =
  | FileContextItem
  | FolderContextItem
  | UrlContextItem
  | WebContextItem
  | ImageContextItem
  | CodeSnippetContextItem
  | SelectionContextItem
  | ClipboardContextItem;

/**
 * Options for creating a new context item.
 *
 * Used by context item factories that dynamically create items based on type.
 *
 * @example
 * ```typescript
 * const options: CreateContextItemOptions = {
 *   type: 'file',
 *   name: 'app.tsx',
 *   path: '/src/app.tsx',
 *   language: 'typescript'
 * };
 * ```
 */
export interface CreateContextItemOptions {
  type: ContextItemType;
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Autocomplete suggestion for context items.
 *
 * Used in UI components that provide typeahead/autocomplete for adding context.
 *
 * @example
 * ```typescript
 * const suggestion: ContextSuggestion = {
 *   id: 'file-1',
 *   type: 'file',
 *   label: 'app.tsx',
 *   value: '/src/app.tsx',
 *   description: 'Main application component',
 *   icon: '📄',
 *   score: 0.95,
 *   metadata: { language: 'typescript' }
 * };
 * ```
 */
export interface ContextSuggestion {
  id: string;
  type: ContextItemType;
  label: string;
  value: string;
  description?: string;
  icon?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

/**
 * State of the autocomplete UI component.
 *
 * Tracks active state, current query, suggestions, and keyboard navigation.
 *
 * @example
 * ```typescript
 * const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
 *   active: false,
 *   trigger: '@',
 *   query: '',
 *   suggestions: [],
 *   selectedIndex: -1
 * });
 * ```
 */
export interface AutocompleteState {
  active: boolean;
  trigger: string;
  query: string;
  suggestions: ContextSuggestion[];
  selectedIndex: number;
  position?: {
    top: number;
    left: number;
  };
}
