#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireFile(relativePath) {
  if (!exists(relativePath)) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

function requireIncludes(relativePath, text) {
  if (!exists(relativePath)) return;
  const body = readText(relativePath);
  if (!body.includes(text)) {
    errors.push(`${relativePath} must include ${JSON.stringify(text)}`);
  }
}

const requiredFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/agent-context/README.md',
  'docs/agent-context/bug-finding-guide.md',
  'docs/agent-context/known-flaws.md',
  'docs/agent-context/repo-map.json',
  'docs/agent-context/risk-map.json',
  'docs/agent-context/commands.json',
  'docs/agent-context/doc-status.json',
];

for (const file of requiredFiles) {
  requireFile(file);
}

requireIncludes('AGENTS.md', 'docs/agent-context/');
requireIncludes('AGENTS.md', 'known-flaws.md');
requireIncludes('CLAUDE.md', 'AGENTS.md');
requireIncludes('CLAUDE.md', 'Claude-specific notes');

const repoMap = readJson('docs/agent-context/repo-map.json');
if (repoMap) {
  if (repoMap.canonicalAgentDoc !== 'AGENTS.md') {
    errors.push('repo-map.json canonicalAgentDoc must be AGENTS.md');
  }
  for (const surface of repoMap.surfaces ?? []) {
    for (const key of ['name', 'path', 'owner', 'purpose', 'primaryChecks']) {
      if (!surface[key] || (Array.isArray(surface[key]) && surface[key].length === 0)) {
        errors.push(`repo-map.json surface ${surface.name ?? '<unknown>'} missing ${key}`);
      }
    }
    if (surface.path && !exists(surface.path)) {
      errors.push(`repo-map.json surface path does not exist: ${surface.path}`);
    }
  }
  for (const area of repoMap.platform ?? []) {
    if (area.path && !exists(area.path)) {
      errors.push(`repo-map.json platform path does not exist: ${area.path}`);
    }
  }
}

const riskMap = readJson('docs/agent-context/risk-map.json');
if (riskMap) {
  for (const risk of riskMap.risks ?? []) {
    for (const key of ['id', 'severity', 'owner', 'paths', 'reviewFocus', 'checks']) {
      if (!risk[key] || (Array.isArray(risk[key]) && risk[key].length === 0)) {
        errors.push(`risk-map.json risk ${risk.id ?? '<unknown>'} missing ${key}`);
      }
    }
  }
}

const commands = readJson('docs/agent-context/commands.json');
if (commands) {
  for (const commandKey of ['lint', 'typecheckAll', 'agentContext', 'repoOrganization', 'boundaries']) {
    if (!commands.repoWide?.[commandKey]) {
      errors.push(`commands.json repoWide missing ${commandKey}`);
    }
  }
}

const docStatus = readJson('docs/agent-context/doc-status.json');
if (docStatus) {
  for (const docPath of docStatus.currentSourcesOfTruth ?? []) {
    if (!exists(docPath)) {
      errors.push(`doc-status.json current source does not exist: ${docPath}`);
    }
  }
  for (const evidencePath of docStatus.currentEvidence ?? []) {
    if (!exists(evidencePath)) {
      errors.push(`doc-status.json evidence source does not exist: ${evidencePath}`);
    }
  }
}

const knownFlaws = exists('docs/agent-context/known-flaws.md')
  ? readText('docs/agent-context/known-flaws.md')
  : '';
for (const requiredId of ['AGENT-DOC-01', 'ORG-ROOT-01', 'BOUNDARY-01', 'PRIVACY-01']) {
  if (!knownFlaws.includes(requiredId)) {
    errors.push(`known-flaws.md must include ${requiredId}`);
  }
}

if (errors.length > 0) {
  console.error('Agent context check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Agent context check passed.');
