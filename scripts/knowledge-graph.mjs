#!/usr/bin/env node
// Export and import names are taken from code tokens. A comment or string that
// spells `export function` is not a symbol: the known-flaws register already
// records guards that credited comments as contracts.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const GENERATED_BANNER =
  'GENERATED FILE, do not edit. Run `node scripts/generate-agent-context-indexes.mjs` after tracked files change; it renders from git ls-files, so a file that is not committed is not in the graph, and `pnpm check:agent-context-indexes` byte-compares this against a fresh render.';

const MAX_PARSE_BYTES = 512 * 1024;
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.rs',
  '.py',
  '.sql',
  '.swift',
]);
const JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.icns',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp4',
  '.zip',
  '.gz',
  '.vsix',
  '.wasm',
  '.node',
  '.dylib',
  '.so',
  '.dll',
  '.exe',
  '.pyc',
]);
const LOCKFILE_NAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'Cargo.lock',
  'yarn.lock',
  'bun.lock',
]);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.rs'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const ROUTE_FILES = new Map([
  ['page', 'page'],
  ['route', 'endpoint'],
  ['layout', 'layout'],
  ['loading', 'loading'],
  ['error', 'error'],
  ['not-found', 'not-found'],
  ['template', 'template'],
  ['default', 'default'],
  ['forbidden', 'forbidden'],
  ['unauthorized', 'unauthorized'],
]);

const LIMITS = [
  'Every git-tracked path is a file node. Gitignored build output, dependencies, and the iOS prebuild tree are outside the graph.',
  'A tracked path the renderer is told is opaque, such as a measurement file named after the model it measured, is folded into one record for its directory with a count, because the model registry owns every model id.',
  'Export and import names come from a scan of code tokens. A name built by concatenation is not expanded.',
  "export * and pub use glob re-exports keep an edge to the target module and do not copy that module's names.",
  'A call inside a function body is not an edge. Follow the import to the file and read it.',
  'Workspace edges come from the TypeScript task graph and cargo metadata. Path aliases and relative imports are resolved to tracked files when the target exists.',
  'Route urls are Next.js app-router and Expo Router paths. An intercepting or parallel route keeps its file and segments and has no canonical url.',
  'SQL names are CREATE TABLE and CREATE VIEW identifiers.',
  'Generator edges are the protocol ts-rs export and the model-registry compile outputs named in AGENTS.md.',
  'Lane write paths, risk-map.json, commands.json, and the concept, feature, and domain registries stay the owners of those contracts. This graph points at their files.',
];

const LONG_DASH_CLAUSE = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, 'g');

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function isSpace(char) {
  const code = char.charCodeAt(0);
  if (code <= 32)
    return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32;
  return (
    code === 160 ||
    code === 0xfeff ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

function isIdentStart(char) {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === '_' || char === '$';
}

function isIdentPart(char) {
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    char === '_' ||
    char === '$'
  );
}

function blankRange(source, start, end) {
  let out = '';
  let runStart = start;
  for (let i = start; i < end; i += 1) {
    if (source[i] !== '\n') continue;
    const run = i - runStart;
    if (run) out += ' '.repeat(run);
    out += '\n';
    runStart = i + 1;
  }
  const tail = end - runStart;
  if (tail) out += ' '.repeat(tail);
  return out;
}

function skipSpace(source, index) {
  let i = index;
  while (i < source.length && isSpace(source[i])) i += 1;
  return i;
}

function startsWithWord(source, index, word) {
  if (!source.startsWith(word, index)) return false;
  const after = source[index + word.length];
  return after === undefined || !isIdentPart(after);
}

function readIdentAt(source, index) {
  const i = skipSpace(source, index);
  if (!isIdentStart(source[i] ?? '')) return null;
  let j = i + 1;
  while (j < source.length && isIdentPart(source[j])) j += 1;
  return { name: source.slice(i, j), end: j };
}

function readStringLiteral(source, index) {
  const quote = source[index];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  let j = index + 1;
  while (j < source.length) {
    if (source[j] === '\\') {
      value += source[j + 1] ?? '';
      j += 2;
      continue;
    }
    if (quote === '`' && source[j] === '$' && source[j + 1] === '{') return null;
    if (source[j] === quote) return value;
    if (source[j] === '\n' && quote !== '`') return null;
    value += source[j];
    j += 1;
  }
  return null;
}

function skipTrivia(source, index) {
  let i = index;
  const n = source.length;
  while (i < n) {
    if (isSpace(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      continue;
    }
    break;
  }
  return i;
}

function readFollowingString(source, index) {
  const at = skipTrivia(source, index);
  return readStringLiteral(source, at);
}

export function scanJavaScriptModule(source) {
  const imports = [];
  const pieces = [];
  const mode = ['code'];
  const interpolations = [];
  let brace = 0;
  let paren = 0;
  let bracket = 0;
  let lastWord = '';
  let i = 0;
  let mark = 0;
  const n = source.length;

  const inTemplate = () => mode[mode.length - 1] === 'template';
  const depth = () => brace + paren + bracket;

  function flush(to) {
    if (to > mark) pieces.push(source.slice(mark, to));
    mark = to;
  }

  function emitBlank(from, to) {
    flush(from);
    if (to > from) pieces.push(blankRange(source, from, to));
    mark = to;
  }

  while (i < n) {
    if (inTemplate()) {
      const start = i;
      while (i < n) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '`' || (source[i] === '$' && source[i + 1] === '{')) break;
        i += 1;
      }
      emitBlank(start, i);
      if (i >= n) break;
      if (source[i] === '`') {
        mode.pop();
        emitBlank(i, i + 1);
        i += 1;
        continue;
      }
      mode.push('code');
      interpolations.push(brace + 1);
      emitBlank(i, i + 2);
      i += 2;
      brace += 1;
      continue;
    }

    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const start = i;
      i += 2;
      while (i < n && source[i] !== '\n') i += 1;
      emitBlank(start, i);
      continue;
    }
    if (c === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      emitBlank(start, i);
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === c) {
          i += 1;
          break;
        }
        if (source[i] === '\n') break;
        i += 1;
      }
      emitBlank(start, i);
      continue;
    }
    if (c === '`') {
      mode.push('template');
      emitBlank(i, i + 1);
      i += 1;
      continue;
    }
    if (c === '{') {
      brace += 1;
      i += 1;
      lastWord = '';
      continue;
    }
    if (c === '}') {
      const closesInterpolation =
        interpolations.length > 0 && interpolations[interpolations.length - 1] === brace;
      brace = Math.max(0, brace - 1);
      i += 1;
      lastWord = '';
      if (closesInterpolation) {
        interpolations.pop();
        mode.pop();
      }
      continue;
    }
    if (c === '(') {
      if ((lastWord === 'import' || lastWord === 'require') && paren === 0) {
        const spec = readFollowingString(source, i + 1);
        if (spec) imports.push(spec);
      }
      paren += 1;
      i += 1;
      lastWord = '';
      continue;
    }
    if (c === ')') {
      paren = Math.max(0, paren - 1);
      i += 1;
      lastWord = '';
      continue;
    }
    if (c === '[') {
      bracket += 1;
      i += 1;
      lastWord = '';
      continue;
    }
    if (c === ']') {
      bracket = Math.max(0, bracket - 1);
      i += 1;
      lastWord = '';
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      i += 1;
      while (i < n && isIdentPart(source[i])) i += 1;
      const word = source.slice(start, i);
      if (depth() === 0 && (word === 'from' || word === 'import')) {
        const spec = readFollowingString(source, i);
        if (spec) imports.push(spec);
      }
      lastWord = word;
      continue;
    }
    if (!isSpace(c)) lastWord = '';
    i += 1;
  }

  flush(n);
  return {
    exports: extractJavaScriptExports(pieces.join('')),
    imports: uniqueSorted(imports),
  };
}

function braceExportNames(inner) {
  const names = [];
  let current = '';
  let depth = 0;
  const parts = [];
  for (const char of inner) {
    if (char === '{') depth += 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    if (char === '}') depth = Math.max(0, depth - 1);
    current += char;
  }
  parts.push(current);
  for (const part of parts) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    let index = tokens[0] === 'type' ? 1 : 0;
    if (!tokens[index]) continue;
    const asAt = tokens.indexOf('as', index);
    const name = asAt !== -1 && tokens[asAt + 1] ? tokens[asAt + 1] : tokens[index];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
  }
  return names;
}

function regexCanFollow(source, index) {
  let previous = index - 1;
  while (previous >= 0 && isSpace(source[previous])) previous -= 1;
  const char = source[previous];
  if (char === undefined) return true;
  return !isIdentPart(char) && char !== ')' && char !== ']';
}

function skipRegexLiteral(source, index) {
  if (source[index] !== '/') return index;
  let cursor = index + 1;
  let inClass = false;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '\n') return index;
    if (source[cursor] === '[') inClass = true;
    else if (source[cursor] === ']') inClass = false;
    else if (source[cursor] === '/' && !inClass) {
      cursor += 1;
      while (cursor < source.length) {
        const code = source.charCodeAt(cursor);
        if (code < 97 || code > 122) break;
        cursor += 1;
      }
      return cursor;
    }
    cursor += 1;
  }
  return index;
}

