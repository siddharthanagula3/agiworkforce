'use client';

export const MCP_CONTEXT_SELECTED_EVENT = 'agi:mcp-context-selected';
const STORAGE_KEY = 'agi:mcp-context-pending';

export interface McpContextSelection {
  prompt?: { connectorId: string; name: string; arguments?: Record<string, string> };
  resources?: Array<{ connectorId: string; uri: string; name?: string }>;
}

export function publishMcpContextSelection(selection: McpContextSelection): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  window.dispatchEvent(
    new CustomEvent<McpContextSelection>(MCP_CONTEXT_SELECTED_EVENT, { detail: selection }),
  );
}

export function consumePendingMcpContextSelection(): McpContextSelection | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as McpContextSelection;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
