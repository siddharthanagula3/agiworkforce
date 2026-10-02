#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  CoverageError,
  qualifyInternalCoverage,
  validateCoverageEnvelope,
} from './lib/semgrep-coverage.mjs';
import { isCalendarDate } from './lib/calendar-date.mjs';

const args = process.argv.slice(2);
const errors = [];
const options = new Map();
const positional = [];
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--allowlist-only') {
    if (options.has(argument)) errors.push('Semgrep gate has a duplicate option.');
    options.set(argument, true);
  } else if (['--rule-bundle', '--source-context', '--expected-version'].includes(argument)) {
    const value = args[index + 1];
    if (options.has(argument) || !value || value.startsWith('--')) {
      errors.push('Semgrep gate has a missing or duplicate coverage option.');
    } else {
      options.set(argument, value);
      index += 1;
    }
  } else if (argument.startsWith('--')) {
    errors.push('Semgrep gate has an unrecognized option.');
  } else {
    positional.push(argument);
  }
}
if (positional.length > 2) errors.push('Semgrep gate has unexpected positional inputs.');
const allowlistOnly = options.has('--allowlist-only');
const coverageOptions = ['--rule-bundle', '--source-context', '--expected-version'];
if (
  coverageOptions.some((name) => options.has(name)) &&
  !coverageOptions.every((name) => options.has(name))
) {
  errors.push('Semgrep coverage requires rule, source and engine provenance together.');
}
if (
  options.has('--expected-version') &&
  !/^\d+\.\d+\.\d+$/.test(options.get('--expected-version'))
) {
  errors.push('Semgrep configured engine version is invalid.');
}
if (allowlistOnly && coverageOptions.some((name) => options.has(name))) {
  errors.push('Semgrep allowlist-only mode does not qualify report coverage.');
}
const resultsPath = path.resolve(process.cwd(), positional[0] ?? 'semgrep-results.json');
const allowlistPath = path.resolve(
  process.cwd(),
  positional[1] ?? 'scripts/semgrep-allowlist.json',
);

const option = (name) => options.get(name);

function fail(message) {
  errors.push(message);
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${filePath}. A missing report is not a clean scan.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    fail(`${label} at ${filePath} is not valid JSON.`);
    return null;
  }
}

function parseAllowlist(document) {
  if (!document || !Array.isArray(document.entries)) {
    fail(`${allowlistPath} must be an object with an "entries" array.`);
    return [];
  }

  const today = new Date().toISOString().slice(0, 10);
  const parsed = [];

  document.entries.forEach((entry, index) => {
    const label = `${allowlistPath} entries[${index}]`;
    if (typeof entry?.rule !== 'string' || entry.rule.length === 0) {
      fail(`${label} must set "rule" to the semgrep check id it accepts.`);
      return;
    }
    if (typeof entry.owner !== 'string' || !entry.owner.startsWith('@')) {
      fail(`${label} (${entry.rule}) must set "owner" to a GitHub handle or team.`);
      return;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      fail(`${label} (${entry.rule}) must set "reason" to why the finding is accepted.`);
      return;
    }
    if (!isCalendarDate(entry.expires)) {
      fail(
        `${label} (${entry.rule}) must set "expires" to a real calendar date in YYYY-MM-DD form.`,
      );
      return;
    }
    if (entry.expires < today) {
      fail(
        `${label} (${entry.rule}) expired on ${entry.expires}. ${entry.owner} must fix the finding or re-triage the acceptance.`,
      );
      return;
    }
    if (entry.paths !== undefined) {
      if (!Array.isArray(entry.paths) || entry.paths.some((value) => typeof value !== 'string')) {
        fail(`${label} (${entry.rule}) "paths" must be an array of repository-relative paths.`);
        return;
      }
      if (entry.paths.length === 0) {
        fail(`${label} (${entry.rule}) "paths" must not be empty; omit it to accept repo-wide.`);
        return;
      }
    }
    parsed.push({ ...entry, matched: 0 });
  });

  return parsed;
}

