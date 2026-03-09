/**
 * agenticEventUtils.ts
 *
 * Pure utility functions shared across agentic event sub-hooks.
 * Extracted from useAgenticEvents.ts so multiple hooks can import
 * them without circular dependencies.
 */
import type { ActionLogEntryType, ActionLogStatus } from '../stores/unifiedChatStore';

// =============================================================================
// Status / type normalization
// =============================================================================

export const normalizeActionStatus = (status?: string): ActionLogStatus => {
  if (!status) return 'pending';
  const normalized = status.toLowerCase();
  if (normalized === 'running' || normalized === 'in_progress') return 'running';
  if (normalized === 'success' || normalized === 'completed' || normalized === 'done')
    return 'success';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  if (normalized === 'blocked') return 'blocked';
  return 'pending';
};

export const normalizeRiskLevel = (risk?: string): 'low' | 'medium' | 'high' => {
  if (!risk) return 'high';
  const normalized = risk.toLowerCase();
  if (normalized === 'critical' || normalized === 'high') return 'high';
  if (normalized === 'medium') return 'medium';
  return 'low';
};

export const mapActionType = (type?: string): ActionLogEntryType => {
  switch ((type ?? '').toLowerCase()) {
    case 'filesystem':
    case 'file':
    case 'cloud':
      return 'filesystem';
    case 'browser':
      return 'browser';
    case 'automation':
      return 'ui';
    case 'calendar':
    case 'gmail':
    case 'email':
      return 'mcp';
    case 'ui':
    case 'desktop':
      return 'ui';
    case 'mcp':
      return 'mcp';
    case 'approval':
      return 'approval';
    case 'metrics':
      return 'metrics';
    case 'plan':
      return 'plan';
    default:
      return 'terminal';
  }
};

export const mapToolNameToActionType = (toolName?: string): ActionLogEntryType => {
  const normalized = (toolName ?? '').toLowerCase();
  if (
    normalized.startsWith('browser_') ||
    normalized.startsWith('extension_') ||
    normalized.startsWith('mcp__playwright__') ||
    normalized.startsWith('web_')
  ) {
    return 'browser';
  }
  if (
    normalized.startsWith('mcp__') ||
    normalized.startsWith('mcp_') ||
    normalized.includes('mcp')
  ) {
    return 'mcp';
  }
  if (
    normalized.startsWith('file_') ||
    normalized.includes('filesystem') ||
    normalized.includes('directory') ||
    normalized.includes('cloud_')
  ) {
    return 'filesystem';
  }
  if (
    normalized.startsWith('automation_') ||
    normalized.startsWith('ui_') ||
    normalized.includes('desktop')
  ) {
    return 'ui';
  }
  return 'terminal';
};

// =============================================================================
// MCP tool display name
// =============================================================================

const decodeMcpIdComponent = (value: string): string => {
  if (value.startsWith('hex:')) {
    try {
      const hex = value.slice(4);
      const bytes = hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      return value;
    }
  }
  if (value.startsWith('b64:')) {
    try {
      const encoded = value.slice(4).replace(/-/g, '+').replace(/_/g, '/');
      const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
      return atob(padded);
    } catch {
      return value;
    }
  }
  return value;
};

export const getMcpToolDisplayName = (toolId: string): string => {
  // New/legacy canonical format: mcp__<server>__<tool>
  if (toolId.startsWith('mcp__')) {
    const parts = toolId.split('__', 3);
    if (parts.length === 3) {
      const decoded = decodeMcpIdComponent(parts[2] || '');
      return decoded.replace(/_/g, ' ');
    }
  }
  // Legacy underscore format fallback: mcp_<server>_<tool>
  return toolId.replace(/^mcp_[^_]+_/, '').replace(/_/g, ' ');
};

// =============================================================================
// Misc
// =============================================================================

export const safeJsonStringify = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