function readBindingNames(source, start) {
  const names = [];
  let i = start;

  function skip() {
    while (i < source.length && isSpace(source[i])) i += 1;
  }

  function ident() {
    skip();
    const found = readIdentAt(source, i);
    if (!found) return null;
    i = found.end;
    return found.name;
  }

  function pattern() {
    skip();
    if (source[i] === '{') {
      i += 1;
      while (i < source.length && source[i] !== '}') {
        skip();
        if (source[i] === '}') break;
        if (source[i] === '.') {
          while (source[i] === '.') i += 1;
          const name = ident();
          if (name) names.push(name);
        } else {
          const key = ident();
          if (!key) {
            i += 1;
            continue;
          }
          skip();
          if (source[i] === ':') {
            i += 1;
            pattern();
          } else names.push(key);
        }
        skip();
        if (source[i] === ',') i += 1;
      }
      if (source[i] === '}') i += 1;
      return;
    }
    if (source[i] === '[') {
      i += 1;
      while (i < source.length && source[i] !== ']') {
        skip();
        if (source[i] === ',') {
          i += 1;
          continue;
        }
        if (source[i] === ']') break;
        if (source[i] === '.') {
          while (source[i] === '.') i += 1;
          const name = ident();
          if (name) names.push(name);
        } else {
          const before = i;
          pattern();
          if (i === before) i += 1;
        }
        skip();
        if (source[i] === ',') i += 1;
      }
      if (source[i] === ']') i += 1;
      return;
    }
    const name = ident();
    if (name) names.push(name);
  }

  while (i < source.length) {
    pattern();
    skip();
    if (source[i] === ':') {
      i += 1;
      let typeDepth = 0;
      while (i < source.length) {
        const char = source[i];
        if (char === '<' || char === '(' || char === '{' || char === '[') typeDepth += 1;
        else if (char === '>' || char === ')' || char === '}' || char === ']') {
          typeDepth = Math.max(0, typeDepth - 1);
        } else if ((char === '=' || char === ',') && typeDepth === 0) break;
        i += 1;
      }
    }
    skip();
    if (source[i] === '=') {
      i += 1;
      let objectDepth = 0;
      let parenDepth = 0;
      let arrayDepth = 0;
      while (i < source.length) {
        const char = source[i];
        if (char === '{') objectDepth += 1;
        else if (char === '}') {
          if (objectDepth === 0) break;
          objectDepth -= 1;
        } else if (char === '(') parenDepth += 1;
        else if (char === ')') parenDepth -= 1;
        else if (char === '[') arrayDepth += 1;
        else if (char === ']') {
          if (arrayDepth === 0 && objectDepth === 0 && parenDepth === 0) break;
          arrayDepth -= 1;
        } else if (
          (char === ',' || char === ';') &&
          objectDepth === 0 &&
          parenDepth === 0 &&
          arrayDepth === 0
        ) {
          break;
        } else if (
          char === '/' &&
          source[i + 1] !== '/' &&
          source[i + 1] !== '*' &&
          objectDepth === 0 &&
          parenDepth === 0 &&
          arrayDepth === 0 &&
          regexCanFollow(source, i)
        ) {
          const next = skipRegexLiteral(source, i);
          if (next > i) {
            i = next;
            continue;
          }
        }
        i += 1;
      }
    }
    skip();
    if (source[i] === ',') {
      i += 1;
      continue;
    }
    break;
  }
  return names;
}

function extractJavaScriptExports(masked) {
  const names = new Set();
  const re = /\bexport\b/g;
  let match = re.exec(masked);
  while (match) {
    let i = skipSpace(masked, match.index + 'export'.length);
    if (startsWithWord(masked, i, 'type')) {
      const after = skipSpace(masked, i + 4);
      if (masked[after] !== '{' && masked[after] !== '*') {
        const found = readIdentAt(masked, after);
        if (found) names.add(found.name);
        match = re.exec(masked);
        continue;
      }
      i = after;
    }
    if (startsWithWord(masked, i, 'declare')) i = skipSpace(masked, i + 'declare'.length);
    if (masked[i] === '{') {
      const end = masked.indexOf('}', i);
      if (end !== -1) {
        for (const name of braceExportNames(masked.slice(i + 1, end))) names.add(name);
      }
      match = re.exec(masked);
      continue;
    }
    if (masked[i] === '*') {
      i = skipSpace(masked, i + 1);
      if (startsWithWord(masked, i, 'as')) {
        const found = readIdentAt(masked, i + 2);
        if (found) names.add(found.name);
      }
      match = re.exec(masked);
      continue;
    }
    if (startsWithWord(masked, i, 'default')) {
      names.add('default');
      i = skipSpace(masked, i + 'default'.length);
      if (startsWithWord(masked, i, 'async')) i = skipSpace(masked, i + 'async'.length);
      if (startsWithWord(masked, i, 'abstract')) i = skipSpace(masked, i + 'abstract'.length);
      for (const kind of ['function', 'class', 'interface']) {
        if (!startsWithWord(masked, i, kind)) continue;
        i = skipSpace(masked, i + kind.length);
        if (kind === 'function' && masked[i] === '*') i = skipSpace(masked, i + 1);
        const found = readIdentAt(masked, i);
        if (found) names.add(found.name);
        break;
      }
      match = re.exec(masked);
      continue;
    }
    if (startsWithWord(masked, i, 'async')) i = skipSpace(masked, i + 'async'.length);
    if (startsWithWord(masked, i, 'abstract')) i = skipSpace(masked, i + 'abstract'.length);
    const kinds = [
      'function',
      'class',
      'interface',
      'enum',
      'namespace',
      'type',
      'const',
      'let',
      'var',
    ];
    const kind = kinds.find((candidate) => startsWithWord(masked, i, candidate));
    if (kind) {
      i = skipSpace(masked, i + kind.length);
      if (kind === 'function' && masked[i] === '*') i = skipSpace(masked, i + 1);
      if (kind === 'const' || kind === 'let' || kind === 'var') {
        for (const name of readBindingNames(masked, i)) names.add(name);
      } else {
        const found = readIdentAt(masked, i);
        if (found) names.add(found.name);
      }
    }
    match = re.exec(masked);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function maskComments(source) {
  const pieces = [];
  let i = 0;
  let mark = 0;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '/') {
      if (i > mark) pieces.push(source.slice(mark, i));
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      mark = i;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      if (i > mark) pieces.push(source.slice(mark, i));
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(source.length, i + 2);
      pieces.push(' ');
      mark = i;
      continue;
    }
    i += 1;
  }
  if (mark < source.length) pieces.push(source.slice(mark));
  return pieces.join('');
}

function maskRustCode(source) {
  const commentsKept = maskComments(source);
  const pieces = [];
  let i = 0;
  let mark = 0;
  const n = commentsKept.length;
  while (i < n) {
    const c = commentsKept[i];
    if (c === "'" || c === '"') {
      const start = i;
      i += 1;
      while (i < n) {
        if (commentsKept[i] === '\\') {
          i += 2;
          continue;
        }
        if (commentsKept[i] === c) {
          i += 1;
          break;
        }
        if (commentsKept[i] === '\n') break;
        i += 1;
      }
      if (start > mark) pieces.push(commentsKept.slice(mark, start));
      pieces.push(blankRange(commentsKept, start, i));
      mark = i;
      continue;
    }
    i += 1;
  }
  if (mark < n) pieces.push(commentsKept.slice(mark));
  return { masked: pieces.join(''), withStrings: commentsKept };
}

function expandUseTree(text) {
  const results = [];
  let i = 0;

  function skip() {
    while (i < text.length && isSpace(text[i])) i += 1;
  }

  function ident() {
    skip();
    const found = /^[A-Za-z_]\w*/.exec(text.slice(i));
    if (!found) return null;
    i += found[0].length;
    return found[0];
  }

  function parsePath(prefix) {
    skip();
    if (text[i] === '*') {
      i += 1;
      results.push({ parts: prefix, glob: true, alias: null });
      return;
    }
    const name = ident();
    if (!name) {
      if (i < text.length) i += 1;
      return;
    }
    const next = prefix.concat(name);
    skip();
    if (text.startsWith('::', i)) {
      i += 2;
      skip();
      if (text[i] === '{') {
        i += 1;
        while (i < text.length && text[i] !== '}') {
          skip();
          if (text[i] === '}') break;
          parsePath(next);
          skip();
          if (text[i] === ',') i += 1;
        }
        if (text[i] === '}') i += 1;
        return;
      }
      if (text[i] === '*') {
        i += 1;
        results.push({ parts: next, glob: true, alias: null });
        return;
      }
      parsePath(next);
      return;
    }
    skip();
    let alias = null;
    if (text.startsWith('as', i) && !isIdentPart(text[i + 2] ?? '')) {
      i += 2;
      alias = ident();
    }
    results.push({ parts: next, glob: false, alias });
  }

  parsePath([]);
  return results;
}

