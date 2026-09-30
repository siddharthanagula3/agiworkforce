#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SYNC = 'packages/contracts/cloud-contracts/src/sync.ts';
const PROJECTS = 'packages/contracts/cloud-contracts/src/projects.ts';
const MEMORY_WIRE = 'packages/contracts/types/src/memory-wire.ts';
const MEMORY_RS = 'apps/cli/src/cloud/memory.rs';
const PROJECTS_RS = 'apps/cli/src/cloud/projects.rs';
const CLOUD_RS = 'apps/cli/src/cloud/mod.rs';
const ARTIFACT_INDEX = 'packages/contracts/cloud-contracts/src/artifact-index.ts';
const ARTIFACTS_RS = 'apps/cli/src/cloud/artifacts.rs';
const CONSTANT_SOURCES = [SYNC, PROJECTS, MEMORY_WIRE];

/**
 * `sends` holds the CLI to what the server accepts; `reads` holds it to what the
 * server may leave out or send as null.
 */
export const STRUCT_PAIRS = [
  {
    rust: MEMORY_RS,
    struct: 'MemoryPushRequest',
    ts: SYNC,
    shape: 'MemorySyncPushRequestSchema',
    direction: 'sends',
  },
  {
    rust: MEMORY_RS,
    struct: 'MemoryPushItem',
    ts: SYNC,
    shape: 'MemorySyncPushItemSchema',
    direction: 'sends',
  },
  {
    rust: MEMORY_RS,
    struct: 'MemoryPullResponse',
    ts: SYNC,
    shape: 'MemorySyncPullResponseSchema',
    direction: 'reads',
  },
  {
    rust: MEMORY_RS,
    struct: 'MemoryDelta',
    ts: SYNC,
    shape: 'MemoryWireDeltaSchema',
    direction: 'reads',
  },
  {
    rust: MEMORY_RS,
    struct: 'MemoryPushResponse',
    ts: SYNC,
    shape: 'MemorySyncPushResponseSchema',
    direction: 'reads',
  },
  {
    rust: MEMORY_RS,
    struct: 'AppliedRow',
    ts: SYNC,
    shape: 'AppliedRowSchema',
    direction: 'reads',
  },
  {
    rust: MEMORY_RS,
    struct: 'MemoryConflict',
    ts: SYNC,
    shape: 'MemorySyncConflictSchema',
    direction: 'reads',
  },
  {
    rust: MEMORY_RS,
    struct: 'RejectedMemory',
    ts: SYNC,
    shape: 'MemorySyncRejectionSchema',
    direction: 'reads',
  },
  {
    rust: CLOUD_RS,
    struct: 'ImportPreview',
    ts: MEMORY_WIRE,
    shape: 'ManagedMemoryImportPreviewResponse',
    direction: 'reads',
  },
  {
    rust: CLOUD_RS,
    struct: 'ImportPreviewItem',
    ts: MEMORY_WIRE,
    shape: 'ManagedMemoryImportPreviewItem',
    direction: 'reads',
  },
  {
    rust: CLOUD_RS,
    struct: 'ImportResult',
    ts: MEMORY_WIRE,
    shape: 'ManagedMemoryImportCommitResponse',
    direction: 'reads',
  },
  {
    rust: PROJECTS_RS,
    struct: 'ProjectsPushRequest',
    ts: SYNC,
    shape: 'ProjectsSyncPushRequestSchema',
    direction: 'sends',
  },
  {
    rust: PROJECTS_RS,
    struct: 'ProjectPushItem',
    ts: SYNC,
    shape: 'ProjectSyncPushItemSchema',
    direction: 'sends',
  },
  {
    rust: PROJECTS_RS,
    struct: 'ProjectsPullResponse',
    ts: SYNC,
    shape: 'ProjectsSyncPullResponseSchema',
    direction: 'reads',
  },
  {
    rust: PROJECTS_RS,
    struct: 'ProjectDelta',
    ts: SYNC,
    shape: 'ProjectWireDeltaSchema',
    direction: 'reads',
  },
  {
    rust: PROJECTS_RS,
    struct: 'ProjectsPushResponse',
    ts: SYNC,
    shape: 'ProjectsSyncPushResponseSchema',
    direction: 'reads',
  },
  {
    rust: PROJECTS_RS,
    struct: 'AppliedRow',
    ts: SYNC,
    shape: 'AppliedRowSchema',
    direction: 'reads',
  },
  {
    rust: PROJECTS_RS,
    struct: 'ProjectConflict',
    ts: SYNC,
    shape: 'ProjectSyncConflictSchema',
    direction: 'reads',
  },
  {
    rust: ARTIFACTS_RS,
    struct: 'ArtifactIndexEntry',
    ts: ARTIFACT_INDEX,
    shape: 'ManagedCloudArtifactIndexEntrySchema',
    direction: 'reads',
  },
  {
    rust: ARTIFACTS_RS,
    struct: 'PublishedArtifact',
    ts: ARTIFACT_INDEX,
    shape: 'ManagedCloudPublishedArtifactSchema',
    direction: 'reads',
  },
];

