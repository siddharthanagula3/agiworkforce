#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const packageJsonFiles = [];
const packageNames = new Set();
const ignoredDirs = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'target',
]);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
      continue;
    }

    if (entry.isFile() && entry.name === 'package.json') {
      packageJsonFiles.push(path.join(dir, entry.name));
    }
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function pnpmFilters(script) {
  const filters = [];
  const filterPattern = /--filter(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;
  for (const match of script.matchAll(filterPattern)) {
    filters.push(match[1] ?? match[2] ?? match[3]);
  }
  return filters;
}

function shouldValidateFilter(filter) {
  return (
    filter &&
    !filter.startsWith('.') &&
    !filter.includes('*') &&
    !filter.includes('{') &&
    !filter.includes('}')
  );
}

walk(root);

for (const filePath of packageJsonFiles) {
  const json = readJson(filePath);
  if (json?.name) {
    packageNames.add(json.name);
  }
}

for (const filePath of packageJsonFiles) {
  const relativePath = path.relative(root, filePath);
  const json = readJson(filePath);
  if (!json?.scripts) continue;

  for (const [scriptName, script] of Object.entries(json.scripts)) {
    if (typeof script !== 'string') continue;
    for (const rawFilter of pnpmFilters(script)) {
      const filter = rawFilter.startsWith('!') ? rawFilter.slice(1) : rawFilter;
      if (shouldValidateFilter(filter) && !packageNames.has(filter)) {
        errors.push(
          `${relativePath} script ${scriptName} references missing pnpm filter ${rawFilter}`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Workspace script check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Workspace script check passed.');
