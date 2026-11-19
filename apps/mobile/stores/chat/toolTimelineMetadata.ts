import type { LifecycleStatus, ToolStatus } from '@agiworkforce/types';
import type { StatusStep, ToolCall, ToolSearchResult } from '@/types/chat';

export const PHONE_TOOL_ENTRY_PREFIX = 'phone-tool:';
export const STATUS_STEPS_METADATA_KEY = 'statusSteps';
const STORED_TOOL_ID_PREFIX = 'stored-tool:';

const ARGS_LIMIT = 2_000;
const RESULT_LIMIT = 4_000;
const TEXT_LIMIT = 500;
const SEARCH_RESULTS_LIMIT = 20;
const STEPS_LIMIT = 20;

type StoredToolStatus = Extract<LifecycleStatus, 'pending' | 'running' | 'completed' | 'failed'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bounded(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : undefined;
}

function storedStatus(status: ToolStatus): StoredToolStatus {
  if (status === 'succeeded' || status === 'partial') return 'completed';
  if (status === 'running' || status === 'pending') return status;
  return 'failed';
}

function shownStatus(status: unknown, hasOutput: boolean): ToolStatus | null {
  const stored = status as StoredToolStatus | undefined;
  if (stored === 'completed') return 'succeeded';
  if (stored === 'failed') return 'failed';
  if (stored === 'running' || stored === 'pending') return hasOutput ? 'partial' : 'failed';
  return null;
}

function storedSearchResults(results: readonly ToolSearchResult[] | undefined) {
  return (results ?? []).slice(0, SEARCH_RESULTS_LIMIT).flatMap((result) =>
    typeof result.url === 'string' && result.url.length > 0
      ? [
          {
            url: result.url.slice(0, 2_048),
            title: (result.title || result.url).slice(0, TEXT_LIMIT),
            ...(bounded(result.snippet, TEXT_LIMIT)
              ? { snippet: bounded(result.snippet, TEXT_LIMIT) }
              : {}),
            ...(bounded(result.publishedDate, 64)
              ? { publishedDate: bounded(result.publishedDate, 64) }
              : {}),
          },
        ]
      : [],
  );
}

/** The phone's own tool steps, in the `tools` entry shape web's timeline reads. */
export function toolTimelineEntriesForSync(
  toolCalls: readonly ToolCall[] | undefined,
): Record<string, unknown>[] {
  return (toolCalls ?? [])
    .filter(
      (call) =>
        call.requiresApproval !== true &&
        call.name.length > 0 &&
        !call.id.startsWith(STORED_TOOL_ID_PREFIX),
    )
    .map((call) => {
      const status = storedStatus(call.status);
      const output = bounded(call.output, RESULT_LIMIT);
      const searchResults = storedSearchResults(call.searchResults);
      return {
        id: `${PHONE_TOOL_ENTRY_PREFIX}${call.toolCallId ?? call.id}`,
        name: call.name,
        status,
        ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
        ...(bounded(call.input, ARGS_LIMIT) ? { args: bounded(call.input, ARGS_LIMIT) } : {}),
        ...(output ? (status === 'failed' ? { error: output } : { result: output }) : {}),
        ...(bounded(call.stderr, RESULT_LIMIT)
          ? { stderr: bounded(call.stderr, RESULT_LIMIT) }
          : {}),
        ...(typeof call.exitCode === 'number' ? { exitCode: call.exitCode } : {}),
        ...(typeof call.duration === 'number' && Number.isFinite(call.duration)
          ? { durationMs: call.duration }
          : {}),
        ...(searchResults.length > 0 ? { searchResults } : {}),
      };
    });
}

export function isPhoneToolEntry(entry: unknown): boolean {
  return (
    isRecord(entry) &&
    typeof entry['id'] === 'string' &&
    entry['id'].startsWith(PHONE_TOOL_ENTRY_PREFIX)
  );
}

