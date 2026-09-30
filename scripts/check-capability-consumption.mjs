#!/usr/bin/env node

// The server resolves what an account may do on a surface from the model
// catalog, the plan, the surface matrix and the operator switches, and sends
// every client that one answer as the capability document. A client that
// decides a capability again, from the static matrix or from a deployment flag
// the document already folds in, can disagree with the server about the same
// account. Each surface names where it reads the document; a surface that does
// not read it yet is a recorded gap with an owner, and a gap that closes fails
// until the record says so.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SURFACE_VOCABULARY_PATH = 'packages/contracts/types/src/suite-contracts.ts';
export const DOCUMENT_FIELD = 'capability_handshake';

export const CAPABILITY_READERS = Object.freeze({
  web: {
    reads: [
      { file: 'apps/web/shared/stores/web-auth-store.ts', evidence: 'capability_handshake' },
      {
        file: 'apps/web/app/ProductRuntimeProviders.tsx',
        evidence: '<CapabilityProvider[^>]*\\bdocument=',
      },
      {
        file: 'packages/ui/unified-chat/src/lib/capabilities.tsx',
        evidence: 'resolveCapabilityDocumentDecision\\(',
      },
    ],
  },
  desktop: {
    hostedBy: 'web',
    why: 'The desktop shell loads the hosted web bundle, so its controls read the document through the web capability provider.',
  },
  mobile: {
    reads: [
      { file: 'apps/mobile/src/features/billing/store.ts', evidence: 'capability_handshake' },
      {
        file: 'apps/mobile/src/features/billing/store.ts',
        evidence: 'resolveCapability(?:Document)?Decision\\(',
      },
    ],
  },
  chrome: {
    reads: [
      {
        file: 'apps/extension/src/features/cloud-bridge/capabilityDocument.ts',
        evidence: 'capability_handshake',
      },
      {
        file: 'apps/extension/src/features/cloud-bridge/capabilityDocument.ts',
        evidence: 'resolveCapabilityDocumentDecision\\(',
      },
      {
        file: 'apps/extension/src/side_panel.ts',
        evidence: "capabilityAllowed\\(capabilityDocument, 'canUseVoice'\\)",
      },
    ],
  },
  vscode: {
    reads: [
      { file: 'apps/extension-vscode/src/utils/api.ts', evidence: 'capability_handshake' },
      {
        file: 'apps/extension-vscode/src/integrations/tierResolver.ts',
        evidence: 'resolveCapabilityDocumentDecision\\(',
      },
      {
        file: 'apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts',
        evidence: 'accountCapabilityDecision\\(',
      },
    ],
  },
  cli: {
    reads: [
      { file: 'apps/cli/src/tier_cache.rs', evidence: 'capability_handshake' },
      {
        file: 'apps/cli/src/models/provider_dispatch.rs',
        evidence: 'allows\\(crate::tier_cache::CLOUD_MODELS_CAPABILITY\\)',
      },
      {
        file: 'apps/cli/src/agent/mod.rs',
        evidence: 'capability_allowed\\(crate::tier_cache::IMAGES_CAPABILITY\\)',
      },
    ],
  },
});

export const MATRIX_SYMBOLS = Object.freeze([
  'isCapabilityEnabled',
  'getPlatformCapabilities',
  'surfaceCapabilityGrant',
  'PLATFORM_CAPABILITIES',
]);

export const MATRIX_PROVIDERS = Object.freeze([
  'packages/ui/unified-chat/src/lib/capabilities.tsx',
  'apps/mobile/src/lib/capabilities.tsx',
]);

export const RECORDED_EXCEPTIONS = Object.freeze({});

export const CLIENT_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/components',
  'apps/web/lib/hooks',
  'apps/web/lib/client',
  'apps/desktop/src',
  'apps/desktop/electron',
  'apps/mobile',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'packages/ui',
]);

const SERVER_PREFIXES = Object.freeze(['apps/web/app/api/']);
const SOURCE_FILE = /\.(?:tsx?|mts|mjs|jsx?|rs)$/;
const SKIP_DIRECTORY =
  /^(?:\.|node_modules$|\.next$|dist$|build$|out$|coverage$|target$|__tests__$|__mocks__$|__fixtures__$|fixtures$|e2e$|tests$)/;
const TEST_FILE = /(?:\.(?:test|spec|stories)\.[cm]?[tj]sx?$|\.d\.ts$|_test\.rs$)/;
const TYPES_IMPORT =
  /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]@agiworkforce\/types(?:\/capabilities)?['"]/g;
const DEPLOYMENT_FLAG_READ = /\b(?:feature_flags|featureFlags)\??\.code_execution\b/;

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function readSurfaces(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, SURFACE_VOCABULARY_PATH);
  if (source === null) return null;
  const match = /export type SourceSurface =([^;]*);/.exec(source);
  if (match === null) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

export function sourceFiles(repoRoot, relativeRoot) {
  const files = [];
  const walk = (relativeDir) => {
    const absolute = path.join(repoRoot, relativeDir);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORY.test(entry.name)) walk(relative);
      } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  walk(relativeRoot);
  return files;
}

