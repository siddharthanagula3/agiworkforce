#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  csvSha256,
  parseCsv,
  UI_GAP_COLUMNS,
  UI_GAP_SEVERITIES,
  UI_GAP_STATUSES,
  UI_GAP_SURFACES,
  UI_GAP_TYPES,
  unresolvedSeverityTally,
} from './ui-gaps-lib.mjs';

const root = process.cwd();
const csvPath = path.join(root, 'audit/ui-gaps.csv');
const markdownPath = path.join(root, 'audit/ui-gaps.md');
const baselinePath = path.join(root, 'audit/ui-gaps-baseline.json');
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function expectedIds() {
  const ids = [];
  for (let number = 1; number <= 342; number += 1) {
    if (number !== 5) ids.push(`GAP-${String(number).padStart(3, '0')}`);
  }
  return ids;
}

function validateTracker(csv, baseline) {
  let parsed;
  try {
    parsed = parseCsv(csv);
  } catch (error) {
    errors.push(`audit/ui-gaps.csv is invalid: ${error.message}`);
    return [];
  }

  if (JSON.stringify(parsed.columns) !== JSON.stringify(UI_GAP_COLUMNS)) {
    errors.push(`CSV columns must be exactly: ${UI_GAP_COLUMNS.join(', ')}`);
  }

  const ids = new Set();
  const severityTally = Object.fromEntries(UI_GAP_SEVERITIES.map((severity) => [severity, 0]));
  for (const [index, record] of parsed.records.entries()) {
    const label = record.id || `row ${index + 2}`;
    if (!/^GAP-\d{3}$/.test(record.id)) errors.push(`${label} has an invalid id`);
    if (ids.has(record.id)) errors.push(`${label} is duplicated`);
    ids.add(record.id);
    if (!UI_GAP_SEVERITIES.includes(record.severity)) {
      errors.push(`${label} has unknown severity ${JSON.stringify(record.severity)}`);
    } else {
      severityTally[record.severity] += 1;
    }
    if (!UI_GAP_SURFACES.includes(record.agiSurface)) {
      errors.push(`${label} has unknown surface ${JSON.stringify(record.agiSurface)}`);
    }
    if (!UI_GAP_TYPES.includes(record.gapType)) {
      errors.push(`${label} has unknown type ${JSON.stringify(record.gapType)}`);
    }
    if (!UI_GAP_STATUSES.includes(record.status)) {
      errors.push(`${label} has unknown status ${JSON.stringify(record.status)}`);
    }
    if (!record.owner.trim()) errors.push(`${label} must have an owner or Unassigned`);
    for (const field of ['title', 'detail', 'evidence', 'suggestedFix', 'image']) {
      if (!record[field].trim()) errors.push(`${label} is missing ${field}`);
    }
    for (const value of Object.values(record)) {
      if (value.includes('/tmp/agiw'))
        errors.push(`${label} contains a machine-local /tmp/agiw path`);
    }
  }

  const actualIds = [...ids].sort();
  const requiredIds = expectedIds().sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(requiredIds)) {
    errors.push(
      'tracker identities must be GAP-001..GAP-342 with merged duplicate GAP-005 omitted',
    );
  }
  if (parsed.records.find((record) => record.id === 'GAP-004')?.mergedFrom !== 'GAP-005') {
    errors.push('GAP-004 must preserve the GAP-005 merge in mergedFrom');
  }
  if (parsed.records.some((record) => record.id !== 'GAP-004' && record.mergedFrom)) {
    errors.push('only the confirmed GAP-004/GAP-005 duplicate merge is allowed');
  }

  for (const severity of UI_GAP_SEVERITIES) {
    if (severityTally[severity] !== baseline.normalizedSeverityCounts[severity]) {
      errors.push(
        `${severity} identity count changed: expected ${baseline.normalizedSeverityCounts[severity]}, found ${severityTally[severity]}`,
      );
    }
  }

  const unresolved = unresolvedSeverityTally(parsed.records);
  for (const severity of ['P0', 'P1']) {
    if (unresolved[severity] > baseline.maxUnresolved[severity]) {
      errors.push(
        `${severity} unresolved count ${unresolved[severity]} exceeds baseline maximum ${baseline.maxUnresolved[severity]}`,
      );
    }
  }

  return parsed.records;
}

function comparisonRef() {
  const explicitIndex = process.argv.indexOf('--against');
  if (explicitIndex >= 0) {
    const explicit = process.argv[explicitIndex + 1];
    if (!explicit) errors.push('--against requires a Git ref');
    return explicit;
  }
  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_EVENT_PATH) {
    try {
      const event = readJson(process.env.GITHUB_EVENT_PATH);
      if (event.before && !/^0+$/.test(event.before)) return event.before;
    } catch (error) {
      errors.push(`could not read GitHub event payload: ${error.message}`);
    }
  }
  return null;
}

function enforceMonotonic(records, ref) {
  if (!ref) {
    console.log('UI gap monotonic comparison skipped: no base ref in this environment.');
    return;
  }
  if (!/^[A-Za-z0-9._/@:^~+-]+$/.test(ref)) {
    errors.push(`refusing invalid comparison ref ${JSON.stringify(ref)}`);
    return;
  }

  const result = spawnSync('git', ['show', `${ref}:audit/ui-gaps.csv`], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.log(`UI gap baseline established: ${ref} has no audit/ui-gaps.csv.`);
    return;
  }

  let previous;
  try {
    previous = parseCsv(result.stdout).records;
  } catch (error) {
    errors.push(`could not parse UI gap tracker from ${ref}: ${error.message}`);
    return;
  }
  const before = unresolvedSeverityTally(previous);
  const after = unresolvedSeverityTally(records);
  for (const severity of ['P0', 'P1']) {
    if (after[severity] > before[severity]) {
      errors.push(
        `${severity} unresolved gaps increased from ${before[severity]} at ${ref} to ${after[severity]}`,
      );
    }
  }
  console.log(
    `UI gap monotonic comparison against ${ref}: P0 ${before.P0}→${after.P0}, P1 ${before.P1}→${after.P1}.`,
  );
}

for (const requiredPath of [csvPath, markdownPath, baselinePath]) {
  if (!fs.existsSync(requiredPath)) errors.push(`missing ${path.relative(root, requiredPath)}`);
}

let records = [];
if (errors.length === 0) {
  try {
    const csv = fs.readFileSync(csvPath, 'utf8');
    const markdown = fs.readFileSync(markdownPath, 'utf8');
    const baseline = readJson(baselinePath);
    records = validateTracker(csv, baseline);
    const expectedHash = csvSha256(csv);
    if (!markdown.includes(`<!-- ui-gaps-csv-sha256: ${expectedHash} -->`)) {
      errors.push('audit/ui-gaps.md is stale; run pnpm generate:ui-gaps');
    }
  } catch (error) {
    errors.push(error.message);
  }
}

if (process.argv.includes('--monotonic') && records.length > 0) {
  enforceMonotonic(records, comparisonRef());
}

if (errors.length > 0) {
  console.error('UI gap tracker check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const unresolved = unresolvedSeverityTally(records);
console.log(
  `UI gap tracker valid: ${records.length} records; unresolved P0 ${unresolved.P0}, P1 ${unresolved.P1}.`,
);
