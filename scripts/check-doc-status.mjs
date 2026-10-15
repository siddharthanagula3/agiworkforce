#!/usr/bin/env node
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { markdownProseLines } from './lib/comment-scan.mjs';

const root = process.cwd();
const errors = [];
const warnings = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const docStatus = readJson('docs/agent-context/doc-status.json');
const currentDocs = [
  ...(docStatus.currentSourcesOfTruth ?? []),
  ...(docStatus.currentEvidence ?? []),
].filter((docPath) => docPath.endsWith('.md'));

const headerDebt = new Set([]);

const requiredFields = ['Status', 'Owner', 'Last updated'];

function metadataHeader(source) {
  const fields = new Map();
  let titleSeen = false;
  for (const { text } of markdownProseLines(source)) {
    if (text.trim() === '') continue;
    if (!titleSeen && fields.size === 0 && /^ {0,3}# [^#]/.test(text)) {
      titleSeen = true;
      continue;
    }
    const field =
      /^ {0,3}(?:(Status|Owner|Last updated):|\*\*(Status|Owner|Last updated):\*\*|\*\*(Status|Owner|Last updated)\*\*:)[ \t]*(.*)$/.exec(
        text,
      );
    if (field) {
      const name = field[1] ?? field[2] ?? field[3];
      const values = fields.get(name) ?? [];
      values.push(field[4].trim());
      fields.set(name, values);
    } else if (!/^ {0,3}[A-Za-z][A-Za-z /-]*:/.test(text)) {
      break;
    }
  }
  return fields;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

for (const docPath of currentDocs) {
  const absolutePath = path.join(root, docPath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Current doc is missing: ${docPath}`);
    continue;
  }

  const fields = metadataHeader(fs.readFileSync(absolutePath, 'utf8'));
  for (const field of requiredFields) {
    const values = fields.get(field) ?? [];
    if (values.length !== 1 || values[0] === '') {
      if (headerDebt.has(docPath)) {
        warnings.push(`Known current-doc metadata debt: ${docPath} invalid ${field}`);
      } else {
        errors.push(`Current doc requires one nonempty ${field} header: ${docPath}`);
      }
    }
  }
  const updated = fields.get('Last updated')?.[0];
  if (updated !== undefined && !isCalendarDate(updated)) {
    errors.push(`Current doc has an invalid Last updated calendar date: ${docPath}`);
  }
}

if (errors.length > 0) {
  console.error('Doc status check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\nDoc status warnings:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('Doc status check passed with known metadata debt:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
} else {
  console.log('Doc status check passed.');
}
