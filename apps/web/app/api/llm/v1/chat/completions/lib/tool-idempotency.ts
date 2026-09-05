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

interface SettledToolRecord {
  result?: ToolLoopToolResult;
}

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

function storableRecord(
  result: ToolLoopToolResult,
): SettledToolRecord | typeof SETTLED_WITHOUT_RESULT {
  const serialized = JSON.stringify({ result });
  return serialized.length > MAX_STORED_RESULT_BYTES ? SETTLED_WITHOUT_RESULT : { result };
}

async function readSettled(idempotencyKey: string): Promise<SettledToolRecord | null> {
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    const raw = await store.get<SettledToolRecord | typeof SETTLED_WITHOUT_RESULT>(
      settledKey(idempotencyKey),
    );
    if (raw === null || raw === undefined) return null;
    if (raw === SETTLED_WITHOUT_RESULT) return {};
    return typeof raw === 'object' ? raw : {};
  } catch (error) {
    logger.error(
      { error, idempotencyKey },
      '[tool-idempotency] settled lookup failed; the call may run again',
    );
    return null;
  }
}

async function recordSettled(
  idempotencyKey: string,
  result: ToolLoopToolResult,
  windowMs: number,
): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.set(settledKey(idempotencyKey), storableRecord(result), {
      ttlSeconds: Math.ceil(windowMs / MS_PER_SECOND),
    });
  } catch (error) {
    logger.error(
      { error, idempotencyKey },
      '[tool-idempotency] settlement was not recorded; a retry may run the call again',
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
 * Fails OPEN on a store problem: an unreadable record runs the tool rather than
 * failing the turn, which is the same trade the route health store makes and
 * the only one that keeps a Redis outage from taking chat down.
 */
export async function runToolCallOnce(
  execution: GuardedToolExecution,
): Promise<ToolLoopToolResult> {
  if (execution.retrySafety === 'safe') return execution.execute();

  const settled = await readSettled(execution.idempotencyKey);
  if (settled) {
    logger.warn(
      { idempotencyKey: execution.idempotencyKey, tool: execution.toolName },
      '[tool-idempotency] refusing to run a tool call this step already settled',
    );
    return settled.result ?? { content: alreadySettledMessage(execution.toolName), isError: false };
  }

  const result = await execution.execute();
  // A call that paused for input has not settled: recording it here would make
  // the resume round replay the pause instead of finishing the call.
  if (!result.inputRequired) {
    await recordSettled(execution.idempotencyKey, result, resolveToolIdempotencyWindowMs());
  }
  return result;
}