export function scanRustModule(source) {
  const { masked, withStrings } = maskRustCode(source);
  const exports = new Set();
  const item =
    /\bpub(?:\s*\([^)]*\))?(?:\s+(?:async|unsafe))*\s+(?:const\s+)?(?:fn|struct|enum|trait|type|static|mod)\s+([A-Za-z_]\w*)/g;
  let match = item.exec(masked);
  while (match) {
    exports.add(match[1]);
    match = item.exec(masked);
  }
  const constants = /\bpub(?:\s*\([^)]*\))?\s+const\s+(?!fn\b|async\b|unsafe\b)([A-Za-z_]\w*)/g;
  match = constants.exec(masked);
  while (match) {
    exports.add(match[1]);
    match = constants.exec(masked);
  }
  const macros = /\bmacro_rules!\s*([A-Za-z_]\w*)/g;
  match = macros.exec(masked);
  while (match) {
    exports.add(match[1]);
    match = macros.exec(masked);
  }

  const imports = [];
  const useRe = /\b(?:pub(?:\s*\([^)]*\))?\s+)?use\s+([^;]+);/g;
  match = useRe.exec(masked);
  while (match) {
    for (const entry of expandUseTree(match[1])) {
      if (entry.glob) {
        imports.push({ parts: entry.parts, exported: null });
        continue;
      }
      const exported = match[0].trimStart().startsWith('pub')
        ? entry.alias || entry.parts[entry.parts.length - 1]
        : null;
      if (exported && exported !== 'self' && exported !== 'super' && exported !== 'crate') {
        exports.add(exported);
      }
      imports.push({ parts: entry.parts, exported });
    }
    match = useRe.exec(masked);
  }

  const commands = [];
  const slash = /builtin_slash\(\s*"([^"]+)"/g;
  match = slash.exec(withStrings);
  while (match) {
    commands.push(match[1]);
    match = slash.exec(withStrings);
  }

  return {
    exports: [...exports].sort((a, b) => a.localeCompare(b)),
    uses: imports,
    commands: uniqueSorted(commands),
  };
}

function scanPythonModule(source) {
  const exports = [];
  for (const line of maskComments(source).split('\n')) {
    const found = /^(?:async\s+def|def|class)\s+([A-Za-z_]\w*)/.exec(line);
    if (found) exports.push(found[1]);
  }
  const imports = [];
  const text = maskComments(source);
  for (const match of text.matchAll(/^\s*import\s+([A-Za-z0-9_., ]+)/gm)) {
    for (const name of match[1].split(',')) {
      const head = name.trim().split(/\s+as\s+|\s+/)[0];
      if (head) imports.push(head);
    }
  }
  for (const match of text.matchAll(/^\s*from\s+(\.+)?([A-Za-z0-9_.]*)\s+import\s+/gm)) {
    const spec = `${match[1] ?? ''}${match[2] ?? ''}`;
    if (spec) imports.push(spec);
  }
  return { exports: uniqueSorted(exports), imports: uniqueSorted(imports) };
}

function scanSwiftModule(source) {
  const masked = maskComments(source);
  const exports = [];
  for (const match of masked.matchAll(
    /\b(?:public|open)\s+(?:func|class|struct|enum|protocol|actor)\s+([A-Za-z_]\w*)/g,
  )) {
    exports.push(match[1]);
  }
  return { exports: uniqueSorted(exports), imports: [] };
}

