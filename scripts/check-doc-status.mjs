#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

const requiredMarkers = ['Status:', 'Owner', 'Last updated:'];

for (const docPath of currentDocs) {
  const absolutePath = path.join(root, docPath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Current doc is missing: ${docPath}`);
    continue;
  }

  const body = fs.readFileSync(absolutePath, 'utf8');
  for (const marker of requiredMarkers) {
    if (!body.includes(marker)) {
      if (headerDebt.has(docPath)) {
        warnings.push(`Known current-doc metadata debt: ${docPath} missing ${marker}`);
      } else {
        errors.push(`Current doc missing ${marker}: ${docPath}`);
      }
    }
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
