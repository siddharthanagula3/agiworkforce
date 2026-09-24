/**
 * @file The bounded shape a chat message's metadata is stored in.
 *
 * `ManagedCloudMessageMetadataSchema` caps a stored row at
 * {@link MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH} characters. Nothing bounded
 * what the client put in it, so an ordinary turn that cited thirty pages, or
 * one that reasoned at length, exceeded the cap and the whole assistant save
 * was refused: the answer text survived only in the tab that produced it.
 *
 * Every unbounded key is bounded here instead, once, in the contract both the
 * writer and the reader share. Sources keep the three fields a card renders
 * (title, snippet, date) and lose the ones a reader can derive (the favicon is
 * a function of the URL). Reasoning, tool arguments and sandbox output keep a
 * readable prefix. A run that is still over budget after all of that drops its
 * largest droppable key and says so with {@link METADATA_TRUNCATED_KEY}, rather
 * than losing the row.
 *
 * The guarantee is total, not per-key: `projectPersistedMessageMetadata` never
 * returns metadata longer than the cap, for any input. `__tests__/
 * message-metadata-projection.test.ts` proves it against adversarial inputs.
 */

import { parseProjectFileCitations } from '@agiworkforce/types';

import {
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  managedCloudMetadataLength,
} from './conversations';

/** Set when a key had to be dropped whole to fit the row under the cap. */
export const METADATA_TRUNCATED_KEY = 'metadataTruncated';

/** Sources kept on a stored turn; past this a citation list stops being read. */
export const PERSISTED_METADATA_MAX_SOURCES = 20;
/** Enough of a snippet to recognise the page it came from. */
export const PERSISTED_METADATA_MAX_SNIPPET_CHARS = 500;
export const PERSISTED_METADATA_MAX_TITLE_CHARS = 300;
export const PERSISTED_METADATA_MAX_URL_CHARS = 2_048;
/** Tool rows kept on a stored turn, and the argument text kept on each. */
export const PERSISTED_METADATA_MAX_TOOLS = 30;
export const PERSISTED_METADATA_MAX_TOOL_ARG_CHARS = 400;
/** Reasoning kept verbatim; the rest is the model thinking out loud. */
export const PERSISTED_METADATA_MAX_THINKING_CHARS = 8_000;
export const PERSISTED_METADATA_MAX_THINKING_SEGMENTS = 8;
/** A sandbox can print megabytes; this is the readable floor. */
export const PERSISTED_METADATA_MAX_CODE_OUTPUT_CHARS = 10_000;
const PERSISTED_ACTIVITY_MAX_SOURCES_PER_ENTRY = 6;
const PERSISTED_ACTIVITY_MAX_FILES_PER_ENTRY = 8;
const PERSISTED_ACTIVITY_STRING_CHARS = 256;

/**
 * Keys that must survive every drop pass. All of them are scalars or short
 * strings, so the essential row has a small ceiling and the drop loop below
 * always terminates under the cap.
 */
const ESSENTIAL_KEYS: ReadonlySet<string> = new Set([
  'model',
  'provider',
  'routeLane',
  'tokensUsed',
  'inputTokens',
  'outputTokens',
  'reasoningTokens',
  'cachedInputTokens',
  'cost',
  'totalDurationMs',
  'finishReason',
  'movedFromModel',
  'movedReason',
  'privacyMode',
  'providerMode',
  'isPinned',
  'webSearchRequested',
  'webSearchAskedInText',
  'serverPersisted',
  'requestId',
  'truncated',
  'truncationReason',
  METADATA_TRUNCATED_KEY,
]);