export const JSON_BODY_PAIRS = [
  {
    rust: CLOUD_RS,
    fn: 'set_project_archived',
    ts: PROJECTS,
    shape: 'ManagedCloudProjectUpdateRequestSchema',
  },
  { rust: CLOUD_RS, fn: 'import_memories', ts: MEMORY_WIRE, shape: 'ManagedMemoryImportRequest' },
];

export const LIMIT_PAIRS = [
  {
    rust: MEMORY_RS,
    constant: 'CONTENT_MAX_CHARS',
    ts: SYNC,
    shape: 'MemorySyncPushItemSchema',
    key: 'content',
  },
  {
    rust: MEMORY_RS,
    constant: 'CATEGORY_MAX_CHARS',
    ts: SYNC,
    shape: 'MemorySyncPushItemSchema',
    key: 'category',
  },
  {
    rust: PROJECTS_RS,
    constant: 'NAME_MAX_CHARS',
    ts: SYNC,
    shape: 'ProjectSyncPushItemSchema',
    key: 'name',
  },
  {
    rust: PROJECTS_RS,
    constant: 'DESCRIPTION_MAX_CHARS',
    ts: SYNC,
    shape: 'ProjectSyncPushItemSchema',
    key: 'description',
  },
];

export const EQUAL_CONSTANTS = [
  {
    rust: MEMORY_RS,
    constant: 'SYNC_PROTOCOL_VERSION',
    ts: SYNC,
    tsConstant: 'SYNC_PROTOCOL_VERSION',
  },
];

function camelCase(name) {
  return name.replace(/_([a-z0-9])/g, (_, next) => next.toUpperCase());
}

function wireName(name, attributes, renameAll) {
  for (const attribute of attributes) {
    const renamed = /(?:\(|,|\s)rename\s*=\s*"([^"]+)"/.exec(attribute);
    if (renamed) return renamed[1];
  }
  if (!renameAll || renameAll === 'snake_case') return name;
  if (renameAll === 'camelCase') return camelCase(name);
  throw new Error(`rename_all = "${renameAll}" is not supported`);
}

export function parseRustStructs(source) {
  const structs = new Map();
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)\s*\{\s*$/.exec(lines[index]);
    if (!header) continue;
    let renameAll = null;
    for (let above = index - 1; above >= 0 && /^\s*(#\[|\/\/\/)/.test(lines[above]); above -= 1) {
      const container = /#\[serde\([^\]]*rename_all\s*=\s*"(\w+)"/.exec(lines[above]);
      if (container) renameAll = container[1];
    }
    const fields = [];
    let attributes = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor].trim();
      if (line === '}') break;
      if (line.startsWith('#[')) {
        attributes.push(line);
        continue;
      }
      if (line === '' || line.startsWith('//')) continue;
      const field = /^(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:\s*(.+?),?$/.exec(line);
      if (field) {
        const serde = attributes.filter((attribute) => attribute.startsWith('#[serde('));
        if (!serde.some((attribute) => /[(,\s]skip\s*[,)]/.test(attribute))) {
          fields.push({
            name: field[1],
            wire: wireName(field[1], serde, renameAll),
            option: /^Option\s*</.test(field[2]),
            defaulted: serde.some((attribute) => /[(,\s]default\s*[,)=]/.test(attribute)),
            skippedWhenEmpty: serde.some((attribute) => /skip_serializing_if/.test(attribute)),
          });
        }
      }
      attributes = [];
    }
    structs.set(header[1], { name: header[1], renameAll, fields });
  }
  return structs;
}

