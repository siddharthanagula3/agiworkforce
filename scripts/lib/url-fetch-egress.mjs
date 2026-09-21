import fs from 'node:fs';
import path from 'node:path';

const OUTBOUND_CALLEES = ['fetchImpl', 'pinnedPublicFetch', 'fetch'];

export function sourceFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...sourceFilesUnder(full));
      continue;
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
    if (entry.name.includes('.test.') || entry.name.endsWith('.d.ts')) continue;
    out.push(full);
  }
  return out.sort();
}

function matchingBrace(source, open) {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    const char = source[at];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
  }
  return source.length;
}

function matchingParen(source, open) {
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    const char = source[at];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?(?:const|let)\s+(\w+)/gm;

/**
 * Every module-scope function with the span of its body, so a fetch call can be
 * attributed to the function that has to vet the host before making it.
 */
function bodyBrace(source, afterName) {
  const open = source.indexOf('(', afterName);
  if (open === -1) return -1;
  if (/[;'"`{}]/.test(source.slice(afterName, open))) return -1;
  const close = matchingParen(source, open);
  if (close === -1) return -1;
  let angle = 0;
  for (let at = close + 1; at < source.length; at += 1) {
    const char = source[at];
    if (char === '<') angle += 1;
    else if (char === '>') angle = Math.max(0, angle - 1);
    else if (char === ';') return -1;
    else if (char === '{' && angle === 0) return at;
  }
  return -1;
}

export function moduleScopeFunctions(source) {
  const functions = [];
  DECLARATION.lastIndex = 0;
  let match;
  while ((match = DECLARATION.exec(source)) !== null) {
    const name = match[1] ?? match[2];
    const brace = bodyBrace(source, match.index + match[0].length);
    if (brace === -1) continue;
    functions.push({ name, start: match.index, end: matchingBrace(source, brace) });
  }
  return functions.filter((fn) => fn.end > fn.start);
}

const REDIRECT = /\bredirect\s*:\s*['"](\w+)['"]/;

/** `function pinnedPublicFetch(` is the definition, not a call to it. */
function isDeclarationHeader(source, at) {
  const lineStart = source.lastIndexOf('\n', at) + 1;
  const prefix = source.slice(lineStart, at);
  return /(?:^|\s)(?:function|class)\s+$/.test(prefix) || /(?:^|\s)(?:const|let)\s+$/.test(prefix);
}

/**
 * Outbound fetch calls with the redirect mode each one asks for, `null` when it
 * names none and the client's own default decides.
 */
export function outboundFetchCalls(source) {
  const calls = [];
  for (const callee of OUTBOUND_CALLEES) {
    const needle = `${callee}(`;
    for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
      const before = source[at - 1];
      if (before && /[\w.$]/.test(before)) continue;
      if (isDeclarationHeader(source, at)) continue;
      const close = matchingParen(source, at + callee.length);
      if (close === -1) continue;
      const args = source.slice(at + needle.length, close);
      if (/^\s*$/.test(args)) continue;
      const redirect = REDIRECT.exec(args);
      const target = /^\s*([\w.$]+)/.exec(args);
      calls.push({
        callee,
        index: at,
        target: target ? target[1] : null,
        redirect: redirect ? redirect[1] : null,
      });
    }
  }
  return calls.sort((left, right) => left.index - right.index);
}
