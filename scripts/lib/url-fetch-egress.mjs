import fs from 'node:fs';
import path from 'node:path';

const OUTBOUND_CALLEES = ['fetchImpl', 'pinnedPublicFetch', 'fetch'];

/**
 * A module that calls the resolved-host guard is telling us the URL is not one
 * it chose. That, plus the tool surfaces, is the set this rule governs.
 */
export function unvettedUrlModules(roots, guard, extraDirs = []) {
  const found = new Set();
  for (const root of roots) {
    for (const file of sourceFilesUnder(root)) {
      if (fs.readFileSync(file, 'utf8').includes(guard)) found.add(file);
    }
  }
  for (const dir of extraDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of sourceFilesUnder(dir)) found.add(file);
  }
  return [...found].sort();
}

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

/** Endpoint constants this module imports, resolved one level into their file. */
export function importedEndpointNames(source, file, scanRoot) {
  const names = [];
  IMPORT.lastIndex = 0;
  let match;
  while ((match = IMPORT.exec(source)) !== null) {
    const specifier = match[2];
    const resolved = resolveModule(specifier, file, scanRoot);
    if (!resolved) continue;
    const exported = fixedEndpointNames(fs.readFileSync(resolved, 'utf8'));
    for (const name of match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0])) {
      if (exported.includes(name)) names.push(name);
    }
  }
  return names;
}

function resolveModule(specifier, file, scanRoot) {
  const base = specifier.startsWith('@/')
    ? path.join(scanRoot, 'apps/web', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(file), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

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

const ENDPOINT_CONST = /^(?:export\s+)?const\s+(\w+)\s*=\s*(['"`][^\n;]*)/gm;

/**
 * Module constants holding a literal endpoint, including one built from another
 * such constant. A call to one of those reaches the vendor the allowlist
 * already vouches for, not a host someone else chose.
 */
export function fixedEndpointNames(source, imported = []) {
  const candidates = [];
  ENDPOINT_CONST.lastIndex = 0;
  let match;
  while ((match = ENDPOINT_CONST.exec(source)) !== null) {
    candidates.push({ name: match[1], value: match[2] });
  }
  const fixed = new Set(imported);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const candidate of candidates) {
      if (fixed.has(candidate.name)) continue;
      if (/https?:\/\//.test(candidate.value)) {
        fixed.add(candidate.name);
        continue;
      }
      const interpolated = [...candidate.value.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]);
      if (interpolated.length > 0 && interpolated.every((name) => fixed.has(name))) {
        fixed.add(candidate.name);
      }
    }
  }
  const builders = [
    ...source.matchAll(/function\s+(\w+)\([^)]*\)[^{]*\{\s*return\s+([`'"][^\n;]*)/g),
  ];
  for (const builder of builders) {
    const value = builder[2];
    const interpolated = [...value.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]);
    if (/https?:\/\//.test(value) || interpolated.some((name) => fixed.has(name))) {
      fixed.add(builder[1]);
    }
  }
  return [...fixed];
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