function searchResultsFromEntry(value: unknown): ToolSearchResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const results = value.flatMap((entry) =>
    isRecord(entry) && typeof entry['url'] === 'string' && entry['url'].length > 0
      ? [
          {
            url: entry['url'],
            title: typeof entry['title'] === 'string' ? entry['title'] : entry['url'],
            ...(typeof entry['snippet'] === 'string' ? { snippet: entry['snippet'] } : {}),
            ...(typeof entry['publishedDate'] === 'string'
              ? { publishedDate: entry['publishedDate'] }
              : {}),
          },
        ]
      : [],
  );
  return results.length > 0 ? results : undefined;
}

/** The settled tool steps of a stored answer, from the phone's entries or web's. */
export function toolCallsFromStoredTimeline(metadata: unknown): ToolCall[] | undefined {
  const tools = isRecord(metadata) ? metadata['tools'] : undefined;
  if (!Array.isArray(tools)) return undefined;
  const calls = tools.flatMap((entry, index): ToolCall[] => {
    if (!isRecord(entry) || typeof entry['name'] !== 'string' || entry['name'].length === 0) {
      return [];
    }
    if (entry['requiresApproval'] === true) return [];
    const output = bounded(entry['result'], RESULT_LIMIT) ?? bounded(entry['error'], RESULT_LIMIT);
    const status = shownStatus(entry['status'], output !== undefined);
    if (!status) return [];
    const toolCallId = typeof entry['toolCallId'] === 'string' ? entry['toolCallId'] : undefined;
    const searchResults = searchResultsFromEntry(entry['searchResults']);
    const storedId = typeof entry['id'] === 'string' ? entry['id'] : undefined;
    const id =
      storedId && isPhoneToolEntry(entry)
        ? storedId.slice(PHONE_TOOL_ENTRY_PREFIX.length)
        : `${STORED_TOOL_ID_PREFIX}${storedId ?? toolCallId ?? index}`;
    return [
      {
        id,
        name: entry['name'],
        status,
        ...(toolCallId ? { toolCallId } : {}),
        ...(bounded(entry['args'], ARGS_LIMIT)
          ? { input: bounded(entry['args'], ARGS_LIMIT) }
          : {}),
        ...(output ? { output } : {}),
        ...(bounded(entry['stderr'], RESULT_LIMIT)
          ? { stderr: bounded(entry['stderr'], RESULT_LIMIT) }
          : {}),
        ...(typeof entry['exitCode'] === 'number' ? { exitCode: entry['exitCode'] } : {}),
        ...(typeof entry['durationMs'] === 'number' ? { duration: entry['durationMs'] } : {}),
        ...(searchResults ? { searchResults } : {}),
      },
    ];
  });
  return calls.length > 0 ? calls : undefined;
}

const STEP_ICONS: ReadonlySet<StatusStep['icon']> = new Set([
  'thinking',
  'searching',
  'coding',
  'command',
  'success',
  'error',
]);

export function statusStepsForSync(steps: readonly StatusStep[] | undefined): StatusStep[] {
  return (steps ?? []).slice(0, STEPS_LIMIT).map((step) => ({
    id: step.id,
    icon: step.icon,
    message: step.message.slice(0, TEXT_LIMIT),
    ...(step.detail ? { detail: step.detail.slice(0, TEXT_LIMIT) } : {}),
    status: step.status === 'running' ? 'failed' : step.status,
  }));
}

export function statusStepsFromMetadata(metadata: unknown): StatusStep[] | undefined {
  const stored = isRecord(metadata) ? metadata[STATUS_STEPS_METADATA_KEY] : undefined;
  if (!Array.isArray(stored)) return undefined;
  const steps = stored.flatMap((entry): StatusStep[] =>
    isRecord(entry) &&
    typeof entry['id'] === 'string' &&
    typeof entry['message'] === 'string' &&
    STEP_ICONS.has(entry['icon'] as StatusStep['icon'])
      ? [
          {
            id: entry['id'],
            icon: entry['icon'] as StatusStep['icon'],
            message: entry['message'],
            ...(typeof entry['detail'] === 'string' ? { detail: entry['detail'] } : {}),
            status: entry['status'] === 'completed' ? 'completed' : 'failed',
          },
        ]
      : [],
  );
  return steps.length > 0 ? steps : undefined;
}
