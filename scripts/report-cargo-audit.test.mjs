import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { summarizeCargoAudit } from './report-cargo-audit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, 'scripts/report-cargo-audit.mjs');
const entry = {
  advisory: { id: 'RUSTSEC-2024-0449' },
  package: { name: 'unsafe-libyaml', version: '0.2.11' },
  kind: 'unmaintained',
};
const clean = () => ({
  vulnerabilities: { found: false, count: 0, list: [] },
  warnings: {},
});

test('maintenance warnings remain visible without failing a vulnerability-free report', () => {
  const report = clean();
  report.warnings.unmaintained = [entry];
  const result = summarizeCargoAudit(report);
  assert.equal(result.failed, false);
  assert.match(result.summary, /0 vulnerabilities; 1 warnings/);
  assert.match(result.summary, /RUSTSEC-2024-0449: unsafe-libyaml 0.2.11 \(unmaintained\)/);
});

test('any vulnerability fails even if a report also includes warnings', () => {
  const report = clean();
  report.vulnerabilities = { found: true, count: 1, list: [entry] };
  report.warnings.unmaintained = [entry];
  assert.equal(summarizeCargoAudit(report).failed, true);
});

test('missing, malformed, and contradictory audit results fail closed', () => {
  for (const report of [
    {},
    { ...clean(), vulnerabilities: { found: false, count: 1, list: [entry] } },
    { ...clean(), vulnerabilities: { found: true, count: 0, list: [] } },
    { ...clean(), warnings: { unmaintained: null } },
    { ...clean(), warnings: { unmaintained: [{}] } },
  ]) {
    assert.throws(() => summarizeCargoAudit(report), /cargo audit/);
  }
});

test('the CLI writes the job summary and preserves a blocking vulnerability outcome', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cargo-audit-report-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const reportFile = path.join(directory, 'report.json');
  const summaryFile = path.join(directory, 'summary.md');
  const report = clean();
  report.vulnerabilities = { found: true, count: 1, list: [entry] };
  writeFileSync(reportFile, JSON.stringify(report));
  const result = spawnSync(process.execPath, [SCRIPT, reportFile], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(readFileSync(summaryFile, 'utf8'), /1 vulnerabilities/);
});

test('the real workflow step preserves scanner failures and accepts only complete clean reports', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cargo-audit-step-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fakeCargo = path.join(directory, 'cargo');
  writeFileSync(fakeCargo, '#!/bin/sh\ncat "$AUDIT_FIXTURE"\nexit "$AUDIT_EXIT_STATUS"\n');
  chmodSync(fakeCargo, 0o755);
  const document = parse(readFileSync(path.join(ROOT, '.github/workflows/codeql.yml'), 'utf8'));
  const step = document.jobs['rust-security'].steps.find(
    (item) => item.name === 'Run cargo audit (CVE scanning)',
  );
  const warning = clean();
  warning.warnings.unmaintained = [entry];
  const vulnerable = clean();
  vulnerable.vulnerabilities = { found: true, count: 1, list: [entry] };
  for (const [report, status, expected] of [
    [warning, 0, 0],
    [vulnerable, 1, 1],
    [vulnerable, 0, 1],
    [clean(), 42, 42],
    [{}, 0, 1],
  ]) {
    const fixture = path.join(directory, 'fixture.json');
    writeFileSync(fixture, JSON.stringify(report));
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}${path.delimiter}${process.env.PATH}`,
        RUNNER_TEMP: directory,
        GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
        AUDIT_FIXTURE: fixture,
        AUDIT_EXIT_STATUS: String(status),
      },
    });
    assert.equal(result.status, expected, result.stdout + result.stderr);
  }
});
