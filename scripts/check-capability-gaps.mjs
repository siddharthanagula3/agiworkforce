#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseCsv } from './ui-gaps-lib.mjs';

const root = process.cwd();
const csvPath = path.join(root, 'audit/capability-gaps.csv');
const expectedColumns = [
  'id',
  'concept',
  'sourceRecords',
  'auditClass',
  'effort',
  'lane',
  'decision',
  'status',
  'owner',
  'tracking',
];
const validAuditClasses = new Set([
  'absent',
  'planned',
  'partial-unwired',
  'implemented-unwired',
  'mixed',
]);
const validEfforts = new Set(['S', 'M', 'L']);
const validLanes = new Set([
  'Phase 1',
  'Phase 2',
  'Phase 3',
  'Deferred backlog',
  'Product decision',
  'Product divergence',
]);
const validDecisions = new Set(['Build', 'Wire', 'Wire or cut', 'Harden', 'Defer', 'Decline']);
const validStatuses = new Set([
  'Open',
  'In Progress',
  'Blocked',
  'Deferred',
  'Done',
  'Not Planned',
]);

function fail(errors) {
  console.error('Capability gap tracker check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (!fs.existsSync(csvPath)) fail(['audit/capability-gaps.csv is missing']);

let parsed;
try {
  parsed = parseCsv(fs.readFileSync(csvPath, 'utf8'));
} catch (error) {
  fail([`audit/capability-gaps.csv is invalid: ${error.message}`]);
}

const errors = [];
if (JSON.stringify(parsed.columns) !== JSON.stringify(expectedColumns)) {
  errors.push(`columns must be exactly: ${expectedColumns.join(', ')}`);
}
if (parsed.records.length < 44) {
  errors.push(`tracker must retain at least the 44 reconciled baseline rows`);
}

const ids = new Set();
const concepts = new Set();
for (const [index, record] of parsed.records.entries()) {
  const row = index + 2;
  const expectedId = `CAP-${String(index + 1).padStart(3, '0')}`;
  if (record.id !== expectedId) errors.push(`row ${row} must use sequential id ${expectedId}`);
  if (ids.has(record.id)) errors.push(`row ${row} duplicates id ${record.id}`);
  ids.add(record.id);

  const normalizedConcept = record.concept.trim().toLowerCase();
  if (!normalizedConcept) errors.push(`row ${row} has an empty concept`);
  if (concepts.has(normalizedConcept))
    errors.push(`row ${row} duplicates concept ${record.concept}`);
  concepts.add(normalizedConcept);

  if (!record.sourceRecords.trim()) errors.push(`row ${row} must identify source records`);
  if (!validAuditClasses.has(record.auditClass)) {
    errors.push(`row ${row} has invalid auditClass ${record.auditClass}`);
  }
  if (!validEfforts.has(record.effort))
    errors.push(`row ${row} has invalid effort ${record.effort}`);
  if (!validLanes.has(record.lane)) errors.push(`row ${row} has invalid lane ${record.lane}`);
  if (!validDecisions.has(record.decision)) {
    errors.push(`row ${row} has invalid decision ${record.decision}`);
  }
  if (!validStatuses.has(record.status))
    errors.push(`row ${row} has invalid status ${record.status}`);
  if (!record.owner.trim()) errors.push(`row ${row} must have an owner`);
  if (record.tracking.trim().length < 30) {
    errors.push(`row ${row} must contain a substantive tracking note`);
  }
  if (record.status === 'Not Planned' && record.decision !== 'Decline') {
    errors.push(`row ${row} may be Not Planned only with a Decline decision`);
  }
  if (record.status === 'Deferred' && record.decision === 'Decline') {
    errors.push(`row ${row} must use Not Planned for a declined capability`);
  }
}

if (errors.length > 0) fail(errors);

const tally = {};
for (const record of parsed.records) tally[record.status] = (tally[record.status] ?? 0) + 1;
console.log(`Capability gap tracker valid: ${parsed.records.length} records.`);
for (const [status, count] of Object.entries(tally)) console.log(`${status.padEnd(11)} ${count}`);
