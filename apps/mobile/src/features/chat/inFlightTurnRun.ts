import { storage } from '@/lib/mmkv';

const STORAGE_KEY = 'agi-in-flight-turn-runs-v1';
const MAX_RECORDS = 20;

/**
 * What a sent question started, kept on the phone so an answer the server
 * finishes after the app was ended can still be found: the answer row is not
 * kept while it streams, and the server lists a conversation's runs only while
 * they work. The operation id is kept before the request leaves, because an app
 * ended at once never sees the run id the response headers carry.
 */
export interface InFlightTurnRun {
  conversationId: string;
  questionId: string;
  operationId?: string;
  runId?: string;
}

function isRecord(value: unknown): value is InFlightTurnRun {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const operationId = candidate['operationId'];
  const runId = candidate['runId'];
  return (
    typeof candidate['conversationId'] === 'string' &&
    typeof candidate['questionId'] === 'string' &&
    (operationId === undefined || typeof operationId === 'string') &&
    (runId === undefined || typeof runId === 'string') &&
    (typeof operationId === 'string' || typeof runId === 'string')
  );
}

function readRecords(): InFlightTurnRun[] {
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function writeRecords(records: readonly InFlightTurnRun[]): void {
  try {
    if (records.length === 0) storage.delete(STORAGE_KEY);
    else storage.set(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    return;
  }
}

function replaceRecord(record: InFlightTurnRun): void {
  writeRecords([
    ...readRecords().filter((candidate) => candidate.conversationId !== record.conversationId),
    record,
  ]);
}

export function recordInFlightTurnSend(send: {
  conversationId: string;
  questionId: string;
  operationId: string;
}): void {
  replaceRecord(send);
}

export function recordInFlightTurnRun(run: {
  conversationId: string;
  questionId: string;
  runId: string;
}): void {
  const kept = inFlightTurnFor(run.conversationId, run.questionId);
  replaceRecord({ ...(kept?.operationId ? { operationId: kept.operationId } : {}), ...run });
}

export function inFlightTurnFor(
  conversationId: string,
  questionId: string,
): InFlightTurnRun | null {
  const record = readRecords().find((candidate) => candidate.conversationId === conversationId);
  return record && record.questionId === questionId ? record : null;
}

export function forgetInFlightTurnRun(conversationId: string, questionId?: string): void {
  const records = readRecords();
  const kept = records.filter(
    (record) =>
      record.conversationId !== conversationId ||
      (questionId !== undefined && record.questionId !== questionId),
  );
  if (kept.length !== records.length) writeRecords(kept);
}

export function clearInFlightTurnRuns(): void {
  writeRecords([]);
}
