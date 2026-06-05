#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const reportRoots = [
  {
    path: 'reports',
    purpose: 'product, parity, screenshot, and generated evidence reports',
    allowedRootFiles: ['README.md'],
  },
  {
    path: 'audit/reports',
    purpose: 'security, defect, dead-code, and remediation evidence reports',
    allowedRootFiles: ['README.md'],
  },
];

const requiredMarkers = ['Status:', 'Owner:', 'Purpose:', 'Retention:'];
// Lighter contract for allowlisted root control docs: must be owned + status-tracked.
const controlDocMarkers = ['Status:', 'Owner:'];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireReadme(relativePath) {
  const readmePath = path.posix.join(relativePath, 'README.md');
  if (!exists(readmePath)) {
    errors.push(`Missing report-retention README: ${readmePath}`);
    return;
  }

  const body = readText(readmePath);
  for (const marker of requiredMarkers) {
    if (!body.includes(marker)) {
      errors.push(`${readmePath} missing required retention marker: ${marker}`);
    }
  }
}

function childEntries(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  return fs.readdirSync(absoluteRoot, { withFileTypes: true }).sort((a, b) => {
    return a.name.localeCompare(b.name);
  });
}

for (const reportRoot of reportRoots) {
  if (!exists(reportRoot.path)) {
    errors.push(`Missing report root: ${reportRoot.path}`);
    continue;
  }

  requireReadme(reportRoot.path);

  const allowedRootFiles = reportRoot.allowedRootFiles || ['README.md'];
  for (const entry of childEntries(reportRoot.path)) {
    if (entry.name === 'README.md') continue;
    const entryPath = path.posix.join(reportRoot.path, entry.name);

    if (!entry.isDirectory()) {
      if (allowedRootFiles.includes(entry.name)) {
        const body = readText(entryPath);
        for (const marker of controlDocMarkers) {
          if (!body.includes(marker)) {
            errors.push(
              `${entryPath} is an allowlisted control report but is missing required marker: ${marker}`,
            );
          }
        }
        continue;
      }
      errors.push(
        `${entryPath} is a loose report file; move it into a named report collection with README retention metadata.`,
      );
      continue;
    }

    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
      errors.push(`${entryPath} must use lowercase kebab-case report collection naming.`);
    }

    requireReadme(entryPath);
  }

  const readmeBody = exists(path.posix.join(reportRoot.path, 'README.md'))
    ? readText(path.posix.join(reportRoot.path, 'README.md'))
    : '';
  if (!readmeBody.includes(reportRoot.purpose)) {
    errors.push(
      `${reportRoot.path}/README.md must describe this root as ${JSON.stringify(reportRoot.purpose)}.`,
    );
  }
}

if (errors.length > 0) {
  console.error('Report retention check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Report retention check passed.');
