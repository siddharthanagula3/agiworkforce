/**
 * Runs a set of suites and assembles the run report, for both live and replay.
 *
 * @module evals/run
 * @packageDocumentation
 */

import { contextSkipReason, unsupportedSuiteReason, type LiveTarget } from './live';
import { buildRunReport, type RunIdentity, type RunReport } from './report';
import {
  caseFingerprint,
  RECORDING_SCHEMA_VERSION,
  WITHHELD_REASON,
  type Recording,
  replayResponder,
} from './replay';
import { runSuite } from './suite';
import type { EvalDataset, Responder, SuiteName, SuiteReport } from './types';

export interface RunOutcome {
  readonly reports: readonly SuiteReport[];
  readonly report: RunReport;
}

export async function runReplay(
  datasets: readonly EvalDataset[],
  recording: Recording,
): Promise<RunOutcome> {
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
      await runSuite(dataset, replayResponder(recording, dataset), {
        skip: (evalCase) =>
          recording.source === 'live' && recording.responses[evalCase.id] === undefined
            ? absent(evalCase.id)
            : null,
      }),
    );
  }
  const identity: RunIdentity = {
    source: 'replay',
    recordingSource: recording.source,
    modelKey: recording.modelKey,
    routeId: recording.routeId,
    recordedOn: recording.recordedOn,
  };
  return { reports, report: buildRunReport(identity, reports, unsupported) };
}

export interface LiveRunOptions {
  readonly target: LiveTarget;
  readonly recordedOn: string;
  readonly responderFor: (dataset: EvalDataset) => Responder;
}

export interface LiveRunOutcome extends RunOutcome {
  readonly recording: Recording;
}

export async function runLive(
  datasets: readonly EvalDataset[],
  options: LiveRunOptions,
): Promise<LiveRunOutcome> {
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
    const respond = options.responderFor(dataset);
    const recordingResponder: Responder = async (evalCase) => {
      const response = await respond(evalCase);
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
        skip: (evalCase) => contextSkipReason(dataset, evalCase, options.target),
      }),
    );
  }
  const identity: RunIdentity = {
    source: 'live',
    recordingSource: 'live',
    modelKey: options.target.modelKey,
    routeId: options.target.routeId,
    recordedOn: options.recordedOn,
  };
  const recording: Recording = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    source: 'live',
    modelKey: options.target.modelKey,
    routeId: options.target.routeId,
    recordedOn: options.recordedOn,
    responses,
    withheld,
  };
  return { reports, report: buildRunReport(identity, reports, unsupported), recording };
}
