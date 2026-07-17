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

/**
 * Supported types of context items.
 *
 * Each type represents a different source of information:
 * - `file`: Local file from the filesystem
 * - `folder`: Directory containing multiple files
 * - `url`: Web page content
 * - `web`: Web search results
 * - `image`: Image file with optional OCR text
 * - `code-snippet`: Code excerpt with line numbers
 * - `selection`: Text selection from an editor
 * - `clipboard`: Content from system clipboard
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

/**
 * Base properties shared by all context item types.
 *
 * Extended by specific context item types to add type-specific fields.
 */
export interface BaseContextItem {
  /** Unique identifier for this context item */
  id: string;
  /** Discriminant for the context item type */
  type: ContextItemType;
  /** Display name for the item */
  name: string;
  /** Optional description or summary */
  description?: string;
  /** Estimated token count for LLM context window */
  tokens?: number;
  /** When the context item was created */
  timestamp: Date;
  /** Optional icon identifier (e.g., emoji, icon name) */
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
  /** Absolute path to the file */
  path: string;
  /** File content as text */
  content?: string;
  /** Language identifier (e.g., 'typescript', 'python', 'markdown') */
  language?: string;
  /** File size in bytes */
  size?: number;
  /** Number of lines in the file */
  lineCount?: number;
  /** Short excerpt for preview (first few lines) */
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
  /** Absolute path to the folder */
  path: string;
  /** Number of files contained in the folder */
  fileCount?: number;
  /** Total size in bytes */
  size?: number;
  /** List of file names (not full paths) */
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
  /** The URL of the web page */
  url: string;
  /** Page title from <title> tag */
  title?: string;
  /** URL to the site's favicon */
  favicon?: string;
  /** Extracted page content (typically main text) */
  content?: string;
  /** Additional metadata extracted from the page */
  metadata?: {
    /** Site name from Open Graph tags */
    siteName?: string;
    /** Author from meta tags */
    author?: string;
    /** Publication date from meta tags */
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
  /** The search query that was executed */
  query: string;
  /** Array of search results */
  results?: Array<{
    /** Result title */
    title: string;
    /** Result URL */
    url: string;
    /** Text snippet/preview */
    snippet: string;
    /** Source domain (e.g., 'stackoverflow.com') */
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
  /** File path if loaded from disk */
  path?: string;
  /** URL if loaded from web */
  url?: string;
  /** Base64-encoded data URL for inline images */
  dataUrl?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Image format (e.g., 'png', 'jpeg', 'webp') */
  format?: string;
  /** File size in bytes */
  size?: number;
  /** Text extracted via OCR (Optical Character Recognition) */
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
  /** The code content */
  code: string;
  /** Programming language identifier */
  language: string;
  /** Optional source file path */
  filePath?: string;
  /** Starting line number in the source file */
  startLine?: number;
  /** Ending line number in the source file */
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
  /** Selected text content */
  content?: string;
  /** Path to the file containing the selection */
  path?: string;
  /** Size of the selection in bytes */
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
  /** Clipboard text content */
  content?: string;
  /** Optional path if clipboard contains a file reference */
  path?: string;
  /** Size of the content in bytes */
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
  /** Type of context item to create */
  type: ContextItemType;
  /** Display name for the item */
  name: string;
  /** Optional description */
  description?: string;
  /** Additional type-specific properties */
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
  /** Unique identifier */
  id: string;
  /** Type of context item */
  type: ContextItemType;
  /** Display label for the suggestion */
  label: string;
  /** Value to use when selected (e.g., file path, URL) */
  value: string;
  /** Optional description text */
  description?: string;
  /** Icon to display (emoji or icon identifier) */
  icon?: string;
  /** Relevance score (0-1) for ranking */
  score?: number;
  /** Additional metadata for the suggestion */
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
  /** Whether the autocomplete dropdown is visible */
  active: boolean;
  /** The trigger character that activated autocomplete (e.g., '@', '#') */
  trigger: string;
  /** Current search query after the trigger */
  query: string;
  /** List of matching suggestions */
  suggestions: ContextSuggestion[];
  /** Index of the currently selected suggestion (-1 if none) */
  selectedIndex: number;
  /** Optional position for absolutely positioned dropdown */
  position?: {
    /** Top position in pixels */
    top: number;
    /** Left position in pixels */
    left: number;
  };
}