/** Longest string an essential key may carry, so the essential row is bounded. */
const ESSENTIAL_STRING_MAX_CHARS = 200;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundSource(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const url = clip(value['url'], PERSISTED_METADATA_MAX_URL_CHARS);
  const out: Record<string, unknown> = {};
  if (url) out['url'] = url;
  const title = clip(value['title'], PERSISTED_METADATA_MAX_TITLE_CHARS);
  if (title) out['title'] = title;
  const snippet = clip(value['snippet'], PERSISTED_METADATA_MAX_SNIPPET_CHARS);
  if (snippet) out['snippet'] = snippet;
  const source = clip(value['source'], PERSISTED_METADATA_MAX_TITLE_CHARS);
  if (source) out['source'] = source;
  const publishedDate = clip(value['publishedDate'], ESSENTIAL_STRING_MAX_CHARS);
  if (publishedDate) out['publishedDate'] = publishedDate;
  const position = value['position'];
  if (typeof position === 'number') out['position'] = position;
  return Object.keys(out).length > 0 ? out : undefined;
}

function boundSourceList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const out: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (out.length >= PERSISTED_METADATA_MAX_SOURCES) break;
    const bounded = boundSource(entry);
    if (bounded) out.push(bounded);
  }
  return out;
}

function boundSearchResults(value: unknown): unknown {
  if (Array.isArray(value)) return boundSourceList(value);
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  const query = clip(value['query'], PERSISTED_METADATA_MAX_TITLE_CHARS);
  if (query !== undefined) out['query'] = query;
  out['results'] = boundSourceList(value['results']);
  const answer = clip(value['answer'], PERSISTED_METADATA_MAX_SNIPPET_CHARS);
  if (answer) out['answer'] = answer;
  if (Array.isArray(value['sources'])) {
    out['sources'] = value['sources']
      .slice(0, PERSISTED_METADATA_MAX_SOURCES)
      .map((entry) => clip(entry, PERSISTED_METADATA_MAX_URL_CHARS))
      .filter((entry): entry is string => Boolean(entry));
  }
  const timestamp = value['timestamp'];
  if (typeof timestamp === 'string') out['timestamp'] = clip(timestamp, ESSENTIAL_STRING_MAX_CHARS);
  else if (timestamp instanceof Date) out['timestamp'] = timestamp.toISOString();
  return out;
}

function boundCitations(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const out: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (out.length >= PERSISTED_METADATA_MAX_SOURCES) break;
    if (!isRecord(entry)) continue;
    const citation: Record<string, unknown> = {};
    const type = clip(entry['type'], ESSENTIAL_STRING_MAX_CHARS);
    if (type) citation['type'] = type;
    const url = clip(entry['url'], PERSISTED_METADATA_MAX_URL_CHARS);
    if (url) citation['url'] = url;
    const title = clip(entry['title'], PERSISTED_METADATA_MAX_TITLE_CHARS);
    if (title) citation['title'] = title;
    const citedText = clip(entry['cited_text'], PERSISTED_METADATA_MAX_TITLE_CHARS);
    if (citedText) citation['cited_text'] = citedText;
    if (Object.keys(citation).length > 0) out.push(citation);
  }
  return out;
}

/** Bounds an argument payload in place of its own shape: strings clipped,
 *  arrays capped, nesting stopped. A reader gets a smaller object, never a
 *  string where it expected one. */
const ARG_MAX_DEPTH = 4;
const ARG_MAX_ARRAY_ENTRIES = 20;
const ARG_MAX_OBJECT_KEYS = 40;

function boundArgValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return clip(value, PERSISTED_METADATA_MAX_TOOL_ARG_CHARS);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth >= ARG_MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, ARG_MAX_ARRAY_ENTRIES)
      .map((entry) => boundArgValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, ARG_MAX_OBJECT_KEYS)) {
      const bounded = boundArgValue(entry, depth + 1);
      if (bounded !== undefined) out[key] = bounded;
    }
    return out;
  }
  return undefined;
}

function boundTools(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const out: unknown[] = [];
  for (const entry of value.slice(0, PERSISTED_METADATA_MAX_TOOLS)) {
    if (!isRecord(entry)) continue;
    const tool: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(entry)) {
      const bounded =
        typeof raw === 'string' && (key === 'name' || key === 'status' || key === 'statusPhrase')
          ? clip(raw, ESSENTIAL_STRING_MAX_CHARS)
          : boundArgValue(raw);
      if (bounded !== undefined) tool[key] = bounded;
    }
    out.push(tool);
  }
  return out;
}

