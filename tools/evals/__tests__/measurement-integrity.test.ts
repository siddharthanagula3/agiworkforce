/**
 * The write-once rule over committed measurements.
 *
 * @module evals/tests/measurement-integrity
 * @packageDocumentation
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  auditMeasurements,
  digestOf,
  readLedger,
  recordMeasurement,
  stamp,
  verifyArtifact,
} from '../scripts/measurement-integrity.mjs';

let dir: string;
let ledgerFile: string;

const report = {
  schemaVersion: 2,
  source: 'live',
  recordingSource: 'live',
  runId: 'run-one',
  modelKey: 'model-under-test',
  routeId: 'provider/model-under-test',
  recordedOn: '2026-09-18',
  measuredAt: '2026-09-18T04:05:06.000Z',
  suites: {
    golden: {
      version: 1,
      priority: 'P0',
      score: 0.9,
      completeness: 0.95,
      met: true,
      measuredAt: '2026-09-18T04:05:06.000Z',
    },
  },
  unsupportedSuites: {},
};

function runFile(): string {
  return join(dir, 'runs', 'model-under-test.json');
}

function audit(): ReturnType<typeof auditMeasurements> {
  return auditMeasurements({ measurementsDir: dir, ledgerFile });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'evals-integrity-'));
  ledgerFile = join(dir, 'ledger.json');
  mkdirSync(join(dir, 'runs'), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('artefact digests', () => {
  it('ignores the integrity field itself when digesting', () => {
    const stamped = stamp(report);
    expect(verifyArtifact(stamped)).toBeNull();
    expect(stamped.integrity.digest).toBe(digestOf(report));
  });

  it('is stable under key order, so a reserialised file still verifies', () => {
    const { unsupportedSuites, ...rest } = report;
    const reordered = { unsupportedSuites, ...rest };
    expect(digestOf(reordered)).toBe(digestOf(report));
  });

  it('refuses an artefact whose content no longer matches its digest', () => {
    const edited = { ...stamp(report), recordedOn: '2026-01-01' };
    expect(verifyArtifact(edited)).toMatch(/does not match the recorded/);
  });

  it('refuses an artefact that carries no digest at all', () => {
    expect(verifyArtifact(report)).toMatch(/carries no integrity digest/);
  });
});

describe('the measurement ledger', () => {
  it('indexes every suite score with the date it was measured', () => {
    recordMeasurement(runFile(), report, { ledgerFile });
    const [entry] = readLedger(ledgerFile).entries;
    expect(entry?.path).toBe('runs/model-under-test.json');
    expect(entry?.runId).toBe('run-one');
    expect(entry?.suites?.['golden']).toEqual({
      version: 1,
      priority: 'P0',
      score: 0.9,
      completeness: 0.95,
      met: true,
      measuredAt: '2026-09-18T04:05:06.000Z',
    });
    expect(audit().passed).toBe(true);
  });

  it('refuses a measurement that is not in the ledger', () => {
    writeFileSync(runFile(), JSON.stringify(stamp(report)));
    const verdict = audit();
    expect(verdict.passed).toBe(false);
    expect(verdict.problems).toContain(
      'runs/model-under-test.json is not listed in the measurement ledger',
    );
  });

  it('refuses a ledger entry whose file has gone', () => {
    recordMeasurement(runFile(), report, { ledgerFile });
    rmSync(runFile());
    expect(audit().problems).toContain(
      'runs/model-under-test.json is in the ledger but no longer on disk',
    );
  });

  it('refuses a rewrite that keeps the run id of the measurement it replaces', () => {
    recordMeasurement(runFile(), report, { ledgerFile });
    const doctored = stamp({
      ...report,
      suites: { golden: { ...report.suites.golden, score: 1, met: true } },
    });
    writeFileSync(runFile(), JSON.stringify(doctored));

    const verdict = audit();
    expect(verdict.passed).toBe(false);
    expect(verdict.problems[0]).toMatch(/still claims run run-one/);
  });

  it('accepts a genuine re-measurement, which carries a new run id and date', () => {
    recordMeasurement(runFile(), report, { ledgerFile });
    recordMeasurement(
      runFile(),
      { ...report, runId: 'run-two', measuredAt: '2026-09-19T04:05:06.000Z' },
      { ledgerFile },
    );

    expect(audit().passed).toBe(true);
    expect(readLedger(ledgerFile).entries).toHaveLength(1);
    expect(readLedger(ledgerFile).entries[0]?.runId).toBe('run-two');
  });

  it('never launders an edit under --stamp: only missing entries are added', () => {
    recordMeasurement(runFile(), report, { ledgerFile });
    writeFileSync(
      runFile(),
      JSON.stringify(
        stamp({ ...report, suites: { golden: { ...report.suites.golden, score: 1 } } }),
      ),
    );
    const verdict = auditMeasurements({ measurementsDir: dir, ledgerFile, stampMissing: true });
    expect(verdict.passed).toBe(false);
    expect(readLedger(ledgerFile).entries[0]?.suites?.['golden']?.score).toBe(0.9);
  });
});