function maskSql(source) {
  const pieces = [];
  let i = 0;
  let mark = 0;
  const n = source.length;
  while (i < n) {
    if (source[i] === '-' && source[i + 1] === '-') {
      if (i > mark) pieces.push(source.slice(mark, i));
      while (i < n && source[i] !== '\n') i += 1;
      mark = i;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      if (i > mark) pieces.push(source.slice(mark, i));
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(n, i + 2);
      mark = i;
      continue;
    }
    if (source[i] === "'") {
      const start = i;
      i += 1;
      while (i < n) {
        if (source[i] === "'" && source[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (source[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      if (start > mark) pieces.push(source.slice(mark, start));
      pieces.push(' ');
      mark = i;
      continue;
    }
    if (source[i] === '$') {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(source.slice(i, i + 64));
      if (tag) {
        if (i > mark) pieces.push(source.slice(mark, i));
        const end = source.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? n : end + tag[0].length;
        pieces.push(' ');
        mark = i;
        continue;
      }
    }
    i += 1;
  }
  if (mark < n) pieces.push(source.slice(mark));
  return pieces.join('');
}

function scanSql(source) {
  const masked = maskSql(source);
  const names = [];
  const table =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)/gi;
  const view =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)/gi;
  for (const re of [table, view]) {
    let match = re.exec(masked);
    while (match) {
      names.push(match[1].replace(/"/g, '').replace(/\s+/g, ''));
      match = re.exec(masked);
    }
  }
  return uniqueSorted(names);
}

function extensionOf(filePath) {
  return path.posix.extname(filePath).toLowerCase();
}

function fileRole(filePath) {
  const ext = extensionOf(filePath);
  const base = path.posix.basename(filePath);
  if (filePath.includes('/generated/') || base.includes('.generated.')) return 'generated';
  if (
    filePath.includes('/__tests__/') ||
    filePath.includes('/__mocks__/') ||
    filePath.includes('/e2e/') ||
    filePath.includes('/tests/') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) ||
    ext === '.snap'
  ) {
    return 'test';
  }
  if (ext === '.sql' && (filePath.includes('/db/neon/') || filePath.includes('/migrations/'))) {
    return 'migration';
  }
  if (ext === '.md') return 'doc';
  if (ext === '.css') return 'style';
  if (BINARY_EXTENSIONS.has(ext)) return 'asset';
  if (LOCKFILE_NAMES.has(base)) return 'lockfile';
  if (CODE_EXTENSIONS.has(ext)) return 'source';
  if (['.json', '.yml', '.yaml', '.toml', '.jsonl'].includes(ext)) return 'config';
  return 'other';
}

function parseSource(filePath, source) {
  const ext = extensionOf(filePath);
  if (JS_EXTENSIONS.has(ext)) return { ...scanJavaScriptModule(source), uses: [], commands: [] };
  if (ext === '.rs') {
    const rust = scanRustModule(source);
    return { exports: rust.exports, imports: [], uses: rust.uses, commands: rust.commands };
  }
  if (ext === '.py') {
    const python = scanPythonModule(source);
    return { exports: python.exports, imports: python.imports, uses: [], commands: [] };
  }
  if (ext === '.swift') {
    const swift = scanSwiftModule(source);
    return { exports: swift.exports, imports: swift.imports, uses: [], commands: [] };
  }
  if (ext === '.sql')
    return { exports: [], imports: [], uses: [], commands: [], tables: scanSql(source) };
  return { exports: [], imports: [], uses: [], commands: [] };
}

function gitTrackedFiles(repoRoot) {
  const stdout = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout
    .split('\0')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function readWorkspaceGlobs(repoRoot) {
  const manifest = path.join(repoRoot, 'pnpm-workspace.yaml');
  if (!fs.existsSync(manifest)) return [];
  const globs = [];
  let inPackages = false;
  for (const line of fs.readFileSync(manifest, 'utf8').split('\n')) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s*-\s*['"]([^'"]+)['"]/.exec(line);
    if (item) globs.push(item[1]);
    else if (/^\S/.test(line)) break;
  }
  return globs;
}

function matchGlob(glob, relPath) {
  const expected = glob.split('/');
  const actual = relPath.split('/');
  if (expected.length !== actual.length) return false;
  return expected.every((part, index) => part === '*' || part === actual[index]);
}

function readCargoMembers(repoRoot) {
  const manifest = path.join(repoRoot, 'Cargo.toml');
  if (!fs.existsSync(manifest)) return [];
  const text = fs.readFileSync(manifest, 'utf8');
  const block = /\[workspace\][\s\S]*?members\s*=\s*\[(.*?)\]/.exec(text);
  if (!block) return [];
  const members = [];
  for (const match of block[1].matchAll(/"([^"]+)"/g)) {
    const entry = match[1];
    if (!entry.endsWith('/*')) {
      members.push(entry);
      continue;
    }
    const parent = entry.slice(0, -2);
    const absolute = path.join(repoRoot, parent);
    if (!fs.existsSync(absolute)) continue;
    for (const name of fs.readdirSync(absolute).sort()) {
      if (fs.existsSync(path.join(absolute, name, 'Cargo.toml'))) {
        members.push(path.posix.join(parent, name));
      }
    }
  }
  return members;
}

function readJsonIfPresent(absPath) {
  if (!fs.existsSync(absPath)) return null;
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function cargoName(absPath) {
  if (!fs.existsSync(absPath)) return null;
  const match = fs.readFileSync(absPath, 'utf8').match(/^name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function cargoDescription(absPath) {
  if (!fs.existsSync(absPath)) return null;
  const match = fs.readFileSync(absPath, 'utf8').match(/^description\s*=\s*"((?:[^"\\]|\\.)*)"/m);
  return match ? match[1].replace(/\\"/g, '"').trim() : null;
}

function stripJsonComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source[i] === '"') {
      const start = i;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      out += source.slice(start, i);
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(source.length, i + 2);
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

function loadTsconfig(absPath, seen = new Set()) {
  const key = path.resolve(absPath);
  if (seen.has(key) || !fs.existsSync(key)) return null;
  seen.add(key);
  let json;
  try {
    json = JSON.parse(stripJsonComments(fs.readFileSync(key, 'utf8')));
  } catch {
    return null;
  }
  const absDir = path.dirname(key);
  let baseUrl = '.';
  let entries = [];
  const extended = json.extends;
  if (typeof extended === 'string' && extended.startsWith('.')) {
    const parent = loadTsconfig(path.resolve(absDir, extended), seen);
    if (parent) {
      entries = parent.entries.map((entry) => ({ ...entry }));
      baseUrl = parent.baseUrl;
    }
  }
  if (json.compilerOptions?.baseUrl) baseUrl = json.compilerOptions.baseUrl;
  if (json.compilerOptions?.paths) {
    const own = Object.entries(json.compilerOptions.paths).map(([pattern, targets]) => ({
      pattern,
      targets,
      absDir,
      baseUrl,
    }));
    const ownPatterns = new Set(own.map((entry) => entry.pattern));
    entries = [...entries.filter((entry) => !ownPatterns.has(entry.pattern)), ...own];
  }
  return { entries, baseUrl, absDir };
}

function loadTsconfigs(repoRoot, tracked) {
  const configs = [];
  for (const file of tracked) {
    if (path.posix.basename(file) !== 'tsconfig.json') continue;
    const loaded = loadTsconfig(path.join(repoRoot, file));
    if (loaded) configs.push({ ...loaded, dir: path.posix.dirname(file) || '.' });
  }
  return configs.sort((a, b) => b.dir.length - a.dir.length);
}

function nearestTsconfig(file, configs) {
  const dir = path.posix.dirname(file);
  return (
    configs.find((config) => {
      if (config.dir === '.') return true;
      return dir === config.dir || dir.startsWith(`${config.dir}/`);
    }) ?? null
  );
}

function globPrefixMatch(pattern, filePath) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    if (!filePath.startsWith(`${prefix}/`)) return false;
    return !filePath.slice(prefix.length + 1).includes('/');
  }
  return filePath === pattern;
}

function lanesFor(filePath, lanes) {
  const hits = [];
  for (const lane of lanes) {
    if ((lane.ownedWritePaths ?? []).some((pattern) => globPrefixMatch(pattern, filePath))) {
      hits.push(lane.id);
    }
  }
  return hits.sort((a, b) => a.localeCompare(b));
}

function syntheticUnit(file, members) {
  const parts = file.split('/');
  const insideMember = members.some((unit) => file === unit || file.startsWith(`${unit}/`));
  if (insideMember) return null;
  if (parts[0] === 'tools' && parts.length >= 3) return `tools/${parts[1]}`;
  if (parts[0] === '.agents' && parts[1] === 'skills' && parts.length >= 4) {
    return `.agents/skills/${parts[2]}`;
  }
  return parts[0];
}

function owningUnit(file, members) {
  let best = null;
  for (const unit of members) {
    if (file === unit || file.startsWith(`${unit}/`)) {
      if (!best || unit.length > best.length) best = unit;
    }
  }
  if (best) return best;
  if (!file.includes('/')) return '.';
  return syntheticUnit(file, members);
}

function resolveRelative(fromFile, spec, files) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const candidates = [base];
  if (path.posix.extname(base) === '.js') {
    candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  }
  if (path.posix.extname(base) === '.mjs') candidates.push(base.replace(/\.mjs$/, '.mts'));
  if (path.posix.extname(base) === '') {
    for (const ext of RESOLVE_EXTENSIONS) candidates.push(base + ext);
  }
  const dir = path.posix.extname(base) ? path.posix.dirname(base) : base;
  const stem = path.posix.extname(base)
    ? path.posix.basename(base, path.posix.extname(base))
    : null;
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(`${base}/index${ext}`);
    if (stem) candidates.push(path.posix.join(dir, stem, `index${ext}`));
  }
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function matchPathAlias(spec, config, files, repoRoot) {
  if (!config) return null;
  let best = null;
  for (const entry of config.entries ?? []) {
    const star = entry.pattern.indexOf('*');
    const prefix = star === -1 ? entry.pattern : entry.pattern.slice(0, star);
    const suffix = star === -1 ? '' : entry.pattern.slice(star + 1);
    if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
    if (star === -1 && spec !== entry.pattern) continue;
    const captured = star === -1 ? '' : spec.slice(prefix.length, spec.length - suffix.length);
    const targets = Array.isArray(entry.targets) ? entry.targets : [entry.targets];
    for (const target of targets) {
      const absolute = path.resolve(
        entry.absDir,
        entry.baseUrl ?? '.',
        target.replaceAll('*', () => captured),
      );
      const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
      if (relative.startsWith('../')) continue;
      const candidate = findWithExtensions(relative, files);
      if (candidate && (!best || prefix.length > best.prefix)) {
        best = { prefix: prefix.length, file: candidate };
      }
    }
  }
  return best?.file ?? null;
}

function findWithExtensions(relative, files) {
  if (files.has(relative)) return relative;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (files.has(relative + ext)) return relative + ext;
    if (files.has(`${relative}/index${ext}`)) return `${relative}/index${ext}`;
  }
  return null;
}

function matchPackage(spec, packages) {
  let best = null;
  for (const pkg of packages) {
    if (spec !== pkg.name && !spec.startsWith(`${pkg.name}/`)) continue;
    if (!best || pkg.name.length > best.name.length) best = pkg;
  }
  if (!best) return null;
  if (spec === best.name) return best.path;
  const rest = spec.slice(best.name.length + 1);
  return findWithExtensions(path.posix.join(best.path, rest), best.files) ?? best.path;
}

function childRustModule(moduleFile, name, files) {
  const base = path.posix.basename(moduleFile);
  const dir =
    base === 'mod.rs' || base === 'lib.rs' || base === 'main.rs'
      ? path.posix.dirname(moduleFile)
      : path.posix.join(path.posix.dirname(moduleFile), base.replace(/\.rs$/, ''));
  const candidates = [`${dir}/${name}.rs`, `${dir}/${name}/mod.rs`];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function parentRustModule(moduleFile, files) {
  const base = path.posix.basename(moduleFile);
  const dir = path.posix.dirname(moduleFile);
  if (base === 'mod.rs' || base === 'lib.rs' || base === 'main.rs') {
    const parent = path.posix.dirname(dir);
    if (files.has(`${parent}.rs`)) return `${parent}.rs`;
    if (files.has(`${parent}/mod.rs`)) return `${parent}/mod.rs`;
    return null;
  }
  if (files.has(`${dir}.rs`)) return `${dir}.rs`;
  if (files.has(`${dir}/mod.rs`)) return `${dir}/mod.rs`;
  return null;
}

function resolveRustParts(rootFile, parts, files) {
  let current = rootFile;
  for (const part of parts) {
    if (part === 'self' || part === 'crate') continue;
    if (part === 'super') {
      current = parentRustModule(current, files) ?? current;
      continue;
    }
    const child = childRustModule(current, part, files);
    if (!child) return current;
    current = child;
  }
  return current;
}

function routeSegments(parts) {
  const raw = [];
  const urlParts = [];
  const special = [];
  for (const segment of parts) {
    raw.push(segment);
    if (segment.startsWith('@')) {
      special.push('parallel');
      continue;
    }
    if (/^\(\.+/.test(segment)) {
      special.push('intercept');
      continue;
    }
    if (segment.startsWith('(') && segment.endsWith(')')) continue;
    urlParts.push(segment);
  }
  return { raw, urlParts, special: uniqueSorted(special) };
}

function formatUrl(urlParts) {
  const formatted = urlParts.map((segment) => {
    const optional = /^\[\[\.\.\.(.+)\]\]$/.exec(segment);
    if (optional) return `:${optional[1]}?`;
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(segment);
    if (catchAll) return `:${catchAll[1]}*`;
    const dynamic = /^\[(.+)\]$/.exec(segment);
    if (dynamic) return `:${dynamic[1]}`;
    return segment;
  });
  return `/${formatted.filter(Boolean).join('/')}`;
}

function webRoute(filePath) {
  let restText = null;
  if (filePath.startsWith('apps/web/app/')) restText = filePath.slice('apps/web/app/'.length);
  else if (filePath.startsWith('apps/web/src/app/'))
    restText = filePath.slice('apps/web/src/app/'.length);
  else return null;
  const rest = restText.split('/');
  const base = rest.pop();
  const ext = path.posix.extname(base);
  const stem = base.slice(0, -ext.length);
  if (!ROUTE_FILES.has(stem)) return null;
  const { raw, urlParts, special } = routeSegments(rest);
  return {
    surface: 'web',
    kind: ROUTE_FILES.get(stem),
    url: special.length === 0 ? formatUrl(urlParts) : null,
    file: filePath,
    segments: raw,
    special,
  };
}

function mobileRoute(filePath) {
  const prefix = 'apps/mobile/app/';
  if (!filePath.startsWith(prefix)) return null;
  const rest = filePath.slice(prefix.length).split('/');
  const base = rest.pop();
  const ext = path.posix.extname(base);
  if (!JS_EXTENSIONS.has(ext)) return null;
  const stem = base.slice(0, -ext.length);
  let kind = 'page';
  const segments = [...rest];
  if (stem === '_layout') kind = 'layout';
  else if (stem === '+not-found' || stem === 'not-found') kind = 'not-found';
  else if (stem === '+html') kind = 'document';
  else if (stem !== 'index' && !stem.startsWith('+')) segments.push(stem);
  else if (stem.startsWith('+')) kind = stem.slice(1);
  const { raw, urlParts, special } = routeSegments(segments);
  return {
    surface: 'mobile',
    kind,
    url: special.length === 0 ? formatUrl(urlParts) : null,
    file: filePath,
    segments: raw,
    special,
  };
}

function generatorEdgeList(files) {
  const sources = [
    'packages/ai/model-registry/catalog/models.curation.json',
    'packages/ai/model-registry/catalog/model-families.json',
  ];
  const modelOutputs = [
    'packages/contracts/types/src/models.json',
    'packages/ai/model-registry/generated/registry.json',
    'packages/ai/model-registry/generated/registry.ts',
    'crates/agiworkforce-protocol/src/generated/model_registry.json',
    'crates/agiworkforce-protocol/src/generated/model_registry.rs',
    'crates/agiworkforce-model-registry/src/generated/model_registry.json',
    'crates/agiworkforce-model-registry/src/generated/model_registry.rs',
  ];
  const edges = [];
  const protocolDir = 'packages/contracts/types/src/generated/protocol';
  const protocolHasOutput = [...files].some((file) => file.startsWith(`${protocolDir}/`));
  if (
    files.has('crates/agiworkforce-protocol') ||
    [...files].some((file) => file.startsWith('crates/agiworkforce-protocol/'))
  ) {
    if (protocolHasOutput && files.has('scripts/generate-protocol-types.mjs')) {
      edges.push({
        from: 'crates/agiworkforce-protocol',
        to: protocolDir,
        type: 'generates',
        via: 'scripts/generate-protocol-types.mjs',
      });
    }
  }
  for (const source of sources) {
    if (!files.has(source)) continue;
    for (const output of modelOutputs) {
      if (!files.has(output)) continue;
      edges.push({
        from: source,
        to: output,
        type: 'generates',
        via: 'packages/ai/model-registry/scripts/compile.mjs',
      });
    }
  }
  return edges;
}

function skillRecord(repoRoot, filePath) {
  const absolute = path.join(repoRoot, filePath);
  let text = '';
  try {
    text = fs.readFileSync(absolute, 'utf8').slice(0, 4000);
  } catch {
    return { path: filePath, name: path.posix.basename(path.posix.dirname(filePath)) };
  }
  let name = path.posix.basename(path.posix.dirname(filePath));
  let description = null;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    const front = end === -1 ? text : text.slice(3, end);
    const nameMatch = /^name:\s*(.+)$/m.exec(front);
    const descriptionMatch = /^description:\s*(.+)$/m.exec(front);
    if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
    if (descriptionMatch) {
      description = descriptionMatch[1].trim().replace(LONG_DASH_CLAUSE, ': ');
    }
  }
  return description ? { path: filePath, name, description } : { path: filePath, name };
}

function assertSameSet(label, expectedList, actual) {
  const expected = new Set(expectedList);
  const missing = [...expected].filter((item) => !actual.has(item));
  const extra = [...actual].filter((item) => !expected.has(item));
  if (missing.length === 0 && extra.length === 0) return;
  const format = (items) => items.slice(0, 20).join('\n  ');
  throw new Error(
    `${label} drifted from git ls-files.\nmissing ${missing.length}:\n  ${format(missing)}\nextra ${extra.length}:\n  ${format(extra)}`,
  );
}

export function buildKnowledgeGraph(repoRoot, options = {}) {
  const tracked = [...(options.trackedFiles ?? gitTrackedFiles(repoRoot))].sort((a, b) =>
    a.localeCompare(b),
  );
  if (tracked.length === 0) throw new Error('knowledge graph: no tracked files');
  const trackedSet = new Set(tracked);
  const globs = options.workspaceGlobs ?? readWorkspaceGlobs(repoRoot);
  const cargoMembers = new Set(options.cargoMembers ?? readCargoMembers(repoRoot));
  const workspaceUnits = new Set();
  for (const file of tracked) {
    if (path.posix.basename(file) !== 'package.json') continue;
    const dir = path.posix.dirname(file);
    if (dir !== '.' && globs.some((glob) => matchGlob(glob, dir))) workspaceUnits.add(dir);
  }
  for (const member of cargoMembers) {
    if (trackedSet.has(`${member}/Cargo.toml`)) workspaceUnits.add(member);
  }
  const members = [...workspaceUnits];
  const unitSet = new Set(members);
  for (const file of tracked) {
    unitSet.add(owningUnit(file, members));
  }

  const repoMap =
    options.repoMap ?? readJsonIfPresent(path.join(repoRoot, 'docs/agent-context/repo-map.json'));
  const lanesDoc =
    options.lanes ?? readJsonIfPresent(path.join(repoRoot, 'docs/agent-context/lanes.json'));
  const lanes = lanesDoc?.lanes ?? [];
  const purposes = options.purposes ?? {};
  const packageScripts =
    options.packageScripts ?? readJsonIfPresent(path.join(repoRoot, 'package.json'))?.scripts ?? {};

  const byPath = new Map();
  for (const unit of repoMap?.workspaceUnits ?? []) byPath.set(unit.path, unit);
  for (const surface of [...(repoMap?.surfaces ?? []), ...(repoMap?.platform ?? [])]) {
    if (!byPath.has(surface.path)) byPath.set(surface.path, surface);
    else
      Object.assign(byPath.get(surface.path), {
        surfacePurpose: surface.purpose,
        surfaceChecks: surface.primaryChecks,
        surfaceOwner: surface.owner,
      });
  }

  const packages = [];
  const crateNames = new Map();
  const unitRecords = new Map();
  for (const unitPath of [...unitSet].sort((a, b) => a.localeCompare(b))) {
    const packageJson = readJsonIfPresent(
      path.join(repoRoot, unitPath === '.' ? 'package.json' : `${unitPath}/package.json`),
    );
    const cargoPath = path.join(repoRoot, unitPath, 'Cargo.toml');
    const name = packageJson?.name ?? cargoName(cargoPath) ?? path.posix.basename(unitPath);
    const mapped = byPath.get(unitPath);
    const description =
      purposes[unitPath] ??
      (typeof packageJson?.description === 'string' && packageJson.description.trim()
        ? packageJson.description.trim()
        : null) ??
      cargoDescription(cargoPath) ??
      mapped?.purpose ??
      mapped?.surfacePurpose ??
      null;
    if (packageJson?.name)
      packages.push({ name: packageJson.name, path: unitPath, files: trackedSet });
    const rustName = cargoName(cargoPath);
    if (rustName) {
      crateNames.set(rustName, unitPath);
      crateNames.set(rustName.replace(/-/g, '_'), unitPath);
    }
    const entry = [];
    if (packageJson?.main) entry.push(String(packageJson.main));
    if (packageJson?.types) entry.push(String(packageJson.types));
    if (packageJson?.bin) entry.push(...Object.keys(packageJson.bin));
    if (packageJson?.exports && typeof packageJson.exports === 'object') {
      entry.push(...Object.keys(packageJson.exports));
    }
    unitRecords.set(unitPath, {
      path: unitPath,
      name,
      kind: mapped?.kind ?? inferKind(unitPath),
      purpose: description,
      owner: mapped?.canonicalOwner ?? mapped?.owner ?? mapped?.surfaceOwner ?? null,
      trustBoundary: mapped?.trustBoundary ?? null,
      status: mapped?.status ?? null,
      entry: uniqueSorted(entry),
      agentsDoc: null,
      checks: uniqueSorted([...(mapped?.primaryChecks ?? []), ...(mapped?.surfaceChecks ?? [])]),
      dependsOn: [],
      dependents: [],
      lanes: [],
      files: 0,
      roles: {},
    });
  }
  const configs = loadTsconfigs(repoRoot, tracked);
  const agentsDocs = tracked.filter((file) => file === 'AGENTS.md' || file.endsWith('/AGENTS.md'));
  const agentsSet = new Set(agentsDocs);
  for (const [unitPath, record] of unitRecords) {
    const anchor = unitPath === '.' ? 'AGENTS.md' : `${unitPath}/AGENTS.md`;
    record.agentsDoc = agentsSet.has(anchor)
      ? anchor
      : nearestAgentsDoc(unitPath === '.' ? 'AGENTS.md' : `${unitPath}/x`, agentsSet);
    record.lanes = lanesFor(unitPath === '.' ? 'package.json' : `${unitPath}/x`, lanes);
    const laneChecks = lanes
      .filter((lane) => record.lanes.includes(lane.id))
      .flatMap((lane) => lane.requiredChecks ?? []);
    record.checks = uniqueSorted([...record.checks, ...laneChecks]);
  }

  const dependencyEdges = [];
  const unmapped = [];
  const graph = options.dependencyGraph;
  if (graph) {
    for (const edge of graph.typescript?.edges ?? []) {
      pushDependency(edge, 'typescript', packages, crateNames, dependencyEdges, unmapped);
    }
    for (const edge of graph.rust?.edges ?? []) {
      pushDependency(edge, 'rust', packages, crateNames, dependencyEdges, unmapped);
    }
  }
  for (const edge of dependencyEdges) {
    unitRecords.get(edge.from)?.dependsOn.push(edge.to);
    unitRecords.get(edge.to)?.dependents.push(edge.from);
  }
  for (const record of unitRecords.values()) {
    record.dependsOn = uniqueSorted(record.dependsOn);
    record.dependents = uniqueSorted(record.dependents);
  }

  const files = [];
  const symbols = new Map();
  const routes = [];
  const migrations = [];
  const slashCommands = [];
  const unparsed = { binary: 0, oversize: 0, lockfile: 0, notCode: 0, parseError: 0 };
  const fileSet = trackedSet;
  const reportProgress = tracked.length >= 1000;
  if (reportProgress) process.stderr.write(`knowledge-graph: scanning ${tracked.length} files\n`);

  for (const filePath of tracked) {
    const unit = owningUnit(filePath, members);
    const role = fileRole(filePath);
    const lanesHit = lanesFor(filePath, lanes);
    const absolute = path.join(repoRoot, filePath);
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      throw new Error(`knowledge graph: tracked file is missing on disk: ${filePath}`);
    }
    const ext = extensionOf(filePath);
    const base = path.posix.basename(filePath);
    let unparsedReason = null;
    if (LOCKFILE_NAMES.has(base)) unparsedReason = 'lockfile';
    else if (BINARY_EXTENSIONS.has(ext)) unparsedReason = 'binary';
    else if (stat.size > MAX_PARSE_BYTES) unparsedReason = 'oversize';
    else if (!CODE_EXTENSIONS.has(ext)) unparsedReason = 'notCode';

    let parsed = { exports: [], imports: [], uses: [], commands: [], tables: [] };
    if (!unparsedReason) {
      try {
        parsed = parseSource(filePath, fs.readFileSync(absolute, 'utf8'));
      } catch {
        unparsedReason = 'parseError';
      }
    }
    if (unparsedReason) unparsed[unparsedReason] += 1;

    const resolvedImports = [];
    for (const spec of parsed.imports ?? []) {
      resolvedImports.push(resolveSpecifier(filePath, spec, fileSet, configs, packages, repoRoot));
    }
    for (const use of parsed.uses ?? []) {
      resolvedImports.push(resolveRustUse(filePath, use.parts, unit, crateNames, fileSet));
    }

    const record = { path: filePath, unit, role };
    if (parsed.exports?.length) record.exports = parsed.exports;
    if (resolvedImports.length) record.imports = uniqueSorted(resolvedImports);
    if (lanesHit.length) record.lanes = lanesHit;
    if (unparsedReason) record.unparsed = unparsedReason;
    files.push(record);

    const unitRecord = unitRecords.get(unit);
    if (unitRecord) {
      unitRecord.files += 1;
      unitRecord.roles[role] = (unitRecord.roles[role] ?? 0) + 1;
    }
    for (const name of parsed.exports ?? []) {
      if (!symbols.has(name)) symbols.set(name, []);
      symbols.get(name).push(filePath);
    }
    for (const command of parsed.commands ?? []) {
      slashCommands.push({ name: command, file: filePath });
    }

    if (filePath === 'apps/web/proxy.ts') {
      const methods = HTTP_METHODS.filter((method) => parsed.exports?.includes(method));
      routes.push({
        surface: 'web',
        kind: 'proxy',
        url: '*',
        file: filePath,
        segments: [],
        ...(methods.length ? { methods } : {}),
      });
    }
    const route = webRoute(filePath) ?? mobileRoute(filePath);
    if (route) {
      route.methods =
        route.kind === 'endpoint'
          ? HTTP_METHODS.filter((method) => parsed.exports?.includes(method))
          : [];
      if (route.methods.length === 0) delete route.methods;
      if (route.special.length === 0) delete route.special;
      routes.push(route);
    }
    if (role === 'migration' || parsed.tables?.length) {
      migrations.push({ path: filePath, tables: parsed.tables ?? [] });
    }
    if (reportProgress && files.length % 2000 === 0) {
      process.stderr.write(`knowledge-graph: scanned ${files.length}\n`);
    }
  }

  const migrationsByDir = new Map();
  for (const migration of migrations) {
    const dir = path.posix.dirname(migration.path);
    if (!migrationsByDir.has(dir)) migrationsByDir.set(dir, []);
    migrationsByDir.get(dir).push(migration);
  }
  for (const group of migrationsByDir.values()) {
    group.sort((a, b) => a.path.localeCompare(b.path));
    for (let index = 0; index < group.length; index += 1) {
      group[index].follows = index === 0 ? null : group[index - 1].path;
    }
  }

  const skills = tracked
    .filter((file) => file.startsWith('.agents/skills/') && file.endsWith('/SKILL.md'))
    .map((file) => skillRecord(repoRoot, file));
  const guards = tracked
    .filter(
      (file) =>
        /^scripts\/check-[^/]+\.(mjs|js|sh)$/.test(file) &&
        !file.endsWith('.test.mjs') &&
        !file.endsWith('.test.js'),
    )
    .map((file) => {
      const pnpm = Object.entries(packageScripts)
        .filter(([, command]) => String(command).includes(file))
        .map(([script]) => script)
        .sort((a, b) => a.localeCompare(b));
      return pnpm.length ? { path: file, pnpm } : { path: file };
    });

  const generates = generatorEdgeList(fileSet);
  const symbolObject = {};
  for (const name of [...symbols.keys()].sort((a, b) => a.localeCompare(b))) {
    symbolObject[name] = symbols.get(name).sort((a, b) => a.localeCompare(b));
  }

  const filePaths = new Set(files.map((file) => file.path));
  assertSameSet('knowledge graph files', tracked, filePaths);
  for (const record of unitRecords.values()) {
    const roles = {};
    for (const key of Object.keys(record.roles).sort((a, b) => a.localeCompare(b))) {
      roles[key] = record.roles[key];
    }
    record.roles = roles;
  }
  const seenEdges = new Set();
  const edges = [];
  for (const edge of [...dependencyEdges, ...generates]) {
    const key = `${edge.type}\0${edge.from}\0${edge.to}\0${edge.via ?? ''}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push(edge);
  }

  return {
    manifest: {
      schemaVersion: 1,
      generatedFrom:
        'git ls-files, pnpm-workspace.yaml, Cargo.toml members, package and crate manifests, tsconfig paths, docs/agent-context/repo-map.json, docs/agent-context/lanes.json, and the TypeScript and Rust dependency graphs',
      trackedFiles: tracked.length,
      fileNodes: files.length,
      units: unitRecords.size,
      routes: routes.length,
      migrations: migrations.length,
      symbols: Object.keys(symbolObject).length,
      workspaceEdges: edges.filter((edge) => edge.type === 'depends_on').length,
      generatorEdges: edges.filter((edge) => edge.type === 'generates').length,
      unparsed,
      unmappedDependencies: uniqueSorted(unmapped),
      limits: LIMITS,
      query: 'node scripts/query-knowledge-graph.mjs <command> [argument]',
      commands: [
        'unit',
        'file',
        'files',
        'symbol',
        'route',
        'deps',
        'importers',
        'search',
        'lane',
        'migration',
        'stats',
      ],
    },
    units: [...unitRecords.values()].sort((a, b) => a.path.localeCompare(b.path)),
    routes: routes.sort((a, b) =>
      `${a.surface}\0${a.url ?? ''}\0${a.file}`.localeCompare(
        `${b.surface}\0${b.url ?? ''}\0${b.file}`,
      ),
    ),
    migrations: migrations.sort((a, b) => a.path.localeCompare(b.path)),
    symbols: symbolObject,
    files,
    edges: edges.sort((a, b) =>
      `${a.type}\0${a.from}\0${a.to}`.localeCompare(`${b.type}\0${b.from}\0${b.to}`),
    ),
    skills: skills.sort((a, b) => a.path.localeCompare(b.path)),
    guards,
    slashCommands: slashCommands.sort((a, b) =>
      `${a.name}\0${a.file}`.localeCompare(`${b.name}\0${b.file}`),
    ),
    agentsDocs,
  };
}

function inferKind(unitPath) {
  if (unitPath.startsWith('apps/')) return 'app';
  if (unitPath.startsWith('packages/')) return 'package';
  if (unitPath.startsWith('crates/')) return 'crate';
  if (unitPath.startsWith('services/')) return 'service';
  if (unitPath.startsWith('infrastructure/')) return 'infrastructure';
  if (unitPath.startsWith('tools/')) return 'tool';
  if (unitPath.startsWith('.agents/skills/')) return 'skill';
  if (unitPath === 'scripts') return 'scripts';
  if (unitPath === 'docs') return 'docs';
  if (unitPath === '.') return 'root';
  return 'directory';
}

function nearestAgentsDoc(filePath, agentsSet) {
  let dir = filePath.includes('/') ? path.posix.dirname(filePath) : '.';
  while (true) {
    const candidate = dir === '.' ? 'AGENTS.md' : `${dir}/AGENTS.md`;
    if (agentsSet.has(candidate)) return candidate;
    if (dir === '.') return null;
    const parent = path.posix.dirname(dir);
    dir = parent === dir ? '.' : parent;
  }
}

function pushDependency(edge, via, packages, crateNames, dependencyEdges, unmapped) {
  const from =
    via === 'rust'
      ? (crateNames.get(edge.from) ?? crateNames.get(edge.from.replace(/-/g, '_')))
      : packages.find((pkg) => pkg.name === edge.from)?.path;
  const to =
    via === 'rust'
      ? (crateNames.get(edge.to) ?? crateNames.get(edge.to.replace(/-/g, '_')))
      : packages.find((pkg) => pkg.name === edge.to)?.path;
  if (!from || !to || from === to) {
    if (!from) unmapped.push(edge.from);
    if (!to) unmapped.push(edge.to);
    return;
  }
  dependencyEdges.push({ from, to, type: 'depends_on', via });
}

function resolveSpecifier(filePath, spec, files, configs, packages, repoRoot) {
  if (spec.startsWith('.')) {
    return resolveRelative(filePath, spec, files) ?? `spec:${spec}`;
  }
  const config = nearestTsconfig(filePath, configs);
  const alias = matchPathAlias(spec, config, files, repoRoot);
  if (alias) return alias;
  const packaged = matchPackage(spec, packages);
  if (packaged) return packaged;
  return `spec:${spec}`;
}

function resolveRustUse(filePath, parts, unit, crateNames, files) {
  if (parts.length === 0) return 'rust:';
  const [head, ...rest] = parts;
  if (head === 'crate' || head === 'self' || head === 'super') {
    const root = unit ? rustRootFile(unit, files) : null;
    let start = root;
    if (head !== 'crate') start = filePath.endsWith('.rs') ? filePath : root;
    if (!start) return `rust:${parts.join('::')}`;
    const resolved = resolveRustParts(start, parts, files);
    return resolved ?? `rust:${parts.join('::')}`;
  }
  const crateUnit = crateNames.get(head) ?? crateNames.get(head.replace(/-/g, '_'));
  if (!crateUnit) return `rust:${parts.join('::')}`;
  const root = rustRootFile(crateUnit, files);
  if (!root) return crateUnit;
  return resolveRustParts(root, rest, files) ?? crateUnit;
}

function rustRootFile(unit, files) {
  if (files.has(`${unit}/src/lib.rs`)) return `${unit}/src/lib.rs`;
  if (files.has(`${unit}/src/main.rs`)) return `${unit}/src/main.rs`;
  return null;
}

export function shardFor(filePath) {
  const parts = filePath.split('/');
  if (parts.length === 1) return 'knowledge-graph/files/root.jsonl';
  const head = parts[0].replace(/^\./, '');
  if ((head === 'apps' || head === 'packages') && parts[1]) {
    return `knowledge-graph/files/${head}__${parts[1]}.jsonl`;
  }
  return `knowledge-graph/files/${head}.jsonl`;
}

function foldOpaquePaths(files, isOpaquePath) {
  if (!isOpaquePath) return { records: files, folded: 0 };
  const kept = [];
  const groups = new Map();
  let folded = 0;
  for (const record of files) {
    if (!isOpaquePath(record.path)) {
      kept.push(record);
      continue;
    }
    folded += 1;
    const directory = path.posix.dirname(record.path);
    const group = groups.get(directory) ?? {
      path: `${directory}/`,
      unit: record.unit,
      role: record.role,
      folded: 0,
    };
    if (group.role !== record.role) group.role = 'mixed';
    group.folded += 1;
    groups.set(directory, group);
  }
  return {
    records: [...kept, ...groups.values()].sort((a, b) => a.path.localeCompare(b.path)),
    folded,
  };
}

export function renderKnowledgeGraph(graph, options = {}) {
  const rendered = {};
  const shards = new Map();
  const { records, folded } = foldOpaquePaths(graph.files, options.isOpaquePath);
  for (const record of records) {
    const shard = shardFor(record.path);
    if (!shards.has(shard)) shards.set(shard, []);
    shards.get(shard).push(record);
  }
  const shardNames = [...shards.keys()].sort((a, b) => a.localeCompare(b));
  for (const name of shardNames) {
    const lines = [
      JSON.stringify({ $generated: GENERATED_BANNER }),
      ...shards.get(name).map((record) => JSON.stringify(record)),
    ];
    rendered[name] = `${lines.join('\n')}\n`;
  }
  const files = {
    'knowledge-graph/manifest.json': {
      $generated: GENERATED_BANNER,
      ...graph.manifest,
      foldedFiles: folded,
      shards: shardNames,
    },
    'knowledge-graph/units.json': { $generated: GENERATED_BANNER, units: graph.units },
    'knowledge-graph/routes.json': { $generated: GENERATED_BANNER, routes: graph.routes },
    'knowledge-graph/migrations.json': {
      $generated: GENERATED_BANNER,
      migrations: graph.migrations,
    },
    'knowledge-graph/symbols.json': { $generated: GENERATED_BANNER, symbols: graph.symbols },
    'knowledge-graph/edges.json': { $generated: GENERATED_BANNER, edges: graph.edges },
    'knowledge-graph/skills.json': { $generated: GENERATED_BANNER, skills: graph.skills },
    'knowledge-graph/guards.json': { $generated: GENERATED_BANNER, guards: graph.guards },
    'knowledge-graph/slash-commands.json': {
      $generated: GENERATED_BANNER,
      commands: graph.slashCommands,
    },
    'knowledge-graph/agents-docs.json': {
      $generated: GENERATED_BANNER,
      docs: graph.agentsDocs,
    },
  };
  for (const [name, value] of Object.entries(files)) rendered[name] = serialize(value);
  rendered['knowledge-graph/manifest.json'] = serialize({
    ...files['knowledge-graph/manifest.json'],
    files: Object.keys(rendered).sort((a, b) => a.localeCompare(b)),
  });
  return rendered;
}

function graphDir(repoRoot) {
  return path.join(repoRoot, 'docs', 'agent-context', 'generated', 'knowledge-graph');
}

function readGenerated(repoRoot, name) {
  return JSON.parse(fs.readFileSync(path.join(graphDir(repoRoot), name), 'utf8'));
}

function readShardRecords(repoRoot, shard) {
  const relative = shard.replace(/^knowledge-graph\//, '');
  const text = fs.readFileSync(path.join(graphDir(repoRoot), relative), 'utf8');
  const records = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const parsed = JSON.parse(line);
    if (parsed.path) records.push(parsed);
  }
  return records;
}

function loadIndex(repoRoot) {
  const manifest = readGenerated(repoRoot, 'manifest.json');
  return {
    manifest,
    units: readGenerated(repoRoot, 'units.json').units,
    routes: readGenerated(repoRoot, 'routes.json').routes,
    migrations: readGenerated(repoRoot, 'migrations.json').migrations,
    symbols: readGenerated(repoRoot, 'symbols.json').symbols,
    edges: readGenerated(repoRoot, 'edges.json').edges,
    lanes: readJsonIfPresent(path.join(repoRoot, 'docs/agent-context/lanes.json')),
    agents: readGenerated(repoRoot, 'agents-docs.json').docs,
  };
}

function eachFileRecord(repoRoot, manifest, visit) {
  for (const shard of manifest.shards ?? []) {
    for (const record of readShardRecords(repoRoot, shard)) visit(record);
  }
}

function findUnit(units, argument) {
  return (
    units.find((unit) => unit.path === argument) ??
    units.find((unit) => unit.name === argument) ??
    units.find((unit) => unit.path.endsWith(`/${argument}`)) ??
    null
  );
}

function capLines(lines, total) {
  if (total <= lines.length) return lines.join('\n');
  return `${lines.join('\n')}\n… ${total - lines.length} more`;
}

export function queryKnowledgeGraph(repoRoot, command, argument = '') {
  const root = graphDir(repoRoot);
  if (!fs.existsSync(path.join(root, 'manifest.json'))) {
    return 'Knowledge graph is not generated. Run: node scripts/generate-agent-context-indexes.mjs';
  }
  const index = loadIndex(repoRoot);
  const arg = argument.trim();
  if (command === 'stats') return formatStats(index.manifest);
  if (command === 'unit') return formatUnit(findUnit(index.units, arg), arg);
  if (command === 'deps') return formatDeps(findUnit(index.units, arg), arg);
  if (command === 'file') return formatFileQuery(repoRoot, index, arg);
  if (command === 'files') return formatFiles(repoRoot, index.manifest, arg);
  if (command === 'symbol') return formatSymbol(index.symbols, arg);
  if (command === 'route') return formatRoutes(index.routes, arg);
  if (command === 'migration') return formatMigrations(index.migrations, arg);
  if (command === 'lane') return formatLane(index.lanes, arg);
  if (command === 'importers') return formatImporters(repoRoot, index, arg);
  if (command === 'search') return formatSearch(repoRoot, index, arg);
  return `Unknown command ${command}.\n${formatStats(index.manifest)}`;
}

function formatStats(manifest) {
  return [
    `tracked files: ${manifest.trackedFiles}`,
    `units: ${manifest.units}`,
    `routes: ${manifest.routes}`,
    `migrations: ${manifest.migrations}`,
    `symbols: ${manifest.symbols}`,
    `workspace edges: ${manifest.workspaceEdges}`,
    `generator edges: ${manifest.generatorEdges}`,
    `query: ${manifest.query}`,
    `commands: ${manifest.commands.join(', ')}`,
    'limits:',
    ...manifest.limits.map((limit) => `- ${limit}`),
  ].join('\n');
}

function formatUnit(unit, argument) {
  if (!unit) return `No unit named ${argument}. Try: search ${argument}`;
  const lines = [
    `path: ${unit.path}`,
    `name: ${unit.name}`,
    `kind: ${unit.kind}`,
    `purpose: ${unit.purpose ?? '(none)'}`,
    `owner: ${unit.owner ?? '(none)'}`,
    `trust boundary: ${unit.trustBoundary ?? '(none)'}`,
    `status: ${unit.status ?? '(none)'}`,
    `files: ${unit.files}`,
    `roles: ${Object.entries(unit.roles)
      .map(([role, count]) => `${role} ${count}`)
      .join(', ')}`,
    `entry: ${unit.entry.join(', ') || '(none)'}`,
    `agents doc: ${unit.agentsDoc ?? '(none)'}`,
    `lanes: ${unit.lanes.join(', ') || '(none)'}`,
    `depends on: ${unit.dependsOn.join(', ') || '(none)'}`,
    `dependents: ${unit.dependents.join(', ') || '(none)'}`,
    'checks:',
    ...(unit.checks.length ? unit.checks.map((check) => `- ${check}`) : ['- (none)']),
  ];
  return lines.join('\n');
}

function formatDeps(unit, argument) {
  if (!unit) return `No unit named ${argument}.`;
  return [
    `depends on:`,
    ...unit.dependsOn.map((item) => `- ${item}`),
    'dependents:',
    ...unit.dependents.map((item) => `- ${item}`),
  ].join('\n');
}

function loadFile(repoRoot, manifest, filePath) {
  const shard = shardFor(filePath);
  if (!(manifest.shards ?? []).includes(shard)) return null;
  return readShardRecords(repoRoot, shard).find((record) => record.path === filePath) ?? null;
}

function formatFileQuery(repoRoot, index, filePath) {
  const record = loadFile(repoRoot, index.manifest, filePath);
  if (!record) return `No file ${filePath}.`;
  const unit = index.units.find((item) => item.path === record.unit);
  const routes = index.routes.filter((route) => route.file === filePath);
  const migration = index.migrations.find((item) => item.path === filePath);
  const agents = nearestAgentsDoc(filePath, new Set(index.agents));
  const lines = [
    `path: ${record.path}`,
    `unit: ${record.unit}${unit?.name ? ` (${unit.name})` : ''}`,
    `role: ${record.role}`,
    `owner: ${unit?.owner ?? '(none)'}`,
    `trust boundary: ${unit?.trustBoundary ?? '(none)'}`,
    `lanes: ${(record.lanes ?? []).join(', ') || '(none)'}`,
    `agents doc: ${agents ?? '(none)'}`,
    `exports: ${(record.exports ?? []).join(', ') || '(none)'}`,
    'imports:',
    ...(record.imports ?? []).map((item) => `- ${item}`),
  ];
  if (routes.length) {
    lines.push('routes:');
    for (const route of routes) {
      lines.push(`- ${route.surface} ${route.kind} ${route.url ?? '(no canonical url)'}`);
    }
  }
  if (migration) {
    lines.push(`tables: ${migration.tables.join(', ') || '(none)'}`);
    lines.push(`follows: ${migration.follows ?? '(start of chain)'}`);
  }
  if (unit?.checks?.length) {
    lines.push('checks:');
    for (const check of unit.checks) lines.push(`- ${check}`);
  }
  return lines.join('\n');
}

function formatFiles(repoRoot, manifest, prefix) {
  if (!prefix) return 'Usage: files <unit-or-directory>';
  const matches = [];
  eachFileRecord(repoRoot, manifest, (record) => {
    if (record.path === prefix || record.path.startsWith(`${prefix}/`)) matches.push(record);
  });
  if (matches.length === 0) return `No files under ${prefix}.`;
  if (matches.length <= 200) {
    return capLines(
      matches.map((record) => `${record.role}\t${record.path}`),
      matches.length,
    );
  }
  const counts = new Map();
  for (const record of matches) {
    const rest = record.path.slice(prefix.length).replace(/^\//, '');
    const next = rest.split('/')[0] || record.path;
    counts.set(next, (counts.get(next) ?? 0) + 1);
  }
  const lines = [`${matches.length} files under ${prefix}`, 'next directories:'];
  for (const [name, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- ${name} (${count})`);
  }
  return lines.join('\n');
}