function boundThinkingSegments(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, PERSISTED_METADATA_MAX_THINKING_SEGMENTS).map((entry) => {
    if (!isRecord(entry)) return entry;
    const segment: Record<string, unknown> = { ...entry };
    const content = clip(entry['content'], PERSISTED_METADATA_MAX_THINKING_CHARS);
    if (content !== undefined) segment['content'] = content;
    return segment;
  });
}

/** Attachments kept on one stored message. */
export const PERSISTED_METADATA_MAX_ATTACHMENTS = 20;

/**
 * The descriptor, never the bytes.
 *
 * An attachment can carry a base64 data URL in `content` for the send that
 * created it; the bytes are already in object storage and the row only needs
 * the reference. Left in, it is the single largest thing a user message can
 * carry, and a generic shrink would store a data URL cut in half, which renders
 * as a broken image rather than as a missing one.
 */
function boundAttachments(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, PERSISTED_METADATA_MAX_ATTACHMENTS).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { content: _content, ...rest } = entry;
    const bounded: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(rest)) {
      const value = boundArgValue(raw);
      if (value !== undefined) bounded[key] = value;
    }
    return [bounded];
  });
}

function boundCodeExecutionResult(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = { ...value };
  for (const key of ['stdout', 'stderr', 'output']) {
    const clipped = clip(value[key], PERSISTED_METADATA_MAX_CODE_OUTPUT_CHARS);
    if (clipped !== undefined) out[key] = clipped;
  }
  return out;
}

function boundActivityEntry(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of [
    'kind',
    'id',
    'status',
    'summary',
    'progressId',
    'toolCallId',
    'name',
    'category',
    'startedAtMs',
    'completedAtMs',
    'elapsedMs',
    'emittedAtMs',
    'artifactId',
    'mimeType',
    'uri',
    'sizeBytes',
    'beforeTokens',
    'afterTokens',
    'code',
    'retryable',
    'retryAfterSeconds',
    'unavailable',
    'isRetry',
    'query',
    'command',
    'commandCwd',
    'error',
    'message',
  ]) {
    const field = value[key];
    if (typeof field === 'string') {
      out[key] = clip(
        field,
        key === 'uri' ? PERSISTED_METADATA_MAX_URL_CHARS : PERSISTED_ACTIVITY_STRING_CHARS,
      );
    } else if (
      typeof field === 'boolean' ||
      (typeof field === 'number' && Number.isFinite(field))
    ) {
      out[key] = field;
    }
  }

  if (Array.isArray(value['sources'])) {
    out['sources'] = value['sources']
      .slice(0, PERSISTED_ACTIVITY_MAX_SOURCES_PER_ENTRY)
      .flatMap((source) => {
        if (!isRecord(source)) return [];
        const url = clip(source['url'], PERSISTED_ACTIVITY_STRING_CHARS);
        const title = clip(source['title'], PERSISTED_ACTIVITY_STRING_CHARS);
        return url && title ? [{ url, title }] : [];
      });
  }
  if (Array.isArray(value['files'])) {
    out['files'] = value['files']
      .slice(0, PERSISTED_ACTIVITY_MAX_FILES_PER_ENTRY)
      .flatMap((file) => {
        if (!isRecord(file)) return [];
        const path = clip(file['path'], PERSISTED_ACTIVITY_STRING_CHARS);
        const change = clip(file['change'], ESSENTIAL_STRING_MAX_CHARS);
        return path && change ? [{ path, change }] : [];
      });
  }
  for (const key of ['approval', 'deviceStep', 'queue']) {
    const field = fitToBudget(boundArgValue(value[key]), 500);
    if (isRecord(field)) out[key] = field;
  }
  if (value['status'] === 'awaiting-approval' || value['status'] === 'awaiting-device') {
    const input = fitToBudget(boundArgValue(value['input']), 500);
    if (input !== undefined) out['input'] = input;
  }
  return out;
}

