#!/usr/bin/env node
/**
 * A skill is instructions. It cannot widen what the caller may do.
 *
 * The authority a request carries comes from four places, each owned by a
 * module named below: the offered tool catalog, the saved per-tool approval
 * verdict, the connector grant, and the workspace feature switch. A skill is
 * allowed to be filtered BY all four and to name none of them, so this guard
 * enumerates every skill module in the tree and fails one that reaches for a
 * writer, a catalog loader or a tool definition of its own.
 *
 * The one tool a skill module may declare is the `skill` tool itself, which is
 * how the model asks to read a skill; it goes through the same gate as every
 * other tool because it is offered from the same catalog.
 *
 * A skill's frontmatter may still SAY `requires: { tools: [...] }`. That is a
 * precondition, not a grant: the runtime removes the skill when the tool is not
 * already offered, which is the opposite direction, and is covered by the
 * skills package tests rather than here.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOTS = [
  { dir: 'packages/tools/skills/src', pattern: /\.ts$/ },
  { dir: 'apps/web/lib/services', pattern: /^(skill|user-skill)[-.].*\.ts$/ },
  { dir: 'apps/web/app/api/skills', pattern: /\.ts$/ },
];

/**
 * The module that owns each kind of authority. The symbols are enumerated from
 * that module's own exports rather than listed here, so a writer added tomorrow
 * is checked tomorrow: anything it exports that hands authority out (a save, a
 * grant, an upsert) plus, for the catalog, the loaders that decide what is
 * offered at all.
 */
export const AUTHORITY_OWNERS = [
  {
    kind: 'tool catalog',
    owner: 'apps/web/lib/user-connector-tools.ts',
    also: ['loadUserConnectorToolDefs', 'loadUserConnectorToolCatalog', 'loadMcpToolDefs'],
  },
  {
    kind: 'approval verdict',
    owner: 'apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts',
    also: ['loadToolApprovalPolicy', 'loadTurnToolPermissions'],
  },
  {
    kind: 'connector grant',
    owner: 'apps/web/lib/connectors/oauth-store.ts',
    also: [],
  },
  {
    kind: 'workspace feature',
    owner: 'apps/web/lib/services/organization-policy-service.ts',
    also: [],
  },
];

const WRITER = /^(save|set|upsert|grant|write|create|record|revoke|consume)[A-Z]/;

/** Every export of an owner module that hands its authority out. */
export function authoritySymbols(ownerSource, also) {
  const exported = [...ownerSource.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)]
    .map((match) => match[1])
    .filter((name) => WRITER.test(name));
  return [...new Set([...exported, ...also])].sort();
}

/** A tool definition literal. The skill tool itself is the single legal one. */
const TOOL_DEFINITION = /type:\s*'function'/;
export const SKILL_TOOL_DEFINITION_MODULE = 'packages/tools/skills/src/tool.ts';

function isScannable(name, pattern) {
  return pattern.test(name) && !/\.(test|spec)\.tsx?$/.test(name);
}

export function skillModules(scanRoot) {
  const out = [];
  for (const { dir, pattern } of SKILL_ROOTS) {
    const root = path.join(scanRoot, dir);
    if (!fs.existsSync(root)) continue;
    const step = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          step(full);
          continue;
        }
        if (isScannable(entry.name, pattern)) out.push(path.relative(scanRoot, full));
      }
    };
    step(root);
  }
  return out.sort();
}

export function authorityReachedBy(source, owners) {
  const found = [];
  for (const owner of owners) {
    for (const symbol of owner.symbols) {
      if (new RegExp(`\\b${symbol}\\b`).test(source)) found.push(`${owner.kind}: ${symbol}`);
    }
  }
  return found;
}

export function resolveOwners(scanRoot) {
  return AUTHORITY_OWNERS.map((owner) => {
    const full = path.join(scanRoot, owner.owner);
    if (!fs.existsSync(full)) return { ...owner, missing: true, symbols: [] };
    return {
      ...owner,
      missing: false,
      symbols: authoritySymbols(fs.readFileSync(full, 'utf8'), owner.also),
    };
  });
}

export function findings(scanRoot, owners = resolveOwners(scanRoot)) {
  const out = [];
  let modules = 0;
  for (const relative of skillModules(scanRoot)) {
    modules += 1;
    const source = fs.readFileSync(path.join(scanRoot, relative), 'utf8');
    for (const reached of authorityReachedBy(source, owners)) {
      out.push(`${relative} reaches ${reached}`);
    }
    if (TOOL_DEFINITION.test(source) && relative !== SKILL_TOOL_DEFINITION_MODULE) {
      out.push(`${relative} declares a tool of its own`);
    }
  }
  return { modules, out };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rootIndex = process.argv.indexOf('--root');
  const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

  const owners = resolveOwners(scanRoot);
  for (const owner of owners) {
    if (!owner.missing && owner.symbols.length > 0) continue;
    console.error(
      `check-skill-authority: ${owner.owner} no longer exports anything that hands out ${owner.kind}.`,
    );
    process.exit(1);
  }
  const { modules, out } = findings(scanRoot, owners);
  if (modules === 0) {
    console.error('check-skill-authority: no skill module was found, which cannot be right.');
    process.exit(1);
  }
  if (out.length > 0) {
    console.error(`${out.length} skill module(s) reach authority a skill may not widen:`);
    for (const finding of out) console.error(`  ${finding}`);
    process.exit(1);
  }
  console.log(
    `check-skill-authority: ${modules} skill modules, none reaching any of ` +
      `${owners.reduce((total, owner) => total + owner.symbols.length, 0)} symbols ` +
      `across ${owners.length} authority owners.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
