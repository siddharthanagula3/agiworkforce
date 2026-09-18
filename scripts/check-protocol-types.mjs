#!/usr/bin/env node
// Cross-language parity for the protocol types, without running cargo.
// `generate-protocol-types.mjs --check` covers the canonical tree against Rust;
// this covers the crate's mirror tree and the hand-written mirrors beyond it.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_DIR = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'generated',
  'protocol',
);
export const CRATE_BINDINGS_DIR = path.join('crates', 'agiworkforce-protocol', 'bindings');
export const CAPABILITY_CONSUMER = path.join(
  'apps',
  'extension-vscode',
  'src',
  'integrations',
  'localRuntimeClient.ts',
);
export const TOOL_PRIMITIVE = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'tool-primitive.ts',
);

// ts-rs and prettier disagree about quotes, member separators and line breaks,
// so the two trees are compared by what they declare rather than byte for byte.
export function normalizeDeclaration(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/"/g, "'")
    .replace(/\s+/g, '')
    .replace(/,/g, ';')
    .replace(/;+([}\]>)])/g, '$1')
    .replace(/=\|/g, '=')
    .replace(/'(\w+)':/g, '$1:')
    .replace(/\(\{([^{}]*)\}&(\w+)\)/g, '{$1}&$2')
    .trim();
}

export function collectModules(dir) {
  const modules = new Map();
  const walk = (current, prefix) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort()) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next, `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
        modules.set(`${prefix}${entry.name}`, fs.readFileSync(next, 'utf8'));
      }
    }
  };
  walk(dir, '');
  return modules;
}

export function compareTrees(canonical, mirror) {
  const problems = [];
  for (const name of canonical.keys()) {
    if (!mirror.has(name)) problems.push(`${name} is generated but missing from the crate tree`);
  }
  for (const name of mirror.keys()) {
    if (!canonical.has(name)) problems.push(`${name} is in the crate tree but no longer generated`);
  }
  for (const [name, source] of canonical) {
    const other = mirror.get(name);
    if (other === undefined) continue;
    if (normalizeDeclaration(source) !== normalizeDeclaration(other)) {
      problems.push(`${name} declares a different shape in the two trees`);
    }
  }
  return problems;
}

export function fieldsOfGeneratedType(source, typeName) {
  const pattern = new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`);
  const body = source.match(pattern)?.[1];
  if (!body) return null;
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...withoutComments.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]);
}

export function zodObjectKeys(source, constName) {
  const pattern = new RegExp(`const ${constName} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\);`);
  const body = source.match(pattern)?.[1];
  if (!body) return null;
  return [...body.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
}

export function compareVocabulary(label, owned, mirrored) {
  if (owned === null) return [`${label}: the Rust-owned shape could not be read`];
  if (mirrored === null) return [`${label}: the hand-written mirror could not be read`];
  const problems = [];
  const mirroredSet = new Set(mirrored);
  const ownedSet = new Set(owned);
  for (const name of owned) {
    if (!mirroredSet.has(name))
      problems.push(`${label}: ${name} is owned by Rust but not mirrored`);
  }
  for (const name of mirrored) {
    if (!ownedSet.has(name))
      problems.push(`${label}: ${name} is mirrored but Rust declares no such member`);
  }
  return problems;
}

export function stringUnionMembers(source, typeName) {
  const declaration = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`))?.[1];
  if (!declaration || !/^\s*'/.test(declaration)) return null;
  return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function runtimeListing(source, typeName) {
  const pattern = new RegExp(`listing<${typeName}>\\(\\)\\(\\[([\\s\\S]*?)\\]\\)`);
  const body = source.match(pattern)?.[1];
  if (body === undefined) return null;
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function checkToolUnions(canonical, toolPrimitive) {
  const problems = [];
  for (const [file, source] of canonical) {
    const typeName = path.basename(file, '.ts');
    if (!typeName.startsWith('Tool')) continue;
    const members = stringUnionMembers(source, typeName);
    if (members === null) continue;
    const listed = runtimeListing(toolPrimitive, typeName);
    if (listed === null) {
      problems.push(
        `${typeName} is a generated tool vocabulary with no listing<${typeName}>() in ${TOOL_PRIMITIVE}`,
      );
      continue;
    }
    problems.push(...compareVocabulary(typeName, members, listed));
  }
  return problems;
}

export function checkProtocolTypes(root = repoRoot) {
  const read = (relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  };
  const canonical = collectModules(path.join(root, CANONICAL_DIR));
  if (canonical.size === 0) {
    return { problems: [`${CANONICAL_DIR} holds no generated modules`], checked: 0 };
  }
  const mirror = collectModules(path.join(root, CRATE_BINDINGS_DIR));
  const problems = compareTrees(canonical, mirror);

  const capabilities = canonical.get('AppServerCapabilities.ts');
  problems.push(
    ...compareVocabulary(
      'AppServerCapabilities',
      capabilities ? fieldsOfGeneratedType(capabilities, 'AppServerCapabilities') : null,
      zodObjectKeys(read(CAPABILITY_CONSUMER) ?? '', 'capabilitiesSchema'),
    ),
  );

  problems.push(...checkToolUnions(canonical, read(TOOL_PRIMITIVE) ?? ''));
  return { problems, checked: canonical.size };
}

function main() {
  const { problems, checked } = checkProtocolTypes();
  if (problems.length > 0) {
    console.error('Protocol types have diverged across languages:');
    for (const problem of problems) console.error(`- ${problem}`);
    console.error('\nRegenerate with `pnpm generate:protocol-types`, then reconcile the mirrors.');
    return 1;
  }
  console.log(
    `Protocol type parity check passed (${checked} generated modules, crate mirror, ` +
      'app-server capabilities, tool vocabularies).',
  );
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exitCode = main();