function formatSymbol(symbols, name) {
  if (!name) return 'Usage: symbol <export-name>';
  let paths = symbols[name];
  let note = '';
  if (!paths) {
    const folded = Object.entries(symbols).filter(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    if (folded.length === 1) {
      paths = folded[0][1];
      note = `matched case-insensitively as ${folded[0][0]}\n`;
    }
  }
  if (!paths) return `No export named ${name}.`;
  return `${note}${capLines(
    paths.map((file) => file),
    paths.length,
  )}`;
}

function formatRoutes(routes, argument) {
  if (!argument) return 'Usage: route <url-or-fragment>';
  const needle = argument.startsWith('/') ? argument : `/${argument}`;
  const hits = routes.filter(
    (route) =>
      route.url === needle ||
      route.url?.includes(argument) ||
      route.file.includes(argument) ||
      route.segments?.some((segment) => segment.includes(argument)),
  );
  if (hits.length === 0) return `No route matching ${argument}.`;
  return capLines(
    hits.slice(0, 40).map((route) => {
      const methods = route.methods?.length ? ` [${route.methods.join(', ')}]` : '';
      return `${route.surface}\t${route.kind}\t${route.url ?? '(no canonical url)'}${methods}\t${route.file}`;
    }),
    hits.length,
  );
}

function formatMigrations(migrations, argument) {
  if (!argument) return 'Usage: migration <table-or-filename>';
  const hits = migrations.filter(
    (migration) =>
      migration.path.includes(argument) ||
      migration.tables.some((table) => table === argument || table.endsWith(`.${argument}`)),
  );
  if (hits.length === 0) return `No migration matching ${argument}.`;
  return capLines(
    hits.slice(0, 40).map((migration) => `${migration.path}\t${migration.tables.join(', ')}`),
    hits.length,
  );
}

function formatLane(lanesDoc, id) {
  const lane = (lanesDoc?.lanes ?? []).find((item) => item.id === id);
  if (!lane) return `No lane ${id}.`;
  return [
    `id: ${lane.id}`,
    `name: ${lane.name}`,
    `owner: ${lane.ownerRole}`,
    'write paths:',
    ...(lane.ownedWritePaths ?? []).map((item) => `- ${item}`),
    'blocked paths:',
    ...(lane.blockedPaths ?? []).map((item) => `- ${item}`),
    'checks:',
    ...(lane.requiredChecks ?? []).map((item) => `- ${item}`),
  ].join('\n');
}

function formatImporters(repoRoot, index, target) {
  if (!target) return 'Usage: importers <file-or-unit-path>';
  const hits = [];
  eachFileRecord(repoRoot, index.manifest, (record) => {
    if ((record.imports ?? []).some((item) => item === target || item.startsWith(`${target}/`))) {
      hits.push(record.path);
    }
  });
  if (hits.length === 0) return `No indexed importer of ${target}.`;
  return capLines(hits.slice(0, 50), hits.length);
}

function formatSearch(repoRoot, index, text) {
  if (!text) return 'Usage: search <text>';
  const needle = text.toLowerCase();
  const lines = [];
  for (const unit of index.units) {
    const hay = `${unit.path} ${unit.name} ${unit.purpose ?? ''}`.toLowerCase();
    if (hay.includes(needle)) lines.push(`unit\t${unit.path}\t${unit.purpose ?? ''}`);
  }
  for (const [name, paths] of Object.entries(index.symbols)) {
    if (name.toLowerCase().includes(needle)) {
      lines.push(`symbol\t${name}\t${paths[0]}${paths.length > 1 ? ` +${paths.length - 1}` : ''}`);
    }
  }
  for (const route of index.routes) {
    if (`${route.url ?? ''} ${route.file}`.toLowerCase().includes(needle)) {
      lines.push(`route\t${route.url ?? '(no canonical url)'}\t${route.file}`);
    }
  }
  for (const migration of index.migrations) {
    if (`${migration.path} ${migration.tables.join(' ')}`.toLowerCase().includes(needle)) {
      lines.push(`migration\t${migration.path}\t${migration.tables.join(', ')}`);
    }
  }
  if (lines.length < 40) {
    eachFileRecord(repoRoot, index.manifest, (record) => {
      if (record.path.toLowerCase().includes(needle)) lines.push(`file\t${record.path}`);
    });
  }
  if (lines.length === 0) return `No match for ${text}.`;
  return capLines(lines.slice(0, 40), lines.length);
}
