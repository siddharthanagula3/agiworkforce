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

function listFilesRecursive(relativeDir, predicate = () => true) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const out = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(relativePath, predicate));
    } else if (entry.isFile() && predicate(relativePath)) {
      out.push(relativePath);
    }
  }
  return out;
}

function collectOpencodeFileRefs(value, refs = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectOpencodeFileRefs(item, refs);
    return refs;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectOpencodeFileRefs(item, refs);
    return refs;
  }
  if (typeof value !== 'string') return refs;

  for (const match of value.matchAll(/\{file:([^}]+)\}/g)) {
    refs.push(match[1]);
  }
  return refs;
}

const requiredFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/agent-context/README.md',
  'docs/agent-context/agent-task-templates.md',
  'docs/agent-context/bug-finding-guide.md',
  'docs/agent-context/known-flaws.md',
  'docs/agent-context/repo-map.json',
  'docs/agent-context/risk-map.json',
  'docs/agent-context/lanes.json',
  'docs/agent-context/shared-files.md',
  'docs/agent-context/task-manifest.schema.json',
  'docs/agent-context/commands.json',
  'docs/agent-context/doc-status.json',
  'docs/current/README.md',
  'docs/current/product-suite.md',
  'docs/current/technical-architecture.md',
  'docs/current/commercial-and-launch.md',
  'docs/current/agent-and-repo-operability.md',
  'docs/engineering/README.md',
  'docs/engineering/naming-conventions.md',
  'docs/engineering/service-layer-architecture.md',
  'docs/engineering/agent-native-development.md',
  'docs/engineering/agent-harness-rollout.md',
  'docs/engineering/parallel-agent-playbook.md',
  'docs/engineering/autonomous-software-company-roadmap.md',
  'docs/research/agentic-company-research-prompts.md',
  '.github/PULL_REQUEST_TEMPLATE/parallel-agent-change.md',
  'docs/marketing/README.md',
  'docs/support/README.md',
  'docs/legal/README.md',
  'ios/README.md',
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE/product-surface.md',
  '.github/PULL_REQUEST_TEMPLATE/refactor-move.md',
  '.github/PULL_REQUEST_TEMPLATE/security-privacy.md',
  '.github/PULL_REQUEST_TEMPLATE/docs-research.md',
  '.github/PULL_REQUEST_TEMPLATE/release-infra.md',
  'apps/cli/AGENTS.md',
  'apps/web/AGENTS.md',
  'apps/mobile/AGENTS.md',
  'apps/desktop/AGENTS.md',
  'apps/extension/AGENTS.md',
  'apps/extension-vscode/AGENTS.md',
  'services/AGENTS.md',
  'packages/providers/AGENTS.md',
  '.opencode/opencode.json',
  '.opencode/instructions/INSTRUCTIONS.md',
];

for (const file of requiredFiles) {
  requireFile(file);
}

requireIncludes('AGENTS.md', 'docs/agent-context/');
requireIncludes('AGENTS.md', 'known-flaws.md');
requireIncludes('CLAUDE.md', 'AGENTS.md');
requireIncludes('CLAUDE.md', 'Claude-specific notes');
requireIncludes('CLAUDE.md', 'docs/engineering/naming-conventions.md');
requireIncludes('AGENTS.md', 'docs/engineering/agent-native-development.md');
requireIncludes('AGENTS.md', 'docs/engineering/naming-conventions.md');
requireIncludes('AGENTS.md', 'docs/engineering/agent-harness-rollout.md');
requireIncludes('AGENTS.md', 'docs/engineering/service-layer-architecture.md');
requireIncludes('AGENTS.md', 'Hooks And Local Gates');
requireIncludes('AGENTS.md', 'docs/agent-context/lanes.json');
requireIncludes('docs/current/README.md', 'Archived Source Material');
requireIncludes('docs/current/product-suite.md', 'Trust Modes');
requireIncludes('docs/current/technical-architecture.md', 'Enterprise Control Plane');
requireIncludes('docs/current/commercial-and-launch.md', 'Managed Credit Requirements');
requireIncludes('docs/current/agent-and-repo-operability.md', 'A+ Criteria');
requireIncludes('docs/current/agent-and-repo-operability.md', 'Hook Rules');
requireIncludes('docs/engineering/naming-conventions.md', 'Primary CLI command: `agi`.');
requireIncludes('docs/engineering/naming-conventions.md', '## Hooks');
requireIncludes(
  'docs/engineering/service-layer-architecture.md',
  'Actions/routes orchestrate domain rules.',
);
requireIncludes(
  'docs/engineering/service-layer-architecture.md',
  'Service functions own reusable mechanics.',
);
requireIncludes('docs/engineering/service-layer-architecture.md', 'pnpm check:service-layer');
requireIncludes('docs/engineering/agent-native-development.md', 'Worktree And Session Isolation');
requireIncludes('docs/engineering/agent-native-development.md', 'High-Risk Merge Gates');
requireIncludes('docs/engineering/agent-harness-rollout.md', 'Layer Order');
requireIncludes('docs/engineering/agent-harness-rollout.md', 'LSP');
requireIncludes('docs/agent-context/shared-files.md', 'Collision Protocol');
requireIncludes('docs/engineering/parallel-agent-playbook.md', '15+ Parallel Agents');
requireIncludes(
  'docs/engineering/autonomous-software-company-roadmap.md',
  'Feedback To Patch Pipeline',
);
requireIncludes('docs/research/agentic-company-research-prompts.md', '100 Research Prompts');
requireIncludes('.github/PULL_REQUEST_TEMPLATE/parallel-agent-change.md', 'Lane ID');
requireIncludes('.github/pull_request_template.md', 'Risk Classification');
requireIncludes('.github/PULL_REQUEST_TEMPLATE/security-privacy.md', 'Affected Trust Boundary');
requireIncludes('README.md', 'For coding agents');
requireIncludes('README.md', '[AGENTS.md](AGENTS.md)');
requireIncludes('README.md', 'AGI_WORKFORCE.md) — product source of truth');

