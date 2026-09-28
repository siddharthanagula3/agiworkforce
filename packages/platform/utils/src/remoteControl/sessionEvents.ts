import {
  DEVELOPER_FILE_CHANGES,
  type DeveloperFileChange,
  type DeveloperSessionEvent,
  type DeveloperTurnFailure,
  type DeveloperTurnOutcome,
} from '@agiworkforce/local-runtime-contract';
import type { TurnFailureAction, TurnFailureCode } from '@agiworkforce/types/protocol';

const APPROVAL_SUMMARY_FALLBACK = 'The agent needs approval to continue.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isDeveloperFileChange(value: string | null): value is DeveloperFileChange {
  return value !== null && (DEVELOPER_FILE_CHANGES as readonly string[]).includes(value);
}

function turnOutcome(method: string): DeveloperTurnOutcome | null {
  if (method === 'turn/completed') return 'completed';
  if (method === 'turn/failed') return 'failed';
  if (method === 'turn/interrupted') return 'interrupted';
  return null;
}

export function readTurnFailure(params: Record<string, unknown>): DeveloperTurnFailure | null {
  const raw = params['failure'];
  if (isRecord(raw)) {
    const message = readString(raw, 'message');
    if (message) {
      return {
        code: (readString(raw, 'code') ?? 'unknown') as TurnFailureCode,
        message,
        provider: readString(raw, 'provider'),
        action: (readString(raw, 'action') ?? 'none') as TurnFailureAction,
        retryable: raw['retryable'] === true,
      };
    }
  }
  const legacy = readString(params, 'error');
  if (!legacy) return null;
  return { code: 'unknown', message: legacy, provider: null, action: 'none', retryable: false };
}

function agentEvent(params: Record<string, unknown>): DeveloperSessionEvent | null {
  const threadId = readString(params, 'sessionId');
  const turnId = readString(params, 'turnId');
  const event = params['event'];
  if (!threadId || !turnId || !isRecord(event)) return null;

  if (event['type'] === 'turn-diff') {
    return {
      type: 'turn-diff',
      threadId,
      turnId,
      unifiedDiff: readString(event, 'unifiedDiff') ?? '',
      paths: Array.isArray(event['paths'])
        ? event['paths'].filter((path): path is string => typeof path === 'string')
        : [],
    };
  }

  const toolCallId = readString(event, 'toolCallId');
  if (!toolCallId) return null;

  if (event['type'] === 'command-started') {
    const command = readString(event, 'command');
    if (!command) return null;
    return {
      type: 'command-started',
      threadId,
      turnId,
      toolCallId,
      command,
      cwd: readString(event, 'cwd') ?? null,
    };
  }
  if (event['type'] === 'file-changed') {
    const path = readString(event, 'path');
    const change = readString(event, 'change');
    if (!path || !isDeveloperFileChange(change)) return null;
    return { type: 'file-changed', threadId, turnId, toolCallId, path, change };
  }

  const name = readString(event, 'name');
  if (!name) return null;

  if (event['type'] === 'tool-execution-queued') {
    return {
      type: 'tool-queued',
      threadId,
      turnId,
      toolCallId,
      name,
      position: readNumber(event, 'position') ?? 0,
      queueDepth: readNumber(event, 'queueDepth') ?? 1,
    };
  }
  if (event['type'] === 'tool-execution-start') {
    return {
      type: 'tool-started',
      threadId,
      turnId,
      toolCallId,
      name,
      summary: readString(event, 'summary') ?? name,
    };
  }
  if (event['type'] === 'tool-execution-end') {
    const output = event['output'];
    return {
      type: 'tool-finished',
      threadId,
      turnId,
      toolCallId,
      name,
      output:
        typeof output === 'string' ? output : output === undefined ? '' : JSON.stringify(output),
      isError: event['isError'] === true,
    };
  }
  return null;
}

export function developerSessionEventFromNotification(
  method: string,
  rawParams: unknown,
): DeveloperSessionEvent | null {
  const params = isRecord(rawParams) ? rawParams : {};

  if (method === 'turn/agent_event') return agentEvent(params);

  const threadId = readString(params, 'threadId');
  const turnId = readString(params, 'turnId');
  if (!threadId || !turnId) return null;

  if (method === 'turn/started') return { type: 'turn-started', threadId, turnId };
  if (method === 'turn/output_delta') {
    const delta = params['delta'];
    return typeof delta === 'string' ? { type: 'output-delta', threadId, turnId, delta } : null;
  }
  if (method === 'approval/requested') {
    const requestId = readString(params, 'requestId');
    if (!requestId) return null;
    return {
      type: 'approval-requested',
      threadId,
      turnId,
      requestId,
      summary: readString(params, 'summary') ?? APPROVAL_SUMMARY_FALLBACK,
      detail: readString(params, 'detail') ?? '',
    };
  }

  const outcome = turnOutcome(method);
  if (!outcome) return null;
  return {
    type: 'turn-finished',
    threadId,
    turnId,
    outcome,
    response: readString(params, 'response') ?? '',
    failure: readTurnFailure(params),
    inputTokens: readNumber(params, 'inputTokens') ?? 0,
    outputTokens: readNumber(params, 'outputTokens') ?? 0,
  };
}
