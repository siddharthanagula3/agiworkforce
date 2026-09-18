/**
 * Runs a set of suites and assembles the run report, for both live and replay.
 *
 * @module evals/run
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

import {
  capabilitySkipReason,
  contextSkipReason,
  unsupportedSuiteReason,
  type LiveTarget,
} from './live';
import type { RetryCost } from './metrics';
import { partialResponseOf } from './provider';
import { buildRunReport, type RunIdentity, type RunReport } from './report';
import {
  caseFingerprint,
  RECORDING_SCHEMA_VERSION,
  WITHHELD_REASON,
  type Recording,
  replayResponder,
} from './replay';
import { runSuite } from './suite';
import type { AttemptContext, EvalDataset, Responder, SuiteName, SuiteReport } from './types';

export type { AttemptContext };

export const MAX_ATTEMPTS_PER_CASE = 3;

/**
 * One call to a model for one row, distinct from the graded result of the row.
 *
 * A case that answered on its third try is one `CaseResult` and three
 * `EvalAttempt`s: the two discarded ones are what a retry costs, and without
 * them a run report prices only the answers it kept.
 */
export interface EvalAttempt {
  readonly runId: string;
  /**
   * `<runId>/<caseId>#<attempt>`, the id this call is tagged with on the
   * provider request, so one row of a report can be found in the logs of the
   * call that produced it.
   */
  readonly correlationId: string;
  readonly suite: SuiteName;
  readonly caseId: string;
  readonly attempt: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly costUsd: number | null;
  readonly graded: boolean;
  readonly failure?: string;
}

export function correlationIdFor(runId: string, caseId: string, attempt: number): string {
  return `${runId}/${caseId}#${attempt}`;
}

interface AttemptRecorder {
  readonly responder: (dataset: EvalDataset, respond: Responder) => Responder;
  readonly attempts: () => readonly EvalAttempt[];
  readonly costsFor: (suite: SuiteName) => readonly RetryCost[];
}

function attemptRecorder(runId: string, now: () => number = () => Date.now()): AttemptRecorder {
  const attempts: EvalAttempt[] = [];
  return {
    attempts: () => attempts,
    costsFor: (suite) =>
      attempts
        .filter((entry) => entry.suite === suite)
        .map((entry) => ({ graded: entry.graded, costUsd: entry.costUsd })),
    responder: (dataset, respond) => async (evalCase) => {
      for (let attempt = 1; ; attempt += 1) {
        const startedAt = now();
        const context: AttemptContext = {
          runId,
          correlationId: correlationIdFor(runId, evalCase.id, attempt),
          attempt,
        };
        try {
          const response = await respond(evalCase, context);
          attempts.push({
            ...context,
            suite: dataset.suite,
            caseId: evalCase.id,
            startedAt: new Date(startedAt).toISOString(),
            durationMs: now() - startedAt,
            costUsd: response.costUsd ?? null,
            graded: true,
          });
          return response;
        } catch (error) {
          const partial = partialResponseOf(error);
          attempts.push({
            ...context,
            suite: dataset.suite,
            caseId: evalCase.id,
            startedAt: new Date(startedAt).toISOString(),
            durationMs: now() - startedAt,
            costUsd: partial?.costUsd ?? null,
            graded: false,
            failure: error instanceof Error ? error.message : String(error),
          });
          if (attempt >= MAX_ATTEMPTS_PER_CASE) throw error;
        }
      }
    },
  };
}

export interface RunOutcome {
  readonly reports: readonly SuiteReport[];
  readonly report: RunReport;
  readonly attempts: readonly EvalAttempt[];
}

export interface ReplayOptions {
  readonly runId?: string;
}

export async function runReplay(
  datasets: readonly EvalDataset[],
  recording: Recording,
  options: ReplayOptions = {},
): Promise<RunOutcome> {
  const runId = options.runId ?? randomUUID();
  const recorder = attemptRecorder(runId);
  const reports: SuiteReport[] = [];
  const unsupported: Partial<Record<SuiteName, string>> = {};
  const withheld = new Set(recording.withheld);
  const absent = (caseId: string): string =>
    withheld.has(caseId) ? WITHHELD_REASON : 'not in this recording';
  for (const dataset of datasets) {
    const recorded = dataset.cases.filter((entry) => recording.responses[entry.id] !== undefined);
    if (recording.source === 'live' && recorded.length === 0) {
      unsupported[dataset.suite] = dataset.cases.every((entry) => withheld.has(entry.id))
        ? WITHHELD_REASON
        : 'not in this recording';
      continue;
    }
    reports.push(
      await runSuite(dataset, recorder.responder(dataset, replayResponder(recording, dataset)), {
        skip: (evalCase) =>
          recording.source === 'live' && recording.responses[evalCase.id] === undefined
            ? absent(evalCase.id)
            : null,
        attempts: () => recorder.costsFor(dataset.suite),
      }),
    );
  }
  const identity: RunIdentity = {
    source: 'replay',
    recordingSource: recording.source,
    runId,
    modelKey: recording.modelKey,
    routeId: recording.routeId,
    recordedOn: recording.recordedOn,
  };
  return {
    reports,
    report: buildRunReport(identity, reports, unsupported),
    attempts: recorder.attempts(),
  };
}

export interface LiveRunOptions {
  readonly target: LiveTarget;
  readonly recordedOn: string;
  readonly responderFor: (dataset: EvalDataset) => Responder;
  readonly runId?: string;
}

export interface LiveRunOutcome extends RunOutcome {
  readonly recording: Recording;
}

export async function runLive(
  datasets: readonly EvalDataset[],
  options: LiveRunOptions,
): Promise<LiveRunOutcome> {
  const runId = options.runId ?? randomUUID();
  const recorder = attemptRecorder(runId);
  const reports: SuiteReport[] = [];
  const unsupported: Partial<Record<SuiteName, string>> = {};
  const responses: Record<string, Recording['responses'][string]> = {};
  const withheld: string[] = [];
  for (const dataset of datasets) {
    const reason = unsupportedSuiteReason(dataset, options.target);
    if (reason !== null) {
      unsupported[dataset.suite] = reason;
      continue;
    }
    const respond = recorder.responder(dataset, options.responderFor(dataset));
    const recordingResponder: Responder = async (evalCase, context) => {
      const response = await respond(evalCase, context);
      if (evalCase.expected === 'refusal') {
        withheld.push(evalCase.id);
        return response;
      }
      responses[evalCase.id] = {
        fingerprint: caseFingerprint(dataset, evalCase.id),
        response,
      };
      return response;
    };
    reports.push(
      await runSuite(dataset, recordingResponder, {
        skip: (evalCase) =>
          capabilitySkipReason(evalCase, options.target) ??
          contextSkipReason(dataset, evalCase, options.target),
        attempts: () => recorder.costsFor(dataset.suite),
      }),
    );
  }
  const identity: RunIdentity = {
    source: 'live',
    recordingSource: 'live',
    runId,
    modelKey: options.target.modelKey,
    routeId: options.target.routeId,
    recordedOn: options.recordedOn,
  };
  const recording: Recording = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    source: 'live',
    runId,
    modelKey: options.target.modelKey,
    routeId: options.target.routeId,
    recordedOn: options.recordedOn,
    responses,
    withheld,
  };
  return {
    reports,
    report: buildRunReport(identity, reports, unsupported),
    recording,
    attempts: recorder.attempts(),
  };
}