if (exists('opencode.json')) {
  errors.push('Root opencode.json is retired; use .opencode/opencode.json');
}

const staleToolAgentPhrases = [
  'Next.js 14',
  'No testing mid-stream',
  '~/.claude/projects',
  '~/.Codex/projects',
  'private memory',
];
for (const file of [
  ...listFilesRecursive('.claude/agents', (filePath) => filePath.endsWith('.md')),
  ...listFilesRecursive('.codex/agents', (filePath) => filePath.endsWith('.toml')),
]) {
  const body = readText(file);
  for (const phrase of staleToolAgentPhrases) {
    if (body.includes(phrase)) {
      errors.push(`${file} contains stale tool-agent phrase ${JSON.stringify(phrase)}`);
    }
  }
}

const opencodeConfig = readJson('.opencode/opencode.json');
if (opencodeConfig) {
  for (const instructionPath of opencodeConfig.instructions ?? []) {
    if (!exists(instructionPath)) {
      errors.push(`.opencode/opencode.json instruction path does not exist: ${instructionPath}`);
    }
  }

  for (const fileRef of collectOpencodeFileRefs(opencodeConfig)) {
    const relativePath = path.join('.opencode', fileRef);
    if (!exists(relativePath)) {
      errors.push(`.opencode/opencode.json file reference does not exist: ${fileRef}`);
    }
  }
}

for (const scopedAgentFile of [
  'apps/cli/AGENTS.md',
  'apps/web/AGENTS.md',
  'apps/mobile/AGENTS.md',
  'apps/desktop/AGENTS.md',
  'apps/extension/AGENTS.md',
  'apps/extension-vscode/AGENTS.md',
  'services/AGENTS.md',
  'packages/providers/AGENTS.md',
]) {
  requireIncludes(scopedAgentFile, 'Read root `AGENTS.md`');
  requireIncludes(scopedAgentFile, 'Lane Contract');
  requireIncludes(scopedAgentFile, 'High-Risk Areas');
  requireIncludes(scopedAgentFile, 'Verification');
}

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
  for (const commandKey of [
    'lint',
    'typecheckAll',
    'testAll',
    'rustCheck',
    'agentContext',
    'repoOrganization',
    'boundaries',
    'structureConventions',
    'mobileHygiene',
    'serviceLayer',
    'laneOwnership',
    'generatedArtifacts',
    'reportRetention',
    'supabaseMigrations',
    'ciGuardrails',
    'codeowners',
    'readmeOwnership',
    'docStatus',
    'hooks',
    'llmOperability',
  ]) {
    if (!commands.repoWide?.[commandKey]) {
      errors.push(`commands.json repoWide missing ${commandKey}`);
    }
  }
}

const lanes = readJson('docs/agent-context/lanes.json');
if (lanes) {
  if (!lanes.recommendedParallelism?.writerLanes || lanes.recommendedParallelism.writerLanes < 15) {
    errors.push('lanes.json must document at least 15 writer lanes');
  }
  for (const lane of lanes.lanes ?? []) {
    for (const key of [
      'id',
      'name',
      'ownerRole',
      'ownedWritePaths',
      'blockedPaths',
      'requiredChecks',
    ]) {
      if (!lane[key] || (Array.isArray(lane[key]) && lane[key].length === 0)) {
        errors.push(`lanes.json lane ${lane.id ?? '<unknown>'} missing ${key}`);
      }
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

const knownFlawsTableLines = knownFlaws
  .split('\n')
  .filter((line) => line.startsWith('|') && line.endsWith('|'));
if (knownFlawsTableLines.length >= 2) {
  function splitMarkdownTableRow(line) {
    const cells = [];
    let current = '';
    let escaping = false;

    for (const char of line) {
      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }
      if (char === '\\') {
        current += char;
        escaping = true;
        continue;
      }
      if (char === '|') {
        cells.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    cells.push(current);
    return cells;
  }

  const expectedCells = splitMarkdownTableRow(knownFlawsTableLines[0]).length;
  for (const [index, line] of knownFlawsTableLines.entries()) {
    const cellCount = splitMarkdownTableRow(line).length;
    if (cellCount !== expectedCells) {
      errors.push(
        `known-flaws.md table row ${index + 1} has ${cellCount - 2} cells; expected ${expectedCells - 2}`,
      );
    }
  }
} else {
  errors.push('known-flaws.md must include a markdown table.');
}

if (errors.length > 0) {
  console.error('Agent context check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Agent context check passed.');
