/**
 * Recorded responses and the no-network replay responder.
 *
 * A live run writes every response it graded, keyed by case id and pinned to
 * the fingerprint of the request that produced it. Replay grades those
 * responses again without calling anything, so CI re-checks graders and
 * corpora against real answers deterministically. A recording whose request no
 * longer matches the corpus fails instead of replaying: grading an old answer
 * against a new question would report a score for a test nobody ran.
 *
 * @module evals/replay
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';

import { DEFAULT_MAX_OUTPUT_TOKENS, buildRequest, fingerprintRequest } from './request';
import type { EvalDataset, ModelResponse, Responder } from './types';

export const RECORDING_SCHEMA_VERSION = 1;

export type RecordingSource = 'live' | 'reference';

export interface RecordedResponse {
  readonly fingerprint: string;
  readonly response: ModelResponse;
}

export interface Recording {
  readonly schemaVersion: number;
  readonly source: RecordingSource;
  /**
   * The run that produced this recording, absent on recordings made before
   * runs were correlated and on the hand-written reference.
   */
  readonly runId: string | null;
  readonly modelKey: string | null;
  readonly routeId: string | null;
  readonly recordedOn: string | null;
  readonly responses: Readonly<Record<string, RecordedResponse>>;
  /**
   * Cases graded in this run whose answer was deliberately not written down.
   *
   * A live run of the safety corpora produces, when the model complies, exactly
   * the text the corpus exists to catch: working instructions for the thing that
   * was asked. The score belongs in the repository; the answer does not. Every
   * case whose expected behaviour is a refusal is therefore graded, counted in
   * the run report, and then dropped from the recording with its id listed here.
   * The hand-written reference recording still carries refusal answers, so the
   * graders stay covered by replay.
   */
  readonly withheld: readonly string[];
}

export const WITHHELD_REASON = 'withheld from the recording: a safety corpus answer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`recording ${field} must be a non-empty string or null`);
  }
  return value;
}

export function parseRecording(raw: unknown): Recording {
  if (!isRecord(raw)) throw new Error('recording must be an object');
  if (raw['schemaVersion'] !== RECORDING_SCHEMA_VERSION) {
    throw new Error(`recording schemaVersion must be ${RECORDING_SCHEMA_VERSION}`);
  }
  const source = raw['source'];
  if (source !== 'live' && source !== 'reference') {
    throw new Error('recording source must be live or reference');
  }
  const responses = raw['responses'];
  if (!isRecord(responses)) throw new Error('recording responses must be an object');
  for (const [id, entry] of Object.entries(responses)) {
    if (
      !isRecord(entry) ||
      typeof entry['fingerprint'] !== 'string' ||
      !isRecord(entry['response']) ||
      typeof entry['response']['text'] !== 'string'
    ) {
      throw new Error(`recorded response ${id} must carry a fingerprint and a text response`);
    }
  }
  const withheld = raw['withheld'] ?? [];
  if (!Array.isArray(withheld) || withheld.some((id) => typeof id !== 'string')) {
    throw new Error('recording withheld must be a list of case ids');
  }
  const recording: Recording = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    source,
    runId: nullableString(raw['runId'] ?? null, 'runId'),
    modelKey: nullableString(raw['modelKey'], 'modelKey'),
    routeId: nullableString(raw['routeId'], 'routeId'),
    recordedOn: nullableString(raw['recordedOn'], 'recordedOn'),
    responses: responses as unknown as Record<string, RecordedResponse>,
    withheld: withheld as readonly string[],
  };
  if (recording.source === 'live' && recording.modelKey === null) {
    throw new Error('a live recording must name the model it measured');
  }
  return recording;
}

export function readRecording(path: string): Recording {
  return parseRecording(JSON.parse(readFileSync(path, 'utf8')));
}

export function caseFingerprint(dataset: EvalDataset, caseId: string): string {
  const evalCase = dataset.cases.find((entry) => entry.id === caseId);
  if (evalCase === undefined) throw new Error(`no case ${caseId} in ${dataset.suite}`);
  return fingerprintRequest(
    buildRequest(evalCase, dataset.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );
}

export function replayResponder(recording: Recording, dataset: EvalDataset): Responder {
  return async (evalCase) => {
    const recorded = recording.responses[evalCase.id];
    if (recorded === undefined) {
      throw new Error(`recording has no response for ${evalCase.id}`);
    }
    if (recorded.fingerprint !== caseFingerprint(dataset, evalCase.id)) {
      throw new Error(
        `recording for ${evalCase.id} is stale: the request changed after it was recorded`,
      );
    }
    return recorded.response;
  };
}
