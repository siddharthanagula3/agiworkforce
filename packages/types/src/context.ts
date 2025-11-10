/**
 * Context Item Types
 *
 * Defines types for context items that can be attached to chat messages.
 * Supports @file, @folder, @url, @web commands similar to Cursor/Claude Code.
 */

/**
 * Type of context item
 */
export type ContextItemType = 'file' | 'folder' | 'url' | 'web' | 'image' | 'code-snippet';

/**
 * Base context item interface
 */
export interface BaseContextItem {
  id: string;
  type: ContextItemType;
  name: string;
  description?: string;
  tokens?: number;
  timestamp: Date;
}

/**
 * File context item - represents a single file
 */
export interface FileContextItem extends BaseContextItem {
  type: 'file';
  path: string;
  content?: string;
  language?: string;
  size?: number;
  lineCount?: number;
  excerpt?: string; // First few lines for preview
}

/**
 * Folder context item - represents a directory
 */
export interface FolderContextItem extends BaseContextItem {
  type: 'folder';
  path: string;
  fileCount?: number;
  size?: number;
  files?: string[]; // List of file paths
}

/**
 * URL context item - represents a web URL
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
 * Web search context item - represents web search results
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
 * Image context item - represents an image (screenshot, upload)
 */
export interface ImageContextItem extends BaseContextItem {
  type: 'image';
  path?: string; // Local path
  url?: string; // Remote URL
  dataUrl?: string; // Data URL for inline images
  width?: number;
  height?: number;
  format?: string; // png, jpg, etc.
  size?: number;
  ocrText?: string; // Extracted text from OCR
}

/**
 * Code snippet context item - represents a code block
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
 * Union type of all context items
 */
export type ContextItem =
  | FileContextItem
  | FolderContextItem
  | UrlContextItem
  | WebContextItem
  | ImageContextItem
  | CodeSnippetContextItem;

/**
 * Context item creation options
 */
export interface CreateContextItemOptions {
  type: ContextItemType;
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Autocomplete suggestion for @commands
 */
export interface ContextSuggestion {
  id: string;
  type: ContextItemType;
  label: string;
  value: string;
  description?: string;
  icon?: string;
  score?: number; // Relevance score for ranking
  metadata?: Record<string, unknown>;
}

/**
 * Autocomplete state
 */
export interface AutocompleteState {
  active: boolean;
  trigger: string; // '@file', '@folder', etc.
  query: string; // Text after the trigger
  suggestions: ContextSuggestion[];
  selectedIndex: number;
  position?: { top: number; left: number };
}
