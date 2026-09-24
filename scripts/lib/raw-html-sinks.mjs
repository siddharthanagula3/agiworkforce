/**
 * Every place a surface hands a string to the browser as markup, and what stands
 * between that string and the DOM. A sink is accepted when its value is a
 * literal, when it is the return of a sanitizer that resolves (through the
 * file's own imports) to a module that runs DOMPurify or a sanitizer with its
 * own behavioural test, or when it is a document inside a declared sandbox.
 */
import fs from 'node:fs';
import path from 'node:path';

import { escapesItsSandbox, findCreatedFrames, findEmbeddedFrames } from './embedded-frames.mjs';

export const SINK_KINDS = [
  'dangerously-set-inner-html',
  'inner-html-assignment',
  'insert-adjacent-html',
  'document-write',
  'srcdoc-attribute',
  'srcdoc-assignment',
  'webview-html-document',
  'rehype-raw',
];

const PURIFY_MODULES = new Set(['dompurify', 'isomorphic-dompurify']);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

export function lineOf(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (source[cursor] === '\n') line += 1;
  return line;
}

/** Reads one expression from `start`, stopping at a depth-0 terminator. */
export function readExpression(source, start, terminators) {
  return source.slice(start, expressionEnd(source, start, terminators)).trim();
}

/** Splits at every depth-0 occurrence of `separator`. */
export function splitTopLevel(text, separator) {
  const parts = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const end = expressionEnd(text, cursor, [separator]);
    parts.push(text.slice(cursor, end).trim());
    if (end >= text.length || text[end] !== separator) break;
    cursor = end + 1;
  }
  return parts;
}

function expressionEnd(source, start, terminators) {
  let depth = 0;
  let quote = null;
  const interpolations = [];
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (quote === '`' && character === '$' && source[index + 1] === '{') {
        interpolations.push(depth);
        depth += 1;
        quote = null;
        index += 1;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) return index;
      depth -= 1;
      if (character === '}' && interpolations.at(-1) === depth) {
        interpolations.pop();
        quote = '`';
      }
      continue;
    }
    if (depth === 0 && terminators.includes(character)) return index;
  }
  return source.length;
}

function isCommentLine(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  const prefix = source.slice(lineStart, index).trim();
  return prefix.startsWith('//') || prefix.startsWith('*') || prefix.startsWith('/*');
}

