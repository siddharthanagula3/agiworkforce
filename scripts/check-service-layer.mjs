#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredParts = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'coverage',
  '.cache',
  '.turbo',
  '.expo',
  'Pods',
]);

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
    errors.push(`Missing required service-layer file: ${relativePath}`);
  }
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return;
  }

  const body = readText(relativePath);
  if (!body.includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function walk(relativeDir, files = []) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return files;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, files);
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

requireFile('docs/engineering/service-layer-architecture.md');

requireIncludes('AGENTS.md', 'docs/engineering/service-layer-architecture.md');
requireIncludes('CLAUDE.md', 'docs/engineering/service-layer-architecture.md');
requireIncludes('docs/agent-context/README.md', 'service-layer-architecture.md');
requireIncludes('docs/engineering/README.md', 'service-layer-architecture.md');
requireIncludes('docs/engineering/agent-native-development.md', 'service-layer-architecture.md');
requireIncludes(
  'docs/engineering/agent-harness-rollout.md',
  'Service-layer architecture is part of the harness',
);
requireIncludes('docs/current/agent-and-repo-operability.md', 'service-layer-architecture.md');

requireIncludes(
  'docs/engineering/service-layer-architecture.md',
  'Actions/routes orchestrate domain rules.',
);
requireIncludes(
  'docs/engineering/service-layer-architecture.md',
  'Service functions own reusable mechanics.',
);
requireIncludes('docs/engineering/service-layer-architecture.md', '## Migration Checklist');
requireIncludes('docs/engineering/service-layer-architecture.md', '## AGI-Specific Boundaries');
requireIncludes('docs/engineering/service-layer-architecture.md', 'pnpm check:service-layer');

const packageJson = readJson('package.json');
if (packageJson) {
  if (packageJson.scripts?.['check:service-layer'] !== 'node scripts/check-service-layer.mjs') {
    errors.push(
      'package.json scripts.check:service-layer must run node scripts/check-service-layer.mjs',
    );
  }
  if (!packageJson.scripts?.['check:llm-operability']?.includes('pnpm check:service-layer')) {
    errors.push('package.json scripts.check:llm-operability must include pnpm check:service-layer');
  }
}

const commands = readJson('docs/agent-context/commands.json');
if (commands && commands.repoWide?.serviceLayer !== 'pnpm check:service-layer') {
  errors.push(
    'docs/agent-context/commands.json repoWide.serviceLayer must be pnpm check:service-layer',
  );
}

const canonicalContractNames = [
  'AgentSession',
  'AgentSessionStatus',
  'ArtifactManifest',
  'ComputeSession',
  'ComputerUseSession',
  'ComputerAction',
  'ConnectorManifest',
  'DeveloperSession',
  'DispatchEnvelope',
  'DispatchPayload',
  'GeneratedFile',
  'HandoffDraft',
  'McpServerConfig',
  'PrivacyMode',
  'ProviderMode',
  'RemoteControlSession',
  'RemoteDispatchPayload',
  'SourceSurface',
  'SyncedAppConversation',
  'SyncedAppMessage',
  'SyncedConversation',
  'SyncedMessage',
];

const allowedLegacyDefinitions = new Set([
  'apps/desktop/src/api/mcp.ts::ConnectorManifest',
  'packages/api/src/mcp.ts::ConnectorManifest',
  'packages/mcp/src/types.ts::McpServerConfig',
  'packages/types/src/agent-status.ts::AgentSession',
  'packages/types/src/suite-contracts.ts::GeneratedFile',
]);

for (const scanRoot of ['apps', 'packages', 'services']) {
  for (const relativePath of walk(scanRoot)) {
    if (!sourceExtensions.has(path.extname(relativePath))) continue;

    const body = readText(relativePath);
    for (const contractName of canonicalContractNames) {
      const interfacePattern = new RegExp(
        `^\\s*(?:export\\s+)?interface\\s+${contractName}\\b(?:\\s+extends\\b|\\s*\\{)`,
        'gm',
      );
      const typePattern = new RegExp(`^\\s*(?:export\\s+)?type\\s+${contractName}\\b\\s*=`, 'gm');
      if (!interfacePattern.test(body) && !typePattern.test(body)) continue;

      const definitionId = `${relativePath}::${contractName}`;
      if (allowedLegacyDefinitions.has(definitionId)) continue;
      if (relativePath.startsWith('packages/types/src/')) continue;

      errors.push(
        `${relativePath} defines ${contractName}; import the canonical contract from @agiworkforce/types or update scripts/check-service-layer.mjs with an explicit migration exception.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Service-layer check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Service-layer check passed.');
