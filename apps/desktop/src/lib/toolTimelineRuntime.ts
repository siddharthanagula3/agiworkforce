import type { ToolLabelEntry } from '@agiworkforce/types';
import { normalizeToolNameForUi, toolNameToTitle } from './chatToolUtils';

export interface ToolTimelineLabel {
  displayName: string;
  displayArgs: string;
}

interface ResolveToolTimelineLabelInput {
  rawName?: string | null;
  displayName?: string | null;
  displayArgs?: string | null;
  argumentsText?: string | null;
  existing?: Pick<ToolLabelEntry, 'displayName' | 'displayArgs'> | null;
  activeStreamDisplayName?: string | null;
  activeStreamDisplayArgs?: string | null;
}

const DISPLAY_ARG_KEYS = [
  'path',
  'file_path',
  'filePath',
  'output_path',
  'outputPath',
  'command',
  'query',
  'url',
  'title',
  'prompt',
  'name',
  'text',
  'message',
];

function clipDisplayArg(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

function parseArguments(argumentsText?: string | null): Record<string, unknown> | null {
  if (!argumentsText?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(argumentsText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function stringifyPrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function deriveDisplayArgs(argumentsText?: string | null): string {
  const parsed = parseArguments(argumentsText);
  if (!parsed) {
    return argumentsText?.trim() ? clipDisplayArg(argumentsText) : '';
  }

  for (const key of DISPLAY_ARG_KEYS) {
    const value = stringifyPrimitive(parsed[key]);
    if (value) {
      return clipDisplayArg(value);
    }
  }

  for (const key of ['paths', 'files', 'urls']) {
    const value = parsed[key];
    if (Array.isArray(value) && value.length > 0) {
      const first = stringifyPrimitive(value[0]);
      if (first) {
        const extraCount = value.length - 1;
        return clipDisplayArg(extraCount > 0 ? `${first} +${extraCount}` : first);
      }
    }
  }

  const primitiveEntries = Object.entries(parsed).filter(([, value]) => {
    return ['string', 'number', 'boolean'].includes(typeof value);
  });
  if (primitiveEntries.length === 1) {
    const [, value] = primitiveEntries[0]!;
    const primitive = stringifyPrimitive(value);
    if (primitive) {
      return clipDisplayArg(primitive);
    }
  }

  return '';
}

export function resolveToolTimelineLabel(
  input: ResolveToolTimelineLabelInput,
): ToolTimelineLabel {
  if (input.existing) {
    return input.existing;
  }

  const explicitDisplayName =
    input.displayName?.trim() || input.activeStreamDisplayName?.trim() || null;
  const displayName = explicitDisplayName
    ? normalizeToolNameForUi(explicitDisplayName)
    : toolNameToTitle(input.rawName || 'tool');

  const explicitDisplayArgs =
    input.displayArgs?.trim() || input.activeStreamDisplayArgs?.trim() || null;
  const displayArgs = explicitDisplayArgs || deriveDisplayArgs(input.argumentsText);

  return {
    displayName,
    displayArgs,
  };
}

export function buildRunningToolTimelineEntry(input: {
  id: string;
  rawName?: string | null;
  argumentsText?: string | null;
  displayName?: string | null;
  displayArgs?: string | null;
  existing?: ToolTimelineLabel | null;
  activeStreamDisplayName?: string | null;
  activeStreamDisplayArgs?: string | null;
  parallelGroup?: string | null;
}): ToolLabelEntry {
  const label = resolveToolTimelineLabel(input);

  return {
    id: input.id,
    displayName: label.displayName,
    displayArgs: label.displayArgs,
    status: 'running',
    ...(input.parallelGroup ? { parallelGroup: input.parallelGroup } : {}),
  };
}

export function buildTerminalToolTimelineUpdate(input: {
  success: boolean;
  error?: string | null;
  durationMs?: number;
}): Partial<ToolLabelEntry> {
  return {
    status: input.success ? 'completed' : 'error',
    ...(input.success ? {} : { error: input.error || 'Tool execution failed' }),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
  };
}
