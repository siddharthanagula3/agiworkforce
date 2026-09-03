#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const allowlistOnly = args.includes('--allowlist-only');
const positional = args.filter((value) => !value.startsWith('--'));
const resultsPath = path.resolve(process.cwd(), positional[0] ?? 'semgrep-results.json');
const allowlistPath = path.resolve(
  process.cwd(),
  positional[1] ?? 'scripts/semgrep-allowlist.json',
);

const errors = [];

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
  } catch (error) {
    fail(`${label} at ${filePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    if (typeof entry.expires !== 'string' || !DATE_PATTERN.test(entry.expires)) {
      fail(`${label} (${entry.rule}) must set "expires" to a YYYY-MM-DD date.`);
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

const allowlist = parseAllowlist(readJson(allowlistPath, 'Semgrep allowlist'));

if (!allowlistOnly) {
  const report = readJson(resultsPath, 'Semgrep report');
  const findings = Array.isArray(report?.results) ? report.results : [];
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
    const line = finding.start?.line ?? 0;
    const message = (finding.extra?.message ?? '').split('\n')[0];
    const severity = finding.extra?.severity ?? 'UNKNOWN';
    fail(`unaccepted: ${finding.path}:${line} [${severity}] ${finding.check_id}, ${message}`);
  }

  if (report) {
    for (const entry of allowlist) {
      if (entry.matched === 0) {
        fail(
          `stale: the allowlist entry for ${entry.rule} matched nothing. Delete it, an acceptance nobody can point at reads as reviewed when it is not.`,
        );
      }
    }
  }

  if (errors.length === 0) {
    console.log(
      `Semgrep gate passed: ${findings.length} finding(s), every one accounted for by ${allowlist.length} reviewed allowlist entry(ies).`,
    );
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
