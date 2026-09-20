#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import coverage from 'istanbul-lib-coverage';
import { parseProjects, parseRootFloor } from './lib/coverage-floors.mjs';

export function runCoverage(root) {
  const output = path.join(root, 'coverage');
  fs.mkdirSync(output, { recursive: true });
  for (const name of ['coverage-final.json', 'coverage-summary.json']) {
    fs.rmSync(path.join(output, name), { force: true });
  }
  const projects = parseProjects(fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf8'));
  const floor = parseRootFloor(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!projects.length || new Set(projects).size !== projects.length || floor === null) {
    throw new Error(
      'Coverage requires a nonempty, unique project list and a repository line floor.',
    );
  }
  const runDirectory = fs.mkdtempSync(path.join(output, 'run-'));
  const merged = coverage.createCoverageMap({});
  const failures = [];
  for (const [index, project] of projects.entries()) {
    const cwd = path.resolve(root, project);
    const reportsDirectory = path.join(runDirectory, String(index));
    try {
      const require = createRequire(path.join(cwd, 'package.json'));
      const runner = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
      console.log(`Coverage: ${project}`);
      const result = spawnSync(
        process.execPath,
        [
          runner,
          'run',
          '--coverage',
          '--coverage.reporter=json',
          '--coverage.reporter=text-summary',
          '--coverage.reportOnFailure',
          `--coverage.reportsDirectory=${reportsDirectory}`,
        ],
        { cwd, stdio: 'inherit', env: process.env },
      );
      if (result.error || result.status !== 0) {
        failures.push(
          `${project}: ${result.error?.message ?? result.signal ?? `exit ${result.status}`}`,
        );
      }
      const report = coverage.createCoverageMap(
        JSON.parse(fs.readFileSync(path.join(reportsDirectory, 'coverage-final.json'), 'utf8')),
      );
      if (!report.files().length) throw new Error('coverage report contains no files');
      merged.merge(report);
    } catch (error) {
      failures.push(`${project}: ${error.message}`);
    }
  }
  const summary = merged.getCoverageSummary().toJSON();
  if (!summary.lines.total || summary.lines.pct < floor) {
    failures.push(
      `Repository line coverage ${summary.lines.pct}% is below ${floor}% (${summary.lines.total} measured lines).`,
    );
  }
  fs.writeFileSync(path.join(output, 'coverage-final.json'), JSON.stringify(merged.toJSON()));
  fs.writeFileSync(
    path.join(output, 'coverage-summary.json'),
    `${JSON.stringify(
      {
        total: summary,
        projects,
        failures,
      },
      null,
      2,
    )}\n`,
  );
  fs.rmSync(runDirectory, { recursive: true, force: true });
  console.log(`Repository line coverage: ${summary.lines.pct}% (required: ${floor}%)`);
  for (const failure of failures) console.error(failure);
  return failures.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCoverage(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