function matches(entry, finding) {
  if (entry.rule !== finding.check_id) return false;
  if (entry.paths === undefined) return true;
  return entry.paths.some((allowed) =>
    allowed.endsWith('/') ? finding.path.startsWith(allowed) : finding.path === allowed,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseReport(report) {
  if (!isRecord(report)) {
    fail('Semgrep report must be an object.');
    return null;
  }
  if (!isNonemptyString(report.version)) {
    fail('Semgrep report version must be a nonempty string.');
    return null;
  }
  if (!Array.isArray(report.results)) {
    fail('Semgrep report results must be an array.');
    return null;
  }
  if (!Array.isArray(report.errors)) {
    fail('Semgrep report errors must be an array.');
    return null;
  }
  if (report.errors.length > 0) {
    fail(
      `Semgrep report contains ${report.errors.length} scanner error(s). The scan is incomplete.`,
    );
    return null;
  }
  try {
    validateCoverageEnvelope(report);
  } catch (error) {
    fail(
      error instanceof CoverageError
        ? error.message
        : 'Semgrep internal coverage validation failed.',
    );
    return null;
  }
  if (
    !isRecord(report.paths) ||
    !Array.isArray(report.paths.scanned) ||
    report.paths.scanned.length === 0 ||
    report.paths.scanned.some((value) => !isNonemptyString(value))
  ) {
    fail('Semgrep report paths.scanned must be a nonempty array of nonempty strings.');
    return null;
  }

  let valid = true;
  report.results.forEach((finding, index) => {
    const label = `Semgrep report results[${index}]`;
    if (!isRecord(finding)) {
      fail(`${label} must be an object.`);
      valid = false;
      return;
    }
    if (!isNonemptyString(finding.check_id) || !isNonemptyString(finding.path)) {
      fail(`${label} must set nonempty string check_id and path fields.`);
      valid = false;
    }
    if (
      !isRecord(finding.start) ||
      !Number.isSafeInteger(finding.start.line) ||
      finding.start.line <= 0
    ) {
      fail(`${label} start.line must be a positive safe integer.`);
      valid = false;
    }
    if (
      !isRecord(finding.extra) ||
      !isNonemptyString(finding.extra.severity) ||
      typeof finding.extra.message !== 'string'
    ) {
      fail(`${label} extra must set a nonempty string severity and string message.`);
      valid = false;
    }
  });

  return valid ? report.results : null;
}

const allowlist = parseAllowlist(readJson(allowlistPath, 'Semgrep allowlist'));

if (!allowlistOnly) {
  const report = readJson(resultsPath, 'Semgrep report');
  const findings = parseReport(report);
  if (findings !== null && errors.length === 0) {
    try {
      const coverage = await qualifyInternalCoverage({
        report,
        reportPath: resultsPath,
        bundlePath: option('--rule-bundle'),
        contextPath: option('--source-context'),
        expectedVersion: option('--expected-version'),
      });
      if (coverage.nativeWarnings > 0) {
        console.log(
          `Semgrep coverage qualified ${coverage.convergedReplayPairs} exact rule/file pair(s) by complete native singleton replay and ${coverage.structurallyQualifiedPairs} by calibrated no-sink analysis; ${coverage.nativeWarnings} original non-convergence diagnostic(s) retained.`,
        );
      }
    } catch (error) {
      fail(
        error instanceof CoverageError
          ? error.message
          : 'Semgrep internal coverage validation failed.',
      );
    }
  }
  if (findings !== null && errors.length === 0) {
    const blocking = [];

    for (const finding of findings) {
      const entry = allowlist.find((candidate) => matches(candidate, finding));
      if (entry) {
        entry.matched += 1;
        continue;
      }
      blocking.push(finding);
    }

    for (const finding of blocking) {
      fail(
        `unaccepted: ${finding.path}:${finding.start.line} [${finding.extra.severity}] ${finding.check_id}`,
      );
    }

    for (const entry of allowlist) {
      if (entry.matched === 0) {
        fail(
          `stale: the allowlist entry for ${entry.rule} matched nothing. Delete it, an acceptance nobody can point at reads as reviewed when it is not.`,
        );
      }
    }

    if (errors.length === 0) {
      console.log(
        `Semgrep gate passed: ${findings.length} finding(s), every one accounted for by ${allowlist.length} reviewed allowlist entry(ies).`,
      );
    }
  }
} else if (errors.length === 0) {
  console.log(`Semgrep allowlist valid: ${allowlist.length} unexpired entry(ies).`);
}

if (errors.length > 0) {
  console.error('Semgrep gate FAILED:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error(
    `Fix the finding, or add an entry with rule, owner, expires and reason to ${allowlistPath}.`,
  );
  process.exit(1);
}
