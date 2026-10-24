#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REGISTER = 'audit/registers/known-flaws.md';
const BLOCKERS = 'audit/blockers';
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const MAX_LISTED = 20;

const root = process.cwd();

let markdown;
try {
  markdown = fs.readFileSync(path.join(root, REGISTER), 'utf8');
} catch (error) {
  console.error(
    `Audit progress check failed: cannot read ${path.join(root, REGISTER)} (${error.code ?? error.message}).`,
  );
  console.error('Run this command from the repository root.');
  process.exit(1);
}

let blockers = [];
try {
  blockers = fs
    .readdirSync(path.join(root, BLOCKERS), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${BLOCKERS}/${entry.name}`)
    .sort();
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.error(
      `Audit progress check failed: cannot list ${BLOCKERS} (${error.code ?? error.message}).`,
    );
    process.exit(1);
  }
}

/** @type {{ char: string, length: number, line: number } | null} */
let fence = null;
let sawTableHeader = false;
const rows = [];
const unparseable = [];
/** @type {Map<string, number[]>} */
const declarations = new Map();

const lines = markdown.split('\n');
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const lineNumber = index + 1;

  const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (fenceMatch) {
    const marker = fenceMatch[1];
    if (fence === null) {
      fence = { char: marker[0], length: marker.length, line: lineNumber };
    } else if (
      marker[0] === fence.char &&
      marker.length >= fence.length &&
      fenceMatch[2].trim() === ''
    ) {
      fence = null;
    }
    continue;
  }
  if (fence) continue;
  if (!line.startsWith('|')) continue;

  const cells = line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
  if (cells.length < 2) continue;
  if (cells[0] === 'id' && cells[1] === 'severity') {
    sawTableHeader = true;
    continue;
  }
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;

  const [id, severity] = cells;
  if (!id || !SEVERITIES.includes(severity)) {
    unparseable.push(lineNumber);
    continue;
  }
  rows.push({ id, severity });
  const at = declarations.get(id);
  if (at) at.push(lineNumber);
  else declarations.set(id, [lineNumber]);
}

const integrity = [];

if (fence !== null) {
  integrity.push(
    `unclosed ${fence.char.repeat(fence.length)} code fence opened at line ${fence.line}, ` +
      'every row after it was invisible to this check',
  );
}

if (!sawTableHeader) {
  integrity.push(`${REGISTER} has no "| id | severity |" table header, so no row can be read`);
}

if (unparseable.length > 0) {
  integrity.push(
    `${unparseable.length} table row${unparseable.length === 1 ? '' : 's'} with no id or a severity ` +
      `outside ${SEVERITIES.join(', ')} (line${unparseable.length === 1 ? '' : 's'} ` +
      `${unparseable.slice(0, 5).join(', ')}${unparseable.length > 5 ? ', …' : ''})`,
  );
}

const duplicated = [...declarations].filter(([, at]) => at.length > 1);
if (duplicated.length > 0) {
  const sample = duplicated
    .slice(0, 5)
    .map(([id, at]) => `${id} (lines ${at.join(', ')})`)
    .join('; ');
  integrity.push(
    `${duplicated.length} flaw ID${duplicated.length === 1 ? ' is' : 's are'} listed more than ` +
      `once, so every count below is inflated: ${sample}` +
      (duplicated.length > 5 ? `; …and ${duplicated.length - 5} more` : ''),
  );
}

if (integrity.length > 0) {
  console.error(
    `Audit progress check failed: ${REGISTER} is not in a state this gate can measure.`,
  );
  for (const problem of integrity) console.error(`- ${problem}`);
  console.error('The register is the release stop gate; repair it before completing a release.');
  process.exit(1);
}

if (rows.length === 0 && blockers.length === 0) {
  console.log(
    `Audit progress check passed: ${REGISTER} has no open rows and ${BLOCKERS}/ is empty, all closed.`,
  );
  process.exit(0);
}

const bySeverity = SEVERITIES.map(
  (severity) => `${rows.filter((row) => row.severity === severity).length} ${severity}`,
).join(', ');

console.error(
  `Audit progress check failed: ${rows.length} open row${rows.length === 1 ? '' : 's'} in ${REGISTER} ` +
    `(${bySeverity}) and ${blockers.length} release blocker file${blockers.length === 1 ? '' : 's'} in ${BLOCKERS}/.`,
);
for (const file of blockers.slice(0, MAX_LISTED)) console.error(`- ${file}`);
if (blockers.length > MAX_LISTED) {
  console.error(`- ...and ${blockers.length - MAX_LISTED} more blocker files.`);
}
const severe = rows.filter((row) => row.severity === 'Critical' || row.severity === 'High');
for (const row of severe.slice(0, MAX_LISTED)) console.error(`- ${row.id} (${row.severity})`);
if (severe.length > MAX_LISTED) {
  console.error(`- ...and ${severe.length - MAX_LISTED} more Critical or High rows.`);
}
console.error(
  'Fix each flaw and delete its row, and each blocker file, before completing a release.',
);
process.exit(1);
