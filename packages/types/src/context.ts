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

export interface FileContextItem extends BaseContextItem {
  type: 'file';
  path: string;
  content?: string;
  language?: string;
  size?: number;
  lineCount?: number;
  excerpt?: string;
}

export interface FolderContextItem extends BaseContextItem {
  type: 'folder';
  path: string;
  fileCount?: number;
  size?: number;
  files?: string[];
}

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

export interface CodeSnippetContextItem extends BaseContextItem {
  type: 'code-snippet';
  code: string;
  language: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

export interface SelectionContextItem extends BaseContextItem {
  type: 'selection';
  content?: string;
  path?: string;
  size?: number;
}

export interface ClipboardContextItem extends BaseContextItem {
  type: 'clipboard';
  content?: string;
  path?: string;
  size?: number;
}

export type ContextItem =
  | FileContextItem
  | FolderContextItem
  | UrlContextItem
  | WebContextItem
  | ImageContextItem
  | CodeSnippetContextItem
  | SelectionContextItem
  | ClipboardContextItem;

export interface CreateContextItemOptions {
  type: ContextItemType;
  name: string;
  description?: string;
  [key: string]: unknown;
}

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

export interface AutocompleteState {
  active: boolean;
  trigger: string;
  query: string;
  suggestions: ContextSuggestion[];
  selectedIndex: number;
  position?: { top: number; left: number };
}