function skipQuoted(source, start) {
  const quote = source[start];
  let cursor = start + 1;
  while (cursor < source.length && source[cursor] !== quote) {
    cursor += source[cursor] === '\\' ? 2 : 1;
  }
  return cursor;
}

function skipInert(source, start, rust) {
  const char = source[start];
  if (rust && char === "'") {
    const literal = /^'(?:\\.|[^\\'])'/.exec(source.slice(start, start + 4));
    return literal ? start + literal[0].length - 1 : -1;
  }
  if (char === '"' || char === "'" || (char === '`' && !rust)) return skipQuoted(source, start);
  if (char === '/' && source[start + 1] === '/') {
    const end = source.indexOf('\n', start);
    return end === -1 ? source.length : end;
  }
  if (char === '/' && source[start + 1] === '*') {
    const end = source.indexOf('*/', start + 2);
    return end === -1 ? source.length : end + 1;
  }
  return -1;
}

function matchingClose(source, open, rust = false) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [pairs[source[open]]];
  for (let cursor = open + 1; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    const inert = skipInert(source, cursor, rust);
    if (inert !== -1) {
      cursor = inert;
      continue;
    }
    if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return cursor;
    }
  }
  throw new Error(`unbalanced ${source[open]} at offset ${open}`);
}

function splitTopLevel(body, separator, rust = false) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let cursor = 0; cursor < body.length; cursor += 1) {
    const char = body[cursor];
    const inert = skipInert(body, cursor, rust);
    if (inert !== -1) {
      cursor = inert;
      continue;
    }
    if ('{(['.includes(char)) depth += 1;
    else if ('})]'.includes(char)) depth -= 1;
    else if (depth === 0 && separator.includes(char)) {
      parts.push(body.slice(start, cursor));
      start = cursor + 1;
    }
  }
  parts.push(body.slice(start));
  return parts
    .map((part) =>
      part
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .trim(),
    )
    .filter(Boolean);
}

function topLevelCalls(expression) {
  const calls = [];
  let name = '';
  let depth = 0;
  let argumentStart = -1;
  for (let cursor = 0; cursor < expression.length; cursor += 1) {
    const char = expression[cursor];
    const inert = skipInert(expression, cursor, false);
    if (inert !== -1) {
      cursor = inert;
      continue;
    }
    if (char === '(' || char === '{' || char === '[') {
      if (depth === 0 && char === '(') argumentStart = cursor + 1;
      depth += 1;
      continue;
    }
    if (char === ')' || char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0 && char === ')') {
        calls.push({ name, argument: expression.slice(argumentStart, cursor).trim() });
        name = '';
      }
      continue;
    }
    if (depth > 0) continue;
    if (char === '.') name = '';
    else if (/[\w$]/.test(char)) name += char;
  }
  return calls;
}

function zodKey(expression) {
  const calls = topLevelCalls(expression).map((call) => call.name);
  const max = topLevelCalls(expression).find((call) => call.name === 'max');
  return {
    optional: calls.includes('optional') || calls.includes('default') || calls.includes('nullish'),
    nullable: calls.includes('nullable') || calls.includes('nullish'),
    max: max ? max.argument : null,
  };
}

