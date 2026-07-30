#!/usr/bin/env node
/* global console */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const libPath = 'apps/desktop/src-tauri/src/lib.rs';
const rustRoot = 'apps/desktop/src-tauri/src';
const allowlistPath = 'apps/desktop/wiring-allowlist.json';
const hitlPath = 'apps/desktop/.hitl-required-tools.yaml';
const frontendRoots = [
  {
    path: 'apps/desktop/src',
    patterns: [/\binvoke[A-Za-z]*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g],
  },
  {
    path: 'packages/client/desktop-command-client/src',
    patterns: [/\bcommand(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g],
  },
  {
    path: 'packages/ui/unified-chat/src',
    patterns: [/\binvoke[A-Za-z]*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g],
  },
];

function stripComments(source) {
  let output = '';
  let state = 'code';

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') {
        output += '\n';
        state = 'code';
      } else {
        output += ' ';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (state === 'string') {
      output += char;
      if (char === '\\') {
        if (next !== undefined) {
          output += next;
          index += 1;
        }
      } else if (char === '"') {
        state = 'code';
      }
      continue;
    }
    if (state === 'char') {
      output += char;
      if (char === '\\') {
        if (next !== undefined) {
          output += next;
          index += 1;
        }
      } else if (char === "'") {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else {
      output += char;
      if (char === '"') state = 'string';
      if (char === "'") state = 'char';
    }
  }

  return output;
}

export function extractRegisteredCommands(source) {
  const stripped = stripComments(source);
  const marker = '.invoke_handler(tauri::generate_handler![';
  const markerIndex = stripped.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Could not find ${marker} in ${libPath}`);
  }
  if (stripped.indexOf(marker, markerIndex + marker.length) !== -1) {
    throw new Error(`${libPath} must contain exactly one generate_handler! registry`);
  }

  const openBracketIndex = markerIndex + marker.length - 1;
  let depth = 0;
  let closeBracketIndex = -1;
  for (let index = openBracketIndex; index < stripped.length; index += 1) {
    if (stripped[index] === '[') depth += 1;
    if (stripped[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        closeBracketIndex = index;
        break;
      }
    }
  }
  if (closeBracketIndex === -1) {
    throw new Error(`Unclosed generate_handler! registry in ${libPath}`);
  }

  const block = stripped.slice(openBracketIndex + 1, closeBracketIndex);
  const commands = [];
  const pathPattern = /\bcrate(?:::[A-Za-z_][A-Za-z0-9_]*)+\b/g;
  for (const match of block.matchAll(pathPattern)) {
    commands.push(match[0].split('::').at(-1));
  }
  return commands;
}

function walkFiles(relativeDirectory, predicate) {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === 'dist' ||
      entry.name === 'archive' ||
      entry.name === '__tests__'
    ) {
      continue;
    }
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(relativePath, predicate));
    } else if (entry.isFile() && predicate(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function extractFrontendCalls() {
  const calls = new Set();
  for (const root of frontendRoots) {
    for (const filePath of walkFiles(root.path, (file) => /\.(?:ts|tsx)$/.test(file))) {
      if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(filePath)) continue;
      const source = stripComments(fs.readFileSync(path.join(repoRoot, filePath), 'utf8'));
      for (const pattern of root.patterns) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
          calls.add(match[1]);
        }
      }
    }
  }
  return calls;
}

function extractRustCommandDefinitions() {
  const commands = new Set();
  const commandPattern =
    /#\[tauri::command(?:\([^\]]*\))?\]\s*(?:#\[[^\]]+\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([a-z_][a-z0-9_]*)/g;

  for (const filePath of walkFiles(rustRoot, (file) => file.endsWith('.rs'))) {
    const source = stripComments(fs.readFileSync(path.join(repoRoot, filePath), 'utf8'));
    for (const match of source.matchAll(commandPattern)) {
      commands.add(match[1]);
    }
  }
  return commands;
}

function readAllowlist() {
  const absolutePath = path.join(repoRoot, allowlistPath);
  if (!fs.existsSync(absolutePath)) {
    return { registeredWithoutFrontendCaller: [] };
  }

  const allowlist = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (
    !allowlist ||
    allowlist.schemaVersion !== 1 ||
    !Array.isArray(allowlist.registeredWithoutFrontendCaller)
  ) {
    throw new Error(
      `${allowlistPath} must have schemaVersion 1 and registeredWithoutFrontendCaller[]`,
    );
  }

  const commands = new Set();
  for (const [index, entry] of allowlist.registeredWithoutFrontendCaller.entries()) {
    if (
      !entry ||
      typeof entry.command !== 'string' ||
      !/^[a-z_][a-z0-9_]*$/.test(entry.command) ||
      typeof entry.reason !== 'string' ||
      entry.reason.trim().length < 20
    ) {
      throw new Error(`${allowlistPath} entry ${index + 1} must contain command and reason`);
    }
    if (commands.has(entry.command)) {
      throw new Error(`${allowlistPath} contains duplicate command ${entry.command}`);
    }
    commands.add(entry.command);
  }
  return { registeredWithoutFrontendCaller: [...commands] };
}

function yamlScalar(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function extractHitlRequirements(source) {
  const requirements = [];
  let pendingTool = null;

  for (const line of source.split(/\r?\n/)) {
    const toolMatch = line.match(/^\s*-\s*tool:\s*(.+?)\s*$/);
    if (toolMatch) {
      if (pendingTool) {
        throw new Error(`${hitlPath} tool ${pendingTool} is missing a handler`);
      }
      pendingTool = yamlScalar(toolMatch[1]);
      continue;
    }

    const handlerMatch = line.match(/^\s*handler:\s*(.+?)\s*$/);
    if (handlerMatch && pendingTool) {
      requirements.push({ tool: pendingTool, handler: yamlScalar(handlerMatch[1]) });
      pendingTool = null;
    }
  }

  if (pendingTool) {
    throw new Error(`${hitlPath} tool ${pendingTool} is missing a handler`);
  }
  if (requirements.length === 0) {
    throw new Error(`${hitlPath} must contain at least one tool/handler pair`);
  }

  const tools = new Set();
  for (const requirement of requirements) {
    if (tools.has(requirement.tool)) {
      throw new Error(`${hitlPath} contains duplicate tool ${requirement.tool}`);
    }
    tools.add(requirement.tool);
  }
  return requirements;
}

export function analyzeHitlRequirements(requirements, handlerSources) {
  const violations = [];
  for (const { tool, handler } of requirements) {
    if (!handlerSources.has(handler)) {
      violations.push(`${tool} -> missing handler ${handler}`);
      continue;
    }
    if (!stripComments(handlerSources.get(handler)).includes('request_confirmation_simple')) {
      violations.push(`${tool} -> ${handler} has no request_confirmation_simple call`);
    }
  }
  return violations;
}

export function analyzeWiring({ registeredCommands, frontendCalls, rustDefinitions, allowlisted }) {
  const registered = new Set(registeredCommands);
  const duplicateRegistrations = [
    ...new Set(
      registeredCommands.filter((command, index) => registeredCommands.indexOf(command) !== index),
    ),
  ].sort();
  const frontendWithoutRegistration = [...frontendCalls]
    .filter((command) => !registered.has(command))
    .sort();
  const definitionWithoutRegistration = [...rustDefinitions]
    .filter((command) => !registered.has(command))
    .sort();
  const registeredWithoutFrontend = [...registered]
    .filter((command) => !frontendCalls.has(command) && !allowlisted.has(command))
    .sort();
  const staleAllowlist = [...allowlisted]
    .filter((command) => !registered.has(command) || frontendCalls.has(command))
    .sort();

  return {
    duplicateRegistrations,
    frontendWithoutRegistration,
    definitionWithoutRegistration,
    registeredWithoutFrontend,
    staleAllowlist,
  };
}

function reportFailures(result) {
  const groups = [
    ['DUPLICATE (command registered more than once)', result.duplicateRegistrations],
    ['MISSING (frontend invoke without registration)', result.frontendWithoutRegistration],
    ['MISSING (#[tauri::command] not in generate_handler!)', result.definitionWithoutRegistration],
    [
      'ORPHAN (registered command has no frontend caller or allowlist entry)',
      result.registeredWithoutFrontend,
    ],
    ['STALE (allowlist entry is no longer an orphaned registration)', result.staleAllowlist],
    ['MISSING (HITL-required tool approval boundary)', result.hitlViolations],
  ];

  let failureCount = 0;
  for (const [label, commands] of groups) {
    for (const command of commands) {
      console.error(`${label}: ${command}`);
      failureCount += 1;
    }
  }
  return failureCount;
}

export function main() {
  const registeredCommands = extractRegisteredCommands(
    fs.readFileSync(path.join(repoRoot, libPath), 'utf8'),
  );
  const frontendCalls = extractFrontendCalls();
  const rustDefinitions = extractRustCommandDefinitions();
  const allowlist = readAllowlist();
  const allowlisted = new Set(allowlist.registeredWithoutFrontendCaller);
  const hitlRequirements = extractHitlRequirements(
    fs.readFileSync(path.join(repoRoot, hitlPath), 'utf8'),
  );
  const handlerSources = new Map();
  for (const { handler } of hitlRequirements) {
    const absoluteHandler = path.join(repoRoot, handler);
    if (fs.existsSync(absoluteHandler)) {
      handlerSources.set(handler, fs.readFileSync(absoluteHandler, 'utf8'));
    }
  }
  const result = analyzeWiring({
    registeredCommands,
    frontendCalls,
    rustDefinitions,
    allowlisted,
  });
  result.hitlViolations = analyzeHitlRequirements(hitlRequirements, handlerSources);
  const failureCount = reportFailures(result);

  if (failureCount > 0) {
    console.error(
      `Wiring check failed: ${failureCount} issue(s); ${registeredCommands.length} registrations, ` +
        `${frontendCalls.size} frontend calls, ${rustDefinitions.size} Rust command definitions.`,
    );
    process.exit(1);
  }

  console.log(
    `Wiring check passed: ${registeredCommands.length} registrations, ` +
      `${frontendCalls.size} frontend calls, ${rustDefinitions.size} Rust command definitions, ` +
      `${allowlisted.size} reviewed allowlist entries.`,
  );
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) main();