function boundAgentActivity(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value['entries'])) return value;
  const budget = KEY_BUDGET_CHARS['agentActivity'];
  if (budget === undefined || serializedLength(value) <= budget) return value;

  const activity: Record<string, unknown> = { entries: [] };
  for (const key of [
    'schemaVersion',
    'sessionId',
    'turnId',
    'lastSequence',
    'status',
    'startedAtMs',
    'updatedAtMs',
    'completedAtMs',
    'stopReason',
    'taskId',
    'taskState',
  ]) {
    const field = value[key];
    if (typeof field === 'string') activity[key] = clip(field, ESSENTIAL_STRING_MAX_CHARS);
    else if (typeof field === 'number' && Number.isFinite(field)) activity[key] = field;
  }

  const entries = value['entries'].map(boundActivityEntry);
  let anchorIndex = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.['kind'] !== 'tool') continue;
    anchorIndex = index;
    break;
  }
  const requiredIndex = anchorIndex >= 0 ? anchorIndex : entries.length - 1;
  const selected = new Set<number>();
  if (requiredIndex >= 0 && entries[requiredIndex]) selected.add(requiredIndex);

  const requiredEntry = entries[requiredIndex];
  if (requiredEntry) {
    while (serializedLength({ ...activity, entries: [requiredEntry] }) > budget) {
      const files = requiredEntry['files'];
      const sources = requiredEntry['sources'];
      if (Array.isArray(files) && files.length > 0) {
        files.pop();
      } else if (Array.isArray(sources) && sources.length > 0) {
        sources.pop();
      } else if ('input' in requiredEntry) {
        delete requiredEntry['input'];
      } else {
        break;
      }
    }
  }

  const selectedEntries = (): Record<string, unknown>[] =>
    [...selected]
      .sort((left, right) => left - right)
      .flatMap((index) => (entries[index] ? [entries[index]] : []));
  activity['entries'] = selectedEntries();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (selected.has(index) || !entries[index]) continue;
    selected.add(index);
    const candidate = selectedEntries();
    if (serializedLength({ ...activity, entries: candidate }) <= budget) {
      activity['entries'] = candidate;
    } else {
      selected.delete(index);
    }
  }

  if (serializedLength(activity) <= budget) return activity;
  if (requiredEntry) {
    activity['entries'] = [
      Object.fromEntries(
        [
          'kind',
          'id',
          'toolCallId',
          'name',
          'category',
          'summary',
          'status',
          'startedAtMs',
          'approval',
          'deviceStep',
        ]
          .filter((key) => requiredEntry[key] !== undefined)
          .map((key) => [key, requiredEntry[key]]),
      ),
    ];
  }
  return serializedLength(activity) <= budget ? activity : fitToBudget(activity, budget);
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

const KEY_BOUNDERS: Record<string, (value: unknown) => unknown> = {
  agentActivity: boundAgentActivity,
  projectSources: (value) => parseProjectFileCitations(value),
  searchResults: boundSearchResults,
  citations: boundCitations,
  tools: boundTools,
  thinkingSegments: boundThinkingSegments,
  codeExecutionResult: boundCodeExecutionResult,
  attachments: boundAttachments,
  thinkingContent: (value) => clip(value, PERSISTED_METADATA_MAX_THINKING_CHARS),
  thinkingSteps: (value) =>
    Array.isArray(value)
      ? value
          .slice(0, PERSISTED_METADATA_MAX_THINKING_SEGMENTS)
          .map((entry) => clip(entry, PERSISTED_METADATA_MAX_TOOL_ARG_CHARS))
      : undefined,
};