/** Every sink in one file, with the expression that reaches it where it has one. */
export function findSinks(source) {
  const sinks = [];
  const push = (kind, index, expression) => {
    if (isCommentLine(source, index)) return;
    sinks.push({ kind, index, line: lineOf(source, index), expression });
  };

  for (const match of source.matchAll(/dangerouslySetInnerHTML\s*[=:]\s*(\{\s*)?(\{)?/g)) {
    const literal =
      match[0].trimEnd().endsWith('{') && (match[0].includes('=') ? match[2] : match[1]);
    const inner = match.index + match[0].length;
    const htmlKey = literal ? /^\s*__html\s*:\s*/.exec(source.slice(inner)) : null;
    const expression = htmlKey ? readExpression(source, inner + htmlKey[0].length, [',']) : null;
    push('dangerously-set-inner-html', match.index, expression);
  }
  for (const match of source.matchAll(/\.(?:innerHTML|outerHTML)\s*(?:\+)?=(?!=)\s*/g)) {
    push(
      'inner-html-assignment',
      match.index,
      readExpression(source, match.index + match[0].length, [';']),
    );
  }
  for (const match of source.matchAll(/\.insertAdjacentHTML\s*\(/g)) {
    const args = readExpression(source, match.index + match[0].length, []);
    const comma = readExpression(args, 0, [',']);
    push('insert-adjacent-html', match.index, args.slice(comma.length + 1).trim());
  }
  for (const match of source.matchAll(/\bdocument\.write(?:ln)?\s*\(/g)) {
    push('document-write', match.index, readExpression(source, match.index + match[0].length, []));
  }
  for (const match of source.matchAll(/\bsrcDoc\s*=\s*\{/g)) {
    push(
      'srcdoc-attribute',
      match.index,
      readExpression(source, match.index + match[0].length, []),
    );
  }
  for (const match of source.matchAll(/\bsrcDoc\s*=\s*(["'])/g)) {
    push('srcdoc-attribute', match.index, match[1]);
  }
  for (const match of source.matchAll(/\.srcdoc\s*=(?!=)\s*/g)) {
    push(
      'srcdoc-assignment',
      match.index,
      readExpression(source, match.index + match[0].length, [';']),
    );
  }
  for (const match of source.matchAll(/\bsource\s*=\s*\{\s*\{\s*html\b/g)) {
    push('webview-html-document', match.index, null);
  }
  for (const match of source.matchAll(/\bfrom\s+['"]rehype-raw['"]/g)) {
    push('rehype-raw', match.index, null);
  }
  return sinks;
}

function stripOuterParens(expression) {
  let text = expression.trim();
  while (text.startsWith('(') && expressionEnd(text, 1, []) === text.length - 1) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

/** A literal, or literals joined with `+`, with no interpolation anywhere. */
export function isStaticMarkup(expression) {
  const text = stripOuterParens(expression);
  if (text.length === 0) return false;
  return splitTopLevel(text, '+').every((part) => {
    if (/^'(?:[^'\\\n]|\\.)*'$/.test(part) || /^"(?:[^"\\\n]|\\.)*"$/.test(part)) return true;
    return /^`[^`]*`$/.test(part) && !part.includes('${');
  });
}

/** The callee of an expression that is, as a whole, one call. */
export function outermostCall(expression) {
  const text = stripOuterParens(expression).replace(/^await\s+/, '');
  const match = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/.exec(text);
  if (!match) return null;
  const closing = expressionEnd(text, match[0].length, []);
  return closing === text.length - 1 ? match[1] : null;
}

function nearestDeclaration(source, name, before) {
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*`, 'g');
  let found = null;
  for (const match of source.matchAll(pattern)) {
    if (match.index >= before) break;
    found = readExpression(source, match.index + match[0].length, [';', '\n']);
  }
  return found;
}

function unwrapMemo(expression) {
  const match = /^(?:React\.)?useMemo\s*\(\s*\(\s*\)\s*=>\s*/.exec(expression);
  if (!match) return expression;
  return readExpression(expression, match[0].length, [',']);
}

/** The two branches of a depth-0 conditional, ignoring `?.` and `??`. */
function splitTernary(expression) {
  const masked = expression.replace(/\?\?|\?\./g, (token) => (token === '??' ? '##' : '#.'));
  const question = expressionEnd(masked, 0, ['?']);
  if (question >= masked.length) return null;
  const colon = expressionEnd(masked, question + 1, [':']);
  if (colon >= masked.length) return null;
  return [expression.slice(question + 1, colon).trim(), expression.slice(colon + 1).trim()];
}

function importedBindings(source) {
  const bindings = new Map();
  for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1];
    const specifier = match[2];
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(',')) {
        const [imported, local] = part
          .replace(/\btype\s+/, '')
          .trim()
          .split(/\s+as\s+/);
        if (imported)
          bindings.set((local ?? imported).trim(), { imported: imported.trim(), specifier });
      }
    }
    const defaultBinding = /^([A-Za-z_$][\w$]*)/.exec(clause.trim());
    if (defaultBinding && !clause.trim().startsWith('{')) {
      bindings.set(defaultBinding[1], { imported: 'default', specifier });
    }
  }
  return bindings;
}

function purifyNames(source) {
  const names = new Set();
  for (const [local, binding] of importedBindings(source)) {
    if (PURIFY_MODULES.has(binding.specifier) && binding.imported === 'default') names.add(local);
  }
  return names;
}

function callsPurify(source) {
  for (const name of purifyNames(source)) {
    if (new RegExp(`\\b${name}\\.sanitize\\s*\\(`).test(source)) return true;
  }
  return false;
}

function declares(source, name) {
  return new RegExp(
    `(?:function\\s+${name}\\s*[(<]|(?:const|let)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\(|function))`,
  ).test(source);
}

/** tsconfig is JSONC: comments and trailing commas, and "./*" is not a comment. */
function readJsonWithComments(file) {
  const text = fs.readFileSync(file, 'utf8');
  let output = '';
  let quote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      output += character;
      if (character === '\\') {
        output += text[index + 1] ?? '';
        index += 1;
      } else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') {
      quote = true;
      output += character;
    } else if (character === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      output += '\n';
    } else if (character === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2);
      index = close < 0 ? text.length : close + 1;
    } else output += character;
  }
  return JSON.parse(output.replace(/,(\s*[}\]])/g, '$1'));
}

function aliasTargets(repoRoot, fromFile, specifier) {
  let directory = path.dirname(fromFile);
  while (directory.startsWith(repoRoot) && directory !== repoRoot) {
    const tsconfig = path.join(directory, 'tsconfig.json');
    if (fs.existsSync(tsconfig)) {
      let paths = null;
      try {
        const options = readJsonWithComments(tsconfig).compilerOptions ?? {};
        paths = options.paths ?? null;
      } catch {
        return [];
      }
      if (!paths) return [];
      const targets = [];
      for (const [pattern, replacements] of Object.entries(paths)) {
        const prefix = pattern.replace(/\*$/, '');
        if (!pattern.endsWith('*') || !specifier.startsWith(prefix)) continue;
        for (const replacement of replacements) {
          targets.push(
            path.join(directory, replacement.replace(/\*$/, ''), specifier.slice(prefix.length)),
          );
        }
      }
      return targets;
    }
    directory = path.dirname(directory);
  }
  return [];
}

export function resolveModule(repoRoot, fromFile, specifier) {
  const bases = specifier.startsWith('.')
    ? [path.resolve(path.dirname(fromFile), specifier)]
    : aliasTargets(repoRoot, fromFile, specifier);
  for (const base of bases) {
    const candidates = [
      base,
      ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
      ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

/**
 * Whether `callee`, as spelled in `file`, is a sanitizer: DOMPurify itself, a
 * function in this file or an imported module that runs DOMPurify, or a
 * structural sanitizer that carries its own behavioural test.
 */
export function isSanitizer({ repoRoot, file, source, callee, structuralSanitizers }) {
  const [head, member] = callee.split('.');
  if (member === 'sanitize' && purifyNames(source).has(head)) return true;
  if (callee.includes('.')) return false;

  let definingFile = null;
  let exportedName = callee;
  if (declares(source, callee)) {
    definingFile = file;
  } else {
    const binding = importedBindings(source).get(callee);
    if (!binding || binding.imported === 'default') return false;
    exportedName = binding.imported;
    definingFile = resolveModule(repoRoot, file, binding.specifier);
  }
  if (!definingFile) return false;
  const definingSource = definingFile === file ? source : fs.readFileSync(definingFile, 'utf8');
  if (!declares(definingSource, exportedName)) return false;
  if (callsPurify(definingSource)) return true;
  const relative = path.relative(repoRoot, definingFile).split(path.sep).join('/');
  return structuralSanitizers.some(
    (entry) =>
      entry.module === relative &&
      entry.name === exportedName &&
      testExercises(repoRoot, entry.test, exportedName),
  );
}

function testExercises(repoRoot, testFile, name) {
  const full = path.join(repoRoot, testFile);
  if (!fs.existsSync(full)) return false;
  const text = fs.readFileSync(full, 'utf8');
  return new RegExp(`\\b${name}\\s*\\(`).test(text) && /\bexpect\s*\(/.test(text);
}

/** Why one expression is safe to hand the DOM, or null when nothing shows it is. */
export function classifyExpression(context, expression, before, hops = 0) {
  if (expression === null || expression === undefined) return null;
  const text = unwrapMemo(stripOuterParens(expression));
  if (text === '' || isStaticMarkup(text)) return 'static';
  const callee = outermostCall(text);
  if (callee && isSanitizer({ ...context, callee })) return 'sanitized';
  const branches = splitTernary(text);
  if (branches) {
    const verdicts = branches.map((branch) =>
      /^(?:null|undefined|'')$/.test(branch.trim())
        ? 'static'
        : classifyExpression(context, branch, before, hops),
    );
    return verdicts.every(Boolean)
      ? (verdicts.find((verdict) => verdict !== 'static') ?? 'static')
      : null;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(text) && hops < 2) {
    const declaration = nearestDeclaration(context.source, text, before);
    if (declaration !== null) return classifyExpression(context, declaration, before, hops + 1);
    const binding = importedBindings(context.source).get(text);
    const module =
      binding && binding.imported !== 'default'
        ? resolveModule(context.repoRoot, context.file, binding.specifier)
        : null;
    if (module) {
      const source = fs.readFileSync(module, 'utf8');
      const exported = nearestDeclaration(source, binding.imported, source.length);
      if (exported !== null) {
        return classifyExpression(
          { ...context, file: module, source },
          exported,
          source.length,
          hops + 1,
        );
      }
    }
  }
  return null;
}

/** A rehype-raw import is contained only when every plugin list sanitizes after it. */
function rawIsSanitizedAfter(source) {
  const rawName = [...importedBindings(source)].find(
    ([, binding]) => binding.specifier === 'rehype-raw',
  )?.[0];
  const sanitizeName = [...importedBindings(source)].find(
    ([, binding]) => binding.specifier === 'rehype-sanitize',
  )?.[0];
  if (!rawName) return false;
  const uses = [...source.matchAll(new RegExp(`\\b${rawName}\\b`, 'g'))].filter(
    (match) => !/import\s+[^;]*$/.test(source.slice(Math.max(0, match.index - 40), match.index)),
  );
  if (uses.length === 0 || !sanitizeName) return uses.length === 0;
  return uses.every((use) => {
    const rest = source.slice(use.index + rawName.length);
    const listEnd = readExpression(rest, 0, []);
    return new RegExp(`\\b${sanitizeName}\\b`).test(listEnd);
  });
}

function withoutLineComments(text) {
  return text
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

function frameAround(source, index) {
  const open = source.lastIndexOf('<iframe', index);
  if (open < 0) return null;
  const slice = withoutLineComments(source.slice(open));
  const frame = findEmbeddedFrames(slice)[0] ?? null;
  if (!frame) return null;
  const dynamic = /\bsandbox\s*=\s*\{/.exec(slice);
  return {
    ...frame,
    sandboxExpression: dynamic
      ? readExpression(slice, dynamic.index + dynamic[0].length, [])
      : null,
  };
}

/** The literal sandbox values an expression can take, or null when one is not a literal. */
function sandboxValues(context, expression, before, hops = 0) {
  const text = stripOuterParens(expression);
  const literal = /^(['"`])([^'"`$]*)\1$/.exec(text);
  if (literal) return [literal[2]];
  const branches = splitTernary(text);
  if (branches) {
    const values = branches.map((branch) => sandboxValues(context, branch, before, hops));
    return values.every(Boolean) ? values.flat() : null;
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(text) || hops >= 2) return null;
  const local = nearestDeclaration(context.source, text, before);
  if (local !== null) return sandboxValues(context, local, before, hops + 1);
  const binding = importedBindings(context.source).get(text);
  const module =
    binding && binding.imported !== 'default'
      ? resolveModule(context.repoRoot, context.file, binding.specifier)
      : null;
  if (!module) return null;
  const source = fs.readFileSync(module, 'utf8');
  const exported = nearestDeclaration(source, binding.imported, source.length);
  return exported === null
    ? null
    : sandboxValues({ ...context, file: module, source }, exported, source.length, hops + 1);
}

function isContainedFrame(context, frame, before) {
  if (!frame || !frame.declared) return false;
  if (!frame.dynamicSandbox) return !escapesItsSandbox(frame.tokens);
  if (!frame.sandboxExpression) return false;
  const values = sandboxValues(context, frame.sandboxExpression, before);
  return (
    values !== null &&
    values.every((value) => !escapesItsSandbox(value.split(/\s+/).filter(Boolean)))
  );
}

/** Classifies every sink in one file. Unaccepted sinks carry `verdict: null`. */
export function classifySinks({ repoRoot, file, source, structuralSanitizers }) {
  const context = { repoRoot, file, source, structuralSanitizers };
  return findSinks(source).map((sink) => {
    let verdict = null;
    if (sink.kind === 'rehype-raw') {
      verdict = rawIsSanitizedAfter(source) ? 'sanitized' : null;
    } else if (sink.kind === 'srcdoc-attribute') {
      verdict = isContainedFrame(context, frameAround(source, sink.index), sink.index)
        ? 'framed'
        : null;
    } else if (sink.kind === 'srcdoc-assignment') {
      const created = findCreatedFrames(source);
      verdict =
        classifyExpression(context, sink.expression, sink.index) === 'static'
          ? 'static'
          : created.length > 0 && created.every((frame) => frame.declared)
            ? 'framed'
            : null;
    } else if (sink.kind !== 'webview-html-document') {
      verdict = classifyExpression(context, sink.expression, sink.index);
    }
    return { ...sink, verdict };
  });
}
