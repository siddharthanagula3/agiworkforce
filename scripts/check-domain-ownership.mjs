#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { readTableColumns } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const REGISTRY_PATH = 'packages/contracts/types/src/domain-registry.json';
export const REGISTRY_TYPES_PATH = 'packages/contracts/types/src/domain-registry.ts';
export const CAPABILITY_SOURCE = 'packages/contracts/types/src/capabilities.ts';
export const CONCEPT_SOURCE = 'packages/contracts/types/src/concept-registry.json';

const DOMAIN_NAME = /^[a-z][a-z0-9-]*$/;

export function loadRegistry(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, REGISTRY_PATH), 'utf8'));
}

/** The `PlatformCapability` union members, read from the union itself. */
export function readPlatformCapabilities(repoRoot = REPO_ROOT) {
  const source = readFileSync(path.join(repoRoot, CAPABILITY_SOURCE), 'utf8');
  const parsed = ts.createSourceFile(CAPABILITY_SOURCE, source, ts.ScriptTarget.Latest, false);
  for (const statement of parsed.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;
    if (statement.name.text !== 'PlatformCapability') continue;
    if (!ts.isUnionTypeNode(statement.type)) break;
    const members = statement.type.types.flatMap((node) =>
      ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? [node.literal.text] : [],
    );
    if (members.length > 0) return members;
  }
  throw new Error(`${CAPABILITY_SOURCE} no longer declares a PlatformCapability string union.`);
}

export function readConceptNames(repoRoot = REPO_ROOT) {
  const registry = JSON.parse(readFileSync(path.join(repoRoot, CONCEPT_SOURCE), 'utf8'));
  return registry.concepts.map((concept) => concept.name);
}

/**
 * Exactly one owner for each member of `population`, drawn from the registry.
 * Unclaimed members and members claimed twice are both ownership failures.
 */
function claimExactlyOnce({ domains, key, population, label, errors }) {
  const claimed = new Map();
  for (const domain of domains) {
    for (const member of domain[key] ?? []) {
      const owner = claimed.get(member);
      if (owner !== undefined) {
        errors.push(
          `${REGISTRY_PATH}: ${label} "${member}" is claimed by both "${owner}" and "${domain.name}". One owner, not two.`,
        );
        continue;
      }
      claimed.set(member, domain.name);
      if (!population.includes(member)) {
        errors.push(
          `${REGISTRY_PATH}: "${domain.name}" claims ${label} "${member}", which does not exist.`,
        );
      }
    }
  }
  for (const member of population) {
    if (claimed.has(member)) continue;
    errors.push(
      `${REGISTRY_PATH}: ${label} "${member}" has no owning domain. Every ${label} belongs to exactly one.`,
    );
  }
  return claimed;
}

function checkDomains({ registry, repoRoot, errors }) {
  const names = new Set();
  const labels = new Set();
  for (const domain of registry.domains) {
    if (!DOMAIN_NAME.test(domain.name ?? '')) {
      errors.push(`${REGISTRY_PATH}: "${domain.name}" is not a lower-kebab domain name.`);
    }
    if (names.has(domain.name)) {
      errors.push(`${REGISTRY_PATH}: domain "${domain.name}" is declared twice.`);
    }
    names.add(domain.name);
    if (typeof domain.label !== 'string' || domain.label.trim().length === 0) {
      errors.push(`${REGISTRY_PATH}: domain "${domain.name}" has no label.`);
    } else if (labels.has(domain.label)) {
      errors.push(
        `${REGISTRY_PATH}: label "${domain.label}" names two domains. Two spellings of one domain is the thing this registry exists to stop.`,
      );
    }
    labels.add(domain.label);
    if (typeof domain.owner !== 'string' || !existsSync(path.join(repoRoot, domain.owner))) {
      errors.push(
        `${REGISTRY_PATH}: domain "${domain.name}" names owner ${domain.owner}, which does not exist.`,
      );
    }
  }
}

function checkVocabularyBinding({ registry, repoRoot, errors }) {
  let source;
  try {
    source = readFileSync(path.join(repoRoot, REGISTRY_TYPES_PATH), 'utf8');
  } catch {
    errors.push(`${REGISTRY_TYPES_PATH} is missing; product code has no typed domain vocabulary.`);
    return;
  }
  const block = /export const PRODUCT_DOMAINS = \[([\s\S]*?)\] as const;/.exec(source);
  if (block === null) {
    errors.push(`${REGISTRY_TYPES_PATH}: no PRODUCT_DOMAINS array for the registry to bind to.`);
    return;
  }
  const named = new Set([...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));
  for (const domain of registry.domains) {
    if (!named.has(domain.name)) {
      errors.push(`${REGISTRY_TYPES_PATH}: PRODUCT_DOMAINS omits "${domain.name}".`);
    }
  }
  for (const name of named) {
    if (!registry.domains.some((domain) => domain.name === name)) {
      errors.push(
        `${REGISTRY_TYPES_PATH}: names domain "${name}", which ${REGISTRY_PATH} does not define.`,
      );
    }
  }
}

export function checkDomainOwnership(repoRoot = REPO_ROOT) {
  const errors = [];
  const registry = loadRegistry(repoRoot);
  const domains = registry.domains ?? [];

  checkDomains({ registry, repoRoot, errors });
  checkVocabularyBinding({ registry, repoRoot, errors });

  const tables = claimExactlyOnce({
    domains,
    key: 'tables',
    population: [...readTableColumns(repoRoot).keys()],
    label: 'table',
    errors,
  });
  const capabilities = claimExactlyOnce({
    domains,
    key: 'capabilities',
    population: readPlatformCapabilities(repoRoot),
    label: 'capability',
    errors,
  });
  const concepts = claimExactlyOnce({
    domains,
    key: 'concepts',
    population: readConceptNames(repoRoot),
    label: 'concept',
    errors,
  });

  return {
    errors,
    report: {
      domains: domains.length,
      tables: tables.size,
      capabilities: capabilities.size,
      concepts: concepts.size,
    },
  };
}

function main() {
  const { errors, report } = checkDomainOwnership(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Domain ownership check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-domain-ownership: OK (${report.domains} domains own ${report.tables} tables, ` +
      `${report.capabilities} capabilities, ${report.concepts} concepts)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
