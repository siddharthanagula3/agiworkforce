#!/usr/bin/env node

// Dependencies point one way: a surface and an adapter may reach the domain,
// and the domain may reach neither. This guard reads every import in the tree
// and fails on an edge that runs the wrong way.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { repositoryFiles } from './check-lifecycle-semantics.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/dependency-direction.json';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IMPORT =
  /(?:^|[\s;{(])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
}

function isNonProductionPath(relativePath) {
  return (
    /\.(test|spec|bench|stories)\.[cm]?tsx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|__fixtures__|tests|fixtures|e2e|node_modules|dist|build|\.next|\.turbo|coverage)\//.test(
      relativePath,
    )
  );
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

/** Every import specifier in a production module, comments removed. */
export function readImports({ repoRoot = REPO_ROOT, files }) {
  const imports = new Map();
  for (const relativePath of files) {
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isNonProductionPath(relativePath)) continue;
    let source;
    try {
      source = stripComments(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
    } catch {
      continue;
    }
    const specifiers = new Set();
    IMPORT.lastIndex = 0;
    for (const match of source.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier !== undefined && !specifier.startsWith('.')) specifiers.add(specifier);
    }
    if (specifiers.size > 0) imports.set(relativePath, specifiers);
  }
  return imports;
}

function surfaceRoots(repoRoot) {
  return readdirSync(path.join(repoRoot, 'apps'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => `apps/${entry.name}/`)
    .sort();
}

function packageRoots(repoRoot, parent) {
  return readdirSync(path.join(repoRoot, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => `${parent}/${entry.name}/`)
    .sort();
}

function checkForbidden({ contract, imports, errors }) {
  const exemptions = new Map(
    (contract.forbiddenExemptions ?? []).map((entry) => [`${entry.file}#${entry.rule}`, entry]),
  );
  const seen = new Set();

  for (const rule of contract.forbidden) {
    if (typeof rule.why !== 'string' || rule.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: forbidden import rule "${rule.name}" carries no reason.`);
      continue;
    }
    const matcher = new RegExp(rule.match);
    for (const [file, specifiers] of imports) {
      if (!contract.domainRoots.some((root) => file.startsWith(root))) continue;
      for (const specifier of specifiers) {
        if (!matcher.test(specifier)) continue;
        const key = `${file}#${rule.name}`;
        if (exemptions.has(key)) {
          seen.add(key);
          continue;
        }
        errors.push(`${file}: the domain imports ${specifier}. ${rule.why}`);
      }
    }
  }

  for (const [key, entry] of exemptions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: forbidden import exemption ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: forbidden import exemption ${key} no longer matches an import. Delete it; this list only shrinks.`,
      );
    }
  }
}

/** The domain may not reach sideways into a workspace package either. */
function checkDomainIsLeaf({ contract, imports, errors }) {
  const allowed = contract.domainPackages;
  for (const [file, specifiers] of imports) {
    if (!contract.domainRoots.some((root) => file.startsWith(root))) continue;
    for (const specifier of specifiers) {
      if (!specifier.startsWith(contract.workspaceScope)) continue;
      if (allowed.some((name) => specifier === name || specifier.startsWith(`${name}/`))) continue;
      errors.push(
        `${file}: the domain imports the workspace package ${specifier}. An adapter implements the ` +
          'contract; the contract may not reach back into the adapter.',
      );
    }
  }
}

function importersOf({ imports, root, matcher }) {
  for (const [file, specifiers] of imports) {
    if (!file.startsWith(root)) continue;
    for (const specifier of specifiers) {
      if (matcher.test(specifier)) return file;
    }
  }
  return null;
}

/**
 * The permitted directions are only real if something uses them, so each one
 * names the roots that have to exercise it.
 */
function checkPermittedDirections({ contract, repoRoot, imports, errors }) {
  const domainMatcher = new RegExp(
    contract.domainPackages
      .map((name) => `^${name.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}`)
      .join('|'),
  );

  const exempt = new Map((contract.rootsWithoutDomain ?? []).map((entry) => [entry.root, entry]));
  const seen = new Set();
  const roots = [...surfaceRoots(repoRoot), ...packageRoots(repoRoot, 'packages/platform')];

  for (const root of roots) {
    if (importersOf({ imports, root, matcher: domainMatcher }) !== null) {
      if (exempt.has(root)) {
        errors.push(
          `${CONTRACT_PATH}: ${root} is recorded as not reaching the domain and now imports it. Delete the entry.`,
        );
      }
      continue;
    }
    if (exempt.has(root)) {
      seen.add(root);
      continue;
    }
    errors.push(
      `${root}: nothing here imports the shared contract, so whatever it decides it decides alone. ` +
        'Consume the contract, or record why this root has no domain to consume.',
    );
  }

  for (const [root, entry] of exempt) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(
        `${CONTRACT_PATH}: ${root} is recorded without the domain and carries no reason.`,
      );
    }
    if (!seen.has(root) && !roots.includes(root)) {
      errors.push(
        `${CONTRACT_PATH}: ${root} is recorded without the domain and is no longer a root. Delete it.`,
      );
    }
  }
}

/** A provider SDK belongs to its adapter and to nothing else. */
function checkProviderAdapters({ contract, imports, errors }) {
  const matcher = new RegExp(contract.providerSdkMatch);
  const exemptions = new Map(
    (contract.providerSdkExemptions ?? []).map((entry) => [entry.file, entry]),
  );
  const seen = new Set();
  let adapterImports = 0;

  for (const [file, specifiers] of imports) {
    for (const specifier of specifiers) {
      if (!matcher.test(specifier)) continue;
      if (contract.providerAdapterRoots.some((root) => file.startsWith(root))) {
        adapterImports += 1;
        continue;
      }
      if (exemptions.has(file)) {
        seen.add(file);
        continue;
      }
      errors.push(
        `${file}: imports the provider SDK ${specifier} from outside ${contract.providerAdapterRoots.join(' or ')}. ` +
          'A second consumer means a second retry budget and a second credential resolution.',
      );
    }
  }

  if (adapterImports === 0) {
    errors.push(
      `${CONTRACT_PATH}: no provider adapter imports a provider SDK, so ${contract.providerSdkMatch} ` +
        'is reading nothing and the rule is unenforced.',
    );
  }

  for (const [file, entry] of exemptions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: provider SDK exemption ${file} carries no reason.`);
    }
    if (!seen.has(file)) {
      errors.push(
        `${CONTRACT_PATH}: provider SDK exemption ${file} no longer imports one. Delete it; this list only shrinks.`,
      );
    }
  }
}

export function checkDependencyDirection(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const files = repositoryFiles(repoRoot);
  const imports = readImports({ repoRoot, files });

  checkForbidden({ contract, imports, errors });
  checkDomainIsLeaf({ contract, imports, errors });
  checkPermittedDirections({ contract, repoRoot, imports, errors });
  checkProviderAdapters({ contract, imports, errors });

  return {
    errors,
    report: {
      modules: imports.size,
      rules: contract.forbidden.length,
      domainModules: [...imports.keys()].filter((file) =>
        contract.domainRoots.some((root) => file.startsWith(root)),
      ).length,
      exemptions:
        (contract.forbiddenExemptions ?? []).length +
        (contract.providerSdkExemptions ?? []).length +
        (contract.rootsWithoutDomain ?? []).length,
    },
  };
}

function main() {
  const { errors, report } = checkDependencyDirection(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Dependency direction check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-dependency-direction: OK (${report.modules} modules, ${report.domainModules} in the ` +
      `domain, ${report.rules} forbidden import families, ${report.exemptions} recorded)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