function objectLiteralKeys(source, open, resolveSpread) {
  const keys = new Map();
  const close = matchingClose(source, open);
  for (const entry of splitTopLevel(source.slice(open + 1, close), ',')) {
    if (entry.startsWith('...')) {
      for (const [key, value] of resolveSpread(entry.slice(3).trim())) keys.set(key, value);
      continue;
    }
    const pair = /^['"]?([\w$]+)['"]?\s*:\s*([\s\S]+)$/.exec(entry);
    if (!pair) throw new Error(`unreadable object entry: ${entry.slice(0, 80)}`);
    keys.set(pair[1], zodKey(pair[2]));
  }
  return keys;
}

export function readTsShape(source, name) {
  const escaped = name.replace(/\$/g, '\\$');
  const schema = new RegExp(
    `(?:export\\s+)?const\\s+${escaped}\\s*=\\s*z\\s*\\.\\s*object\\s*\\(\\s*\\{`,
  ).exec(source);
  const resolveSpread = (identifier) => {
    const spread = new RegExp(`const\\s+${identifier}\\s*=\\s*\\{`).exec(source);
    if (!spread) throw new Error(`spread ${identifier} is not an object literal in the same file`);
    return objectLiteralKeys(source, spread.index + spread[0].length - 1, resolveSpread);
  };
  if (schema) return objectLiteralKeys(source, schema.index + schema[0].length - 1, resolveSpread);
  const shape = new RegExp(`(?:export\\s+)?interface\\s+${escaped}\\s*\\{`).exec(source);
  if (!shape) return null;
  const open = shape.index + shape[0].length - 1;
  const keys = new Map();
  for (const entry of splitTopLevel(source.slice(open + 1, matchingClose(source, open)), ';\n')) {
    const member = /^(?:readonly\s+)?([\w$]+)(\??)\s*:\s*([\s\S]+)$/.exec(entry);
    if (!member) throw new Error(`unreadable interface member in ${name}: ${entry.slice(0, 80)}`);
    keys.set(member[1], {
      optional: member[2] === '?',
      nullable: /(^|\|)\s*null\s*(\||$)/.test(member[3]),
      max: null,
    });
  }
  return keys;
}

export function jsonBodyKeys(source, functionName) {
  const header = new RegExp(`fn\\s+${functionName}\\s*[<(]`).exec(source);
  if (!header) return null;
  const bodyOpen = source.indexOf('{', source.indexOf(')', header.index));
  const body = source.slice(bodyOpen, matchingClose(source, bodyOpen, true) + 1);
  const bodies = [];
  for (const literal of body.matchAll(/json!\s*\(\s*\{/g)) {
    const open = literal.index + literal[0].length - 1;
    const keys = splitTopLevel(
      body.slice(open + 1, matchingClose(body, open, true)),
      ',',
      true,
    ).map((entry) => /^"([^"]+)"\s*:/.exec(entry)?.[1] ?? null);
    bodies.push(keys);
  }
  return bodies;
}

function numberLiteral(text) {
  const value = /^[\d_]+$/.test(text.trim()) ? Number(text.trim().replace(/_/g, '')) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function rustConstant(source, name) {
  const found = new RegExp(`const\\s+${name}\\s*:\\s*\\w+\\s*=\\s*([\\d_]+)\\s*;`).exec(source);
  return found ? numberLiteral(found[1]) : null;
}

export function tsConstant(sources, name) {
  for (const source of sources) {
    const found = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([\\d_]+)\\s*;`).exec(source);
    if (found) return numberLiteral(found[1]);
  }
  return null;
}

export function compareStruct(pair, rustStruct, tsKeys) {
  const problems = [];
  const where = `${pair.rust} ${pair.struct} vs ${pair.ts} ${pair.shape}`;
  const byWire = new Map(rustStruct.fields.map((field) => [field.wire, field]));
  for (const field of rustStruct.fields) {
    const key = tsKeys.get(field.wire);
    if (!key) {
      problems.push(
        `${where}: ${field.name} goes over the wire as "${field.wire}", which the contract does not have`,
      );
      continue;
    }
    if (pair.direction === 'reads') {
      if (key.nullable && !field.option) {
        problems.push(`${where}: "${field.wire}" may be null, so ${field.name} must be an Option`);
      }
      if (key.optional && !field.option && !field.defaulted) {
        problems.push(
          `${where}: "${field.wire}" may be absent, so ${field.name} needs #[serde(default)] or an Option`,
        );
      }
    } else if (field.option && !field.skippedWhenEmpty && !key.nullable) {
      problems.push(
        `${where}: ${field.name} sends null for "${field.wire}", which the contract refuses`,
      );
    }
  }
  if (pair.direction === 'sends') {
    for (const [wire, key] of tsKeys) {
      if (!key.optional && !byWire.has(wire)) {
        problems.push(`${where}: the contract requires "${wire}", which the CLI never sends`);
      }
    }
  }
  return problems;
}