export function importedMatrixSymbols(source) {
  const found = [];
  for (const match of source.matchAll(TYPES_IMPORT)) {
    if (match[1]) continue;
    for (const specifier of match[2].split(',')) {
      const trimmed = specifier.trim();
      if (trimmed.length === 0 || trimmed.startsWith('type ')) continue;
      const imported = trimmed.split(/\s+as\s+/)[0].trim();
      if (MATRIX_SYMBOLS.includes(imported)) found.push(imported);
    }
  }
  return found;
}

export function readsDeploymentFlag(source) {
  return DEPLOYMENT_FLAG_READ.test(source);
}

function clientFiles(repoRoot) {
  const all = CLIENT_ROOTS.flatMap((root) => sourceFiles(repoRoot, root));
  return [...new Set(all)]
    .filter((file) => !SERVER_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .sort();
}

function checkReaders({ repoRoot, surfaces, readers, fail }) {
  for (const surface of surfaces) {
    const entry = readers[surface];
    if (entry === undefined) {
      fail(
        `${surface} is a product surface with no recorded way of reading the capability document`,
      );
      continue;
    }
    if (entry.hostedBy !== undefined) {
      if (readers[entry.hostedBy]?.reads === undefined) {
        fail(`${surface} is hosted by ${entry.hostedBy}, which does not read the document itself`);
      }
      continue;
    }
    if (entry.gap !== undefined) {
      if (entry.gap.trim().length < 40 || !entry.owner) {
        fail(`${surface} is recorded as a gap without a reason and an owner`);
        continue;
      }
      if (!existsSync(path.join(repoRoot, entry.owner))) {
        fail(`${surface} names ${entry.owner} as its owner, which is not in the tree`);
        continue;
      }
      const reader = sourceFiles(repoRoot, entry.owner).find((file) =>
        read(repoRoot, file)?.includes(DOCUMENT_FIELD),
      );
      if (reader !== undefined) {
        fail(
          `${reader} reads ${DOCUMENT_FIELD}, so the ${surface} gap has closed. Record where ${surface} reads it and delete the gap.`,
        );
      }
      continue;
    }
    for (const { file, evidence } of entry.reads) {
      const source = read(repoRoot, file);
      if (source === null) {
        fail(`${surface} reads the document in ${file}, which is not in the tree`);
      } else if (!new RegExp(evidence).test(source)) {
        fail(
          `${file} no longer shows /${evidence}/, so ${surface} controls stop reading what the server decided`,
        );
      }
    }
  }
  for (const surface of Object.keys(readers)) {
    if (!surfaces.includes(surface)) {
      fail(`${surface} is recorded here but ${SURFACE_VOCABULARY_PATH} no longer names it`);
    }
  }
}

function checkClients({ repoRoot, exceptions, fail }) {
  const provenExceptions = new Set();
  for (const file of clientFiles(repoRoot)) {
    const source = read(repoRoot, file);
    if (source === null) continue;
    const exception = exceptions[file];
    const matrix = importedMatrixSymbols(source);
    if (matrix.length > 0) {
      if (MATRIX_PROVIDERS.includes(file)) {
        if (!/resolveCapabilityDocumentDecision\(/.test(source)) {
          fail(
            `${file} decides capabilities from the static matrix without consulting the document first`,
          );
        }
      } else if (exception?.rule === 'matrix') {
        provenExceptions.add(file);
      } else {
        fail(
          `${file} imports ${matrix.join(', ')} and decides a capability from the static matrix. Read it through useCapability or resolveCapabilityDocumentDecision instead.`,
        );
      }
    }
    if (readsDeploymentFlag(source)) {
      if (exception?.rule === 'deployment-flag') {
        provenExceptions.add(file);
      } else {
        fail(
          `${file} reads feature_flags.code_execution, which the document already folds into canUseCloudExecution. Read that decision instead.`,
        );
      }
    }
  }
  for (const [file, exception] of Object.entries(exceptions)) {
    if (!exception.why || !exception.fix) {
      fail(`${file} is a recorded exception without a reason and a fix`);
    }
    if (!provenExceptions.has(file)) {
      fail(
        `${file} no longer breaks the ${exception.rule} rule. Delete its recorded exception; the list only shrinks.`,
      );
    }
  }
  for (const file of MATRIX_PROVIDERS) {
    if (read(repoRoot, file) === null) fail(`${file} is a named provider that is not in the tree`);
  }
}

export function checkCapabilityConsumption(
  repoRoot = REPO_ROOT,
  { exceptions = RECORDED_EXCEPTIONS, readers = CAPABILITY_READERS } = {},
) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const surfaces = readSurfaces(repoRoot);
  if (surfaces === null || surfaces.length === 0) {
    fail(`${SURFACE_VOCABULARY_PATH} no longer declares SourceSurface, so no surface is measured`);
    return failures;
  }
  checkReaders({ repoRoot, surfaces, readers, fail });
  checkClients({ repoRoot, exceptions, fail });
  return failures;
}

function main() {
  const failures = checkCapabilityConsumption();
  if (failures.length > 0) {
    console.error('Capability consumption check failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const gaps = Object.values(CAPABILITY_READERS).filter((entry) => entry.gap !== undefined);
  console.log(
    `check-capability-consumption: every surface is measured, ${gaps.length} recorded gap(s), ${Object.keys(RECORDED_EXCEPTIONS).length} recorded exception(s).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