function boundEssential(value: unknown): unknown {
  if (typeof value === 'string') return clip(value, ESSENTIAL_STRING_MAX_CHARS);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

/**
 * Each key's own share of the row, so one key can never crowd out another.
 * A turn that cited thirty pages and reasoned for pages keeps both, each
 * shrunk inside its own share, instead of one of them being dropped whole.
 * The shares plus {@link OTHER_KEYS_BUDGET_CHARS} plus the essential ceiling
 * sum to less than the cap, which is what makes the total guarantee hold.
 */
const KEY_BUDGET_CHARS: Record<string, number> = {
  projectSources: 2_500,
  searchResults: 12_000,
  citations: 2_500,
  tools: 6_000,
  thinkingContent: 8_200,
  thinkingSegments: 3_000,
  thinkingSteps: 800,
  codeExecutionResult: 2_000,
  agentActivity: 4_000,
  interactiveCards: 3_000,
  generatedFiles: 2_000,
  research: 2_500,
  agiWorkPlan: 1_500,
  attachments: 6_000,
  collaborationMessages: 2_000,
  workStreamData: 2_000,
  comparisonOptions: 2_000,
};
/**
 * Left free under the cap after the shared shrink, so the JSON encoding of a
 * key name or an escape sequence can never push a fitted row back over.
 */
const CAP_HEADROOM_CHARS = 200;
/** Bound on the shrink walk, so a pathological object cannot spin. */
const SHRINK_MAX_PASSES = 200;

function serializedLength(value: unknown): number {
  return (safeStringify(value) ?? '').length;
}

/**
 * Shrink one value until it serializes inside `budget`: a string is clipped,
 * an array loses trailing entries, an object loses its largest entry (shrunk
 * first, dropped only when shrinking it changed nothing). Returns `undefined`
 * when nothing of the value fits.
 */
function fitToBudget(value: unknown, budget: number): unknown {
  if (budget <= 0) return undefined;
  if (serializedLength(value) <= budget) return value;
  if (typeof value === 'string') return value.slice(0, Math.max(0, budget - 2));
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    const out = [...value];
    let passes = 0;
    while (out.length > 0 && serializedLength(out) > budget && passes++ < SHRINK_MAX_PASSES) {
      out.pop();
    }
    return out;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = { ...value };
    let passes = 0;
    while (serializedLength(out) > budget && passes++ < SHRINK_MAX_PASSES) {
      let worstKey: string | undefined;
      let worstLength = -1;
      for (const [key, entry] of Object.entries(out)) {
        const length = serializedLength(entry);
        if (length > worstLength) {
          worstKey = key;
          worstLength = length;
        }
      }
      if (worstKey === undefined) break;
      const overshoot = serializedLength(out) - budget;
      const shrunk = fitToBudget(out[worstKey], Math.max(0, worstLength - overshoot));
      if (shrunk === undefined || serializedLength(shrunk) >= worstLength) delete out[worstKey];
      else out[worstKey] = shrunk;
    }
    return out;
  }
  return undefined;
}

/**
 * Bound a message's metadata to the shape a row stores.
 *
 * Returns a new object; the input is never mutated. `undefined` in, `undefined`
 * out, so a caller that had nothing to save still sends nothing.
 */
export function projectPersistedMessageMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return metadata;

  const projected: Record<string, unknown> = {};
  let activityTruncated = false;
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (ESSENTIAL_KEYS.has(key)) {
      const bounded = boundEssential(value);
      if (bounded !== undefined) projected[key] = bounded;
      continue;
    }
    const bounder = KEY_BOUNDERS[key];
    const bounded = bounder ? bounder(value) : value;
    if (bounded === undefined) continue;
    if (key === 'agentActivity' && bounded !== value) activityTruncated = true;
    const budget = KEY_BUDGET_CHARS[key];
    projected[key] = budget === undefined ? bounded : fitToBudget(bounded, budget);
    if (projected[key] === undefined) delete projected[key];
  }

  if (activityTruncated) projected[METADATA_TRUNCATED_KEY] = true;

  const essentialLength = managedCloudMetadataLength(
    Object.fromEntries(Object.entries(projected).filter(([key]) => ESSENTIAL_KEYS.has(key))),
  );
  const shared = Object.fromEntries(
    Object.entries(projected).filter(([key]) => !ESSENTIAL_KEYS.has(key)),
  );
  const sharedBudget =
    MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH - essentialLength - CAP_HEADROOM_CHARS;
  if (managedCloudMetadataLength(shared) > sharedBudget) {
    const fitted = fitToBudget(shared, sharedBudget);
    const kept = isRecord(fitted) ? fitted : {};
    for (const key of Object.keys(shared)) {
      if (key in kept) projected[key] = kept[key];
      else delete projected[key];
    }
    projected[METADATA_TRUNCATED_KEY] = true;
  }

  return projected;
}