export function auditRepository(root = REPO_ROOT) {
  const cache = new Map();
  const read = (relative) => {
    if (!cache.has(relative))
      cache.set(relative, fs.readFileSync(path.join(root, relative), 'utf8'));
    return cache.get(relative);
  };
  const problems = [];
  let checked = 0;
  for (const pair of STRUCT_PAIRS) {
    const rustStruct = parseRustStructs(read(pair.rust)).get(pair.struct);
    const tsKeys = readTsShape(read(pair.ts), pair.shape);
    if (!rustStruct)
      problems.push(`${pair.rust}: struct ${pair.struct} is gone; update STRUCT_PAIRS`);
    if (!tsKeys) problems.push(`${pair.ts}: ${pair.shape} is gone; update STRUCT_PAIRS`);
    if (!rustStruct || !tsKeys) continue;
    problems.push(...compareStruct(pair, rustStruct, tsKeys));
    checked += 1;
  }
  for (const pair of JSON_BODY_PAIRS) {
    const bodies = jsonBodyKeys(read(pair.rust), pair.fn);
    const tsKeys = readTsShape(read(pair.ts), pair.shape);
    if (!bodies || bodies.length === 0) {
      problems.push(`${pair.rust}: fn ${pair.fn} builds no json! body; update JSON_BODY_PAIRS`);
      continue;
    }
    if (!tsKeys) {
      problems.push(`${pair.ts}: ${pair.shape} is gone; update JSON_BODY_PAIRS`);
      continue;
    }
    for (const keys of bodies) {
      for (const key of keys) {
        if (key === null)
          problems.push(`${pair.rust} ${pair.fn}: a json! body key is not a string literal`);
        else if (!tsKeys.has(key)) {
          problems.push(
            `${pair.rust} ${pair.fn}: sends "${key}", which ${pair.shape} does not have`,
          );
        }
      }
      for (const [wire, key] of tsKeys) {
        if (!key.optional && !keys.includes(wire)) {
          problems.push(
            `${pair.rust} ${pair.fn}: ${pair.shape} requires "${wire}", which the body leaves out`,
          );
        }
      }
    }
    checked += 1;
  }
  const constantSources = CONSTANT_SOURCES.map(read);
  for (const pair of LIMIT_PAIRS) {
    const cli = rustConstant(read(pair.rust), pair.constant);
    const max = readTsShape(read(pair.ts), pair.shape)?.get(pair.key)?.max ?? null;
    const server = max === null ? null : (numberLiteral(max) ?? tsConstant(constantSources, max));
    if (cli === null || server === null) {
      problems.push(
        `${pair.rust} ${pair.constant} or ${pair.shape}.${pair.key} has no readable limit`,
      );
    } else if (cli > server) {
      problems.push(
        `${pair.rust} ${pair.constant} is ${cli}, above the ${server} ${pair.shape}.${pair.key} accepts`,
      );
    }
    checked += 1;
  }
  for (const pair of EQUAL_CONSTANTS) {
    const cli = rustConstant(read(pair.rust), pair.constant);
    const server = tsConstant([read(pair.ts)], pair.tsConstant);
    if (cli === null || server === null || cli !== server) {
      problems.push(
        `${pair.rust} ${pair.constant} is ${cli}, but ${pair.ts} ${pair.tsConstant} is ${server}`,
      );
    }
    checked += 1;
  }
  return { checked, problems };
}

function main() {
  const { checked, problems } = auditRepository();
  if (problems.length > 0) {
    console.error(
      `check-cli-wire-parity: the CLI and the shared contracts disagree:\n  ${problems.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(
    `check-cli-wire-parity: ${checked} CLI wire shapes and limits match the shared contracts`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
