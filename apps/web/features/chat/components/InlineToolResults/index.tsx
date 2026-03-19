'use client';

/**
 * Inline Tool Result Renderer Registry
 *
 * Maps tool names to their respective React components for inline display
 * within the chat message stream. Each renderer visualizes the output of
 * a specific tool type (search, code diff, terminal, file read, etc.).
 */

import React, { Suspense } from 'react';

// ---------------------------------------------------------------------------
// Shared prop contract
// ---------------------------------------------------------------------------

export type ToolResultStatus = 'idle' | 'running' | 'success' | 'error' | 'completed' | 'failed';

export interface ToolResultProps {
  /** Raw result payload from the tool execution */
  result: {
    data?: unknown;
    status?: ToolResultStatus;
    error?: string;
  };
  /** Current execution status */
  status?: ToolResultStatus;
}

// ---------------------------------------------------------------------------
// Lazy imports for code splitting
// ---------------------------------------------------------------------------

const InlineSearchResults = React.lazy(() =>
  import('./InlineSearchResults').then((m) => ({ default: m.InlineSearchResults })),
);

const InlineCodeDiff = React.lazy(() =>
  import('./InlineCodeDiff').then((m) => ({ default: m.InlineCodeDiff })),
);

const InlineTerminalOutput = React.lazy(() =>
  import('./InlineTerminalOutput').then((m) => ({ default: m.InlineTerminalOutput })),
);

const InlineFileRead = React.lazy(() =>
  import('./InlineFileRead').then((m) => ({ default: m.InlineFileRead })),
);

const ToolResultCard = React.lazy(() =>
  import('./ToolResultCard').then((m) => ({ default: m.ToolResultCard })),
);

// ---------------------------------------------------------------------------
// Registry: tool name -> component
// ---------------------------------------------------------------------------

type RendererComponent =
  | React.ComponentType<ToolResultProps>
  | React.LazyExoticComponent<React.ComponentType<ToolResultProps>>;

export const TOOL_RENDERERS: Record<string, RendererComponent> = {
  // Web search & research
  web_search: InlineSearchResults,
  perplexity_search: InlineSearchResults,
  search_web: InlineSearchResults,
  browser_search: InlineSearchResults,
  WebSearch: InlineSearchResults,
  WebFetch: InlineSearchResults,

  // File operations (diff view)
  file_write: InlineCodeDiff,
  file_edit: InlineCodeDiff,
  file_create: InlineCodeDiff,
  file_delete: InlineCodeDiff,
  code_edit: InlineCodeDiff,
  Write: InlineCodeDiff,
  Edit: InlineCodeDiff,
  MultiEdit: InlineCodeDiff,
  ApplyPatch: InlineCodeDiff,

  // File read
  file_read: InlineFileRead,
  Read: InlineFileRead,
  mcp__filesystem__read_file: InlineFileRead,
  mcp__filesystem__read_text_file: InlineFileRead,

  // Terminal & code execution
  terminal_execute: InlineTerminalOutput,
  shell_command: InlineTerminalOutput,
  terminal_run: InlineTerminalOutput,
  bash_execute: InlineTerminalOutput,
  code_execute: InlineTerminalOutput,
  Bash: InlineTerminalOutput,

  // MCP filesystem
  mcp__filesystem__write_file: InlineTerminalOutput,
  mcp__filesystem__edit_file: InlineTerminalOutput,
  mcp__filesystem__move_file: InlineTerminalOutput,
  mcp__filesystem__create_directory: InlineTerminalOutput,

  // Git operations
  git_status: InlineTerminalOutput,
  git_diff: InlineCodeDiff,
  git_log: InlineTerminalOutput,
  git_commit: InlineTerminalOutput,
  git_push: InlineTerminalOutput,
  Git: InlineTerminalOutput,

  // Database
  db_query: InlineTerminalOutput,
  database_query: InlineTerminalOutput,
  sql_query: InlineTerminalOutput,
  mcp__supabase__execute_sql: InlineTerminalOutput,

  // API
  api_call: InlineTerminalOutput,
  http_request: InlineTerminalOutput,
  fetch_url: InlineSearchResults,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the renderer component for a specific tool name.
 * Falls back to generic ToolResultCard for unknown tools.
 */
export function getToolRenderer(toolName: string | undefined): RendererComponent {
  if (!toolName) return ToolResultCard;

  // Direct registry hit
  if (TOOL_RENDERERS[toolName]) {
    return TOOL_RENDERERS[toolName];
  }

  // Heuristic fallbacks
  if (toolName.includes('search') || toolName.includes('fetch')) return InlineSearchResults;
  if (toolName.includes('read') || toolName.includes('Read')) return InlineFileRead;
  if (toolName.startsWith('mcp__')) return InlineTerminalOutput;

  return ToolResultCard;
}

/**
 * Check if a tool has a specialized inline renderer (not the generic fallback).
 */
export function hasInlineRenderer(toolName: string | undefined): boolean {
  if (!toolName) return false;
  return toolName in TOOL_RENDERERS;
}

// ---------------------------------------------------------------------------
// Suspense wrapper for convenience
// ---------------------------------------------------------------------------

interface InlineToolResultProps {
  toolName: string;
  result: ToolResultProps['result'];
  status?: ToolResultStatus;
}

export function InlineToolResult({ toolName, result, status }: InlineToolResultProps) {
  const Renderer = getToolRenderer(toolName);

  return (
    <Suspense
      fallback={
        <div className="mt-3 flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/20">
          <div className="h-4 w-4 animate-pulse rounded bg-muted-foreground/20" />
          <span className="text-sm text-muted-foreground">Loading result...</span>
        </div>
      }
    >
      <Renderer result={result} status={status} />
    </Suspense>
  );
}
