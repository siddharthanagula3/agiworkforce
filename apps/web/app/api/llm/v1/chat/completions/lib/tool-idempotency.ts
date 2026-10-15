import 'server-only';

/**
 * Cross-attempt memory for tool calls that must not run twice.
 *
 * The durable path already routes every call through its own executor; the
 * streaming path has no such record, so a step retried inside one turn could
 * run a mutating tool a second time. Only calls the tool loop itself classifies
 * as retry-unsafe are guarded, because re-running a read-only lookup is free
 * and blocking it would cost the turn its answer.
 */
import { logger } from '@/lib/logger';
import type { KeyValueStore } from '@agiworkforce/key-value';
import { getKeyValueStore } from '@/lib/server/key-value';

import type { CloudAgentToolRetrySafety, ToolLoopToolResult } from './tool-loop';

export const TOOL_IDEMPOTENCY_WINDOW_ENV = 'AGI_TOOL_IDEMPOTENCY_WINDOW_MS';

const DEFAULT_WINDOW_MS = 15 * 60_000;
const MIN_WINDOW_MS = 1_000;
const MS_PER_SECOND = 1_000;
const KEY_PREFIX = 'agi-tool-idem';
const KEY_SEPARATOR = ':';

/**
 * Above this, the settled result is not stored and only the fact of settlement
 * is. A replay then reports that the call already ran rather than inventing a
 * result, which is the honest answer and still stops the second execution.
 */
const MAX_STORED_RESULT_BYTES = 16 * 1024;

const SETTLED_WITHOUT_RESULT = 'settled';
const CLAIMED_UNSETTLED = 'claimed';

interface SettledToolRecord {
  result?: ToolLoopToolResult;
}

type StoredToolRecord =
  SettledToolRecord | typeof SETTLED_WITHOUT_RESULT | typeof CLAIMED_UNSETTLED;

export function resolveToolIdempotencyWindowMs(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const configured = environment[TOOL_IDEMPOTENCY_WINDOW_ENV]?.trim();
  if (!configured) return DEFAULT_WINDOW_MS;
  const windowMs = Number(configured);
  if (!Number.isInteger(windowMs) || windowMs < MIN_WINDOW_MS) {
    logger.error(
      { [TOOL_IDEMPOTENCY_WINDOW_ENV]: configured },
      '[tool-idempotency] unrecognised window; using the default',
    );
    return DEFAULT_WINDOW_MS;
  }
  return windowMs;
}

function settledKey(idempotencyKey: string): string {
  return [KEY_PREFIX, idempotencyKey].join(KEY_SEPARATOR);
}

export function alreadySettledMessage(toolName: string): string {
  return `Tool "${toolName}" already ran for this step and was not run again. Its result is in the conversation above.`;
}

export function claimUnconfirmedMessage(toolName: string): string {
  return (
    `Tool "${toolName}" was not run: the record that stops it running twice could not be ` +
    'written. Tell the user it did not run; do not retry it on this turn.'
  );
}

export function outcomeUnknownMessage(toolName: string): string {
  return (
    `Tool "${toolName}" may already have run for this step, but its outcome was never ` +
    'recorded, so it was not run again. Tell the user the outcome is unknown; do not say it ' +
    'succeeded or failed.'
  );
}

function storableRecord(result: ToolLoopToolResult): StoredToolRecord {
  const serialized = JSON.stringify({ result });
  return serialized.length > MAX_STORED_RESULT_BYTES ? SETTLED_WITHOUT_RESULT : { result };
}

type ClaimOutcome = 'claimed' | 'taken' | 'unavailable';

async function claimCall(
  store: KeyValueStore,
  idempotencyKey: string,
  windowMs: number,
): Promise<ClaimOutcome> {
  try {
    const claimed = await store.set(settledKey(idempotencyKey), CLAIMED_UNSETTLED, {
      onlyIfAbsent: true,
      ttlSeconds: Math.ceil(windowMs / MS_PER_SECOND),
    });
    return claimed ? 'claimed' : 'taken';
  } catch (error) {
    logger.error(
      { error, idempotencyKey },
      '[tool-idempotency] claim failed; the retry-unsafe call is refused rather than risk a second run',
    );
    return 'unavailable';
  }
}

async function readRecord(
  store: KeyValueStore,
  idempotencyKey: string,
): Promise<StoredToolRecord | null | 'unreadable'> {
  try {
    return (await store.get<StoredToolRecord>(settledKey(idempotencyKey))) ?? null;
  } catch (error) {
    logger.error({ error, idempotencyKey }, '[tool-idempotency] claimed record unreadable');
    return 'unreadable';
  }
}

async function recordSettled(
  store: KeyValueStore,
  idempotencyKey: string,
  result: ToolLoopToolResult,
  windowMs: number,
): Promise<void> {
  try {
    await store.set(settledKey(idempotencyKey), storableRecord(result), {
      ttlSeconds: Math.ceil(windowMs / MS_PER_SECOND),
    });
  } catch (error) {
    logger.error(
      { error, idempotencyKey },
      '[tool-idempotency] settlement was not recorded; a retry reports the outcome as unknown',
    );
  }
}

async function releaseClaim(store: KeyValueStore, idempotencyKey: string): Promise<void> {
  try {
    await store.delete(settledKey(idempotencyKey));
  } catch (error) {
    logger.error(
      { error, idempotencyKey },
      '[tool-idempotency] paused call kept its claim; the resume round is keyed separately',
    );
  }
}

export interface GuardedToolExecution {
  idempotencyKey: string;
  retrySafety: CloudAgentToolRetrySafety;
  toolName: string;
  execute: () => Promise<ToolLoopToolResult>;
}

/**
 * A retry-unsafe call claims its key atomically before it runs, so a concurrent
 * attempt or a retry after a lost process finds the claim rather than nothing.
 * A claim that cannot be written refuses the call: running it unrecorded is the
 * duplicate this guard exists to stop. A deployment with no key-value store
 * configured has no record to claim and runs the call as before.
 */
export async function runToolCallOnce(
  execution: GuardedToolExecution,
): Promise<ToolLoopToolResult> {
  if (execution.retrySafety === 'safe') return execution.execute();
  const store = getKeyValueStore();
  if (!store) return execution.execute();

  const { idempotencyKey, toolName } = execution;
  const windowMs = resolveToolIdempotencyWindowMs();
  const claim = await claimCall(store, idempotencyKey, windowMs);
  if (claim === 'unavailable') {
    return { content: claimUnconfirmedMessage(toolName), isError: true, unavailable: true };
  }
  if (claim === 'taken') {
    const prior = await readRecord(store, idempotencyKey);
    if (prior === 'unreadable') {
      return { content: claimUnconfirmedMessage(toolName), isError: true, unavailable: true };
    }
    if (prior !== null && prior !== CLAIMED_UNSETTLED) {
      logger.warn(
        { idempotencyKey, tool: toolName },
        '[tool-idempotency] refusing to run a tool call this step already settled',
      );
      return prior === SETTLED_WITHOUT_RESULT || !prior.result
        ? { content: alreadySettledMessage(toolName), isError: false }
        : prior.result;
    }
    logger.warn(
      { idempotencyKey, tool: toolName },
      '[tool-idempotency] call already claimed and never settled; outcome unknown',
    );
    return { content: outcomeUnknownMessage(toolName), isError: true };
  }

  const result = await execution.execute();
  // A call that paused for input has not settled: recording it here would make
  // the resume round replay the pause instead of finishing the call.
  if (result.inputRequired) await releaseClaim(store, idempotencyKey);
  else await recordSettled(store, idempotencyKey, result, windowMs);
  return result;
}
