#!/usr/bin/env node
/* global console */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import {
  collectReachable,
  collectWorkspacePackageAliases,
  createResolver,
} from '../../../scripts/lib/module-graph.mjs';

const repoRoot = process.cwd();
const libPath = 'apps/desktop/src-tauri/src/lib.rs';
const rustRoot = 'apps/desktop/src-tauri/src';
const allowlistPath = 'apps/desktop/wiring-allowlist.json';
const hitlPath = 'apps/desktop/.hitl-required-tools.yaml';
const rendererEntry = 'apps/desktop/src/main.tsx';
const commandClientRoot = 'packages/client/desktop-command-client/src';
export const INVOKE_CALL_PATTERN =
  /\b(?:invoke[A-Za-z0-9_$]*|[A-Za-z_$][A-Za-z0-9_$]*Invoke)(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
export const COMMAND_CALL_PATTERN =
  /\bcommand(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
const INVOKE_CALLEE = /^(?:invoke[A-Za-z0-9_$]*|[A-Za-z_$][A-Za-z0-9_$]*Invoke)$/;
export const isInvokeCallee = (name) => INVOKE_CALLEE.test(name);
export const isCommandCallee = (name) => name === 'command';
const frontendRoots = [
  {
    path: 'apps/desktop/src',
    patterns: [INVOKE_CALL_PATTERN],
    isCallee: isInvokeCallee,
  },
  {
    path: commandClientRoot,
    patterns: [COMMAND_CALL_PATTERN],
    isCallee: isCommandCallee,
  },
  {
    path: 'packages/ui/unified-chat/src',
    patterns: [INVOKE_CALL_PATTERN],
    isCallee: isInvokeCallee,
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

function createRendererResolver() {
  const desktopSrc = path.join(repoRoot, 'apps/desktop/src');
  return createResolver({
    '@/*': desktopSrc,
    '@components/*': path.join(desktopSrc, 'components'),
    '@stores/*': path.join(desktopSrc, 'stores'),
    '@hooks/*': path.join(desktopSrc, 'hooks'),
    '@utils/*': path.join(desktopSrc, 'utils'),
    '@styles/*': path.join(desktopSrc, 'styles'),
    '@types/*': path.join(desktopSrc, 'types'),
    '@assets/*': path.join(desktopSrc, 'assets'),
    '@lib/*': path.join(desktopSrc, 'lib'),
    ...collectWorkspacePackageAliases(repoRoot),
  });
}

export function walkModuleGraph(entry, resolve) {
  const importers = new Map();
  const reachable = new Set();
  const onEdge = (from, to) => {
    let known = importers.get(to);
    if (!known) {
      known = new Set();
      importers.set(to, known);
    }
    known.add(path.resolve(from));
  };
  for (const file of collectReachable([entry], resolve, { onEdge })) {
    reachable.add(path.resolve(file));
  }
  return { reachable, importers };
}

function walkRendererGraph() {
  const entry = path.join(repoRoot, rendererEntry);
  if (!fs.existsSync(entry)) {
    throw new Error(
      `${rendererEntry} not found; the reachability walk would be vacuously empty. ` +
        'Update rendererEntry in check-wiring.mjs if the renderer entry point moved.',
    );
  }
  const resolve = createRendererResolver();
  return { ...walkModuleGraph(entry, resolve), resolve };
}

export function collectReachableRendererFiles() {
  return walkRendererGraph().reachable;
}

const COMMAND_NAME = /^[a-z_][a-z0-9_]*$/;

function hasModifier(node, kind) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
  );
}

function hasExportModifier(node) {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function readModuleRecord(file, resolve) {
  const sourceFile = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = new Map();
  const reexports = [];
  const localExports = new Map();
  const declarations = new Map();
  const moduleStatements = [];

  const resolveModule = (specifier) => {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return null;
    const resolved = resolve(specifier.text, file);
    return resolved ? path.resolve(resolved) : null;
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const target = resolveModule(statement.moduleSpecifier);
      const clause = statement.importClause;
      if (!target || !clause || clause.isTypeOnly) continue;
      if (clause.name) imports.set(clause.name.text, { file: target, imported: 'default' });
      if (!clause.namedBindings) continue;
      if (ts.isNamespaceImport(clause.namedBindings)) {
        imports.set(clause.namedBindings.name.text, { file: target, imported: '*' });
        continue;
      }
      for (const element of clause.namedBindings.elements) {
        if (element.isTypeOnly) continue;
        imports.set(element.name.text, {
          file: target,
          imported: (element.propertyName ?? element.name).text,
        });
      }
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (!statement.moduleSpecifier) {
        if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            if (element.isTypeOnly) continue;
            localExports.set(element.name.text, (element.propertyName ?? element.name).text);
          }
        }
        continue;
      }
      const target = resolveModule(statement.moduleSpecifier);
      if (!target) continue;
      if (!clause) {
        reexports.push({ kind: 'star', file: target });
      } else if (ts.isNamespaceExport(clause)) {
        reexports.push({ kind: 'namespace', exported: clause.name.text, file: target });
      } else {
        for (const element of clause.elements) {
          if (element.isTypeOnly) continue;
          reexports.push({
            kind: 'named',
            exported: element.name.text,
            file: target,
            imported: (element.propertyName ?? element.name).text,
          });
        }
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      declarations.set(statement.name.text, statement);
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        localExports.set('default', statement.name.text);
      } else if (hasExportModifier(statement)) {
        localExports.set(statement.name.text, statement.name.text);
      }
      continue;
    }
    if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      localExports.set('default', statement.expression.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement);
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          moduleStatements.push(declaration);
          continue;
        }
        declarations.set(declaration.name.text, declaration);
        if (exported) localExports.set(declaration.name.text, declaration.name.text);
      }
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    moduleStatements.push(statement);
  }

  return {
    file,
    sourceFile,
    imports,
    reexports,
    localExports,
    declarations,
    moduleStatements,
  };
}

function bindingNames(name, names) {
  if (ts.isIdentifier(name)) {
    names.push(name.text);
  } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) bindingNames(element.name, names);
    }
  }
}

function namesDeclaredBy(node) {
  const names = [];
  const fromDeclarationList = (list) => {
    if (list && ts.isVariableDeclarationList(list)) {
      for (const declaration of list.declarations) bindingNames(declaration.name, names);
    }
  };
  if (ts.isFunctionLike(node)) {
    for (const parameter of node.parameters) bindingNames(parameter.name, names);
    if (ts.isFunctionExpression(node) && node.name) names.push(node.name.text);
  }
  if (ts.isBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) {
    for (const statement of node.statements) {
      if (ts.isVariableStatement(statement)) {
        fromDeclarationList(statement.declarationList);
      } else if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        names.push(statement.name.text);
      }
    }
  }
  if (ts.isCatchClause(node) && node.variableDeclaration) {
    bindingNames(node.variableDeclaration.name, names);
  }
  if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    fromDeclarationList(node.initializer);
  }
  return names;
}

function isValueUse(identifier) {
  const parent = identifier.parent;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isNamespaceExport(parent) ||
    ts.isQualifiedName(parent) ||
    ts.isTypeReferenceNode(parent) ||
    ts.isTypeQueryNode(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent)
  ) {
    return false;
  }
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (ts.isBindingElement(parent)) return parent.initializer === identifier;
  return parent.name !== identifier;
}

function createExportResolver(resolve) {
  const records = new Map();

  const recordOf = (file) => {
    if (!records.has(file)) {
      records.set(file, fs.existsSync(file) ? readModuleRecord(file, resolve) : null);
    }
    return records.get(file);
  };

  const resolveExport = (file, name, seen = new Set()) => {
    const key = `${file}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const record = recordOf(file);
    if (!record) return null;

    const local = record.localExports.get(name);
    if (local !== undefined) {
      const imported = record.imports.get(local);
      if (imported) {
        return imported.imported === '*'
          ? { kind: 'namespace', file: imported.file }
          : resolveExport(imported.file, imported.imported, seen);
      }
      return record.declarations.has(local) ? { kind: 'symbol', file, name: local } : null;
    }
    for (const reexport of record.reexports) {
      if (reexport.kind === 'namespace' && reexport.exported === name) {
        return { kind: 'namespace', file: reexport.file };
      }
      if (reexport.kind === 'named' && reexport.exported === name) {
        return resolveExport(reexport.file, reexport.imported, seen);
      }
    }
    for (const reexport of record.reexports) {
      if (reexport.kind !== 'star') continue;
      const target = resolveExport(reexport.file, name, seen);
      if (target) return target;
    }
    return null;
  };

  const exportNames = (file, seen = new Set()) => {
    if (seen.has(file)) return [];
    seen.add(file);
    const record = recordOf(file);
    if (!record) return [];
    const names = [...record.localExports.keys()];
    for (const reexport of record.reexports) {
      if (reexport.kind === 'star') names.push(...exportNames(reexport.file, seen));
      else names.push(reexport.exported);
    }
    return names;
  };

  const resolveImport = (binding) =>
    binding.imported === '*'
      ? { kind: 'namespace', file: binding.file }
      : resolveExport(binding.file, binding.imported);

  return { recordOf, resolveExport, exportNames, resolveImport };
}

function scanReferences(root, bindings, exportResolver, resolveModule, sink) {
  const follow = (node, target) => {
    if (target.kind === 'symbol') {
      sink.symbol(target);
      return;
    }
    let use = node;
    while (
      ts.isParenthesizedExpression(use.parent) ||
      ts.isNonNullExpression(use.parent) ||
      ts.isAsExpression(use.parent) ||
      ts.isSatisfiesExpression(use.parent)
    ) {
      use = use.parent;
    }
    const parent = use.parent;
    let member = null;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === use) {
      member = parent.name.text;
    } else if (
      ts.isElementAccessExpression(parent) &&
      parent.expression === use &&
      ts.isStringLiteralLike(parent.argumentExpression)
    ) {
      member = parent.argumentExpression.text;
    }
    if (member !== null) {
      const next = exportResolver.resolveExport(target.file, member);
      if (next) follow(parent, next);
      return;
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === use) {
      if (ts.isIdentifier(parent.name)) {
        followLocal(parent.name, target);
        return;
      }
      if (ts.isObjectBindingPattern(parent.name)) {
        for (const element of parent.name.elements) {
          const key = element.propertyName ?? element.name;
          if (element.dotDotDotToken || !(ts.isIdentifier(key) || ts.isStringLiteralLike(key))) {
            sink.namespace(target);
            continue;
          }
          const next = exportResolver.resolveExport(target.file, key.text);
          if (!next) continue;
          if (next.kind === 'symbol') sink.symbol(next);
          else if (ts.isIdentifier(element.name)) followLocal(element.name, next);
          else sink.namespace(next);
        }
        return;
      }
    }
    sink.namespace(target);
  };

  function followLocal(declaredName, target) {
    let scope = declaredName.parent;
    let exported = false;
    while (scope.parent && !ts.isBlock(scope) && !ts.isSourceFile(scope)) {
      if (ts.isVariableStatement(scope) && hasExportModifier(scope)) exported = true;
      scope = scope.parent;
    }
    if (exported) {
      sink.namespace(target);
      return;
    }
    const visitScope = (node) => {
      if (ts.isIdentifier(node) && node !== declaredName && node.text === declaredName.text) {
        if (ts.isExportSpecifier(node.parent)) sink.namespace(target);
        else if (isValueUse(node)) follow(node, target);
      }
      ts.forEachChild(node, visitScope);
    };
    visitScope(scope);
  }

  const visit = (node, shadowed) => {
    let inner = shadowed;
    const declared = namesDeclaredBy(node).filter((name) => bindings.has(name));
    if (declared.length > 0) inner = new Set([...shadowed, ...declared]);

    if (
      ts.isIdentifier(node) &&
      bindings.has(node.text) &&
      !inner.has(node.text) &&
      isValueUse(node)
    ) {
      follow(node, bindings.get(node.text));
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const file = resolveModule(node.arguments[0]);
      if (file) {
        const target = { kind: 'namespace', file };
        if (ts.isAwaitExpression(node.parent)) follow(node.parent, target);
        else sink.namespace(target);
      }
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };

  visit(root, new Set());
}

function isAggregate(node) {
  if (ts.isClassDeclaration(node)) return true;
  if (!ts.isVariableDeclaration(node) || !node.initializer) return false;
  let value = node.initializer;
  while (
    ts.isParenthesizedExpression(value) ||
    ts.isAsExpression(value) ||
    ts.isSatisfiesExpression(value)
  ) {
    value = value.expression;
  }
  return ts.isObjectLiteralExpression(value) || ts.isClassExpression(value);
}

function collectCommandCalls(root, isCallee, skipDeferred = false) {
  const commands = new Set();
  const visit = (node) => {
    if (
      skipDeferred &&
      (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node))
    ) {
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      const first = node.arguments[0];
      if (
        calleeName !== null &&
        isCallee(calleeName) &&
        first &&
        ts.isStringLiteralLike(first) &&
        COMMAND_NAME.test(first.text)
      ) {
        commands.add(first.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return commands;
}

export function analyzeCommandCallers({ callerFiles, reachable, importers, resolve }) {
  const calleeOf = new Map(
    [...callerFiles].map(([file, isCallee]) => [path.resolve(file), isCallee]),
  );
  const clients = new Set(calleeOf.keys());
  const exportResolver = createExportResolver(resolve);
  const symbolKey = (target) => `${target.file}\0${target.name}`;

  const wrappers = new Map();
  const liveCommands = new Set();
  const referenced = new Set();
  const escapedNamespaces = new Set();
  const immediateRoots = [];
  const immediatePending = [];
  const immediateInvoked = new Set();
  const immediateEffects = new Map();

  const markNamespace = (target) => {
    if (escapedNamespaces.has(target.file)) return;
    escapedNamespaces.add(target.file);
    for (const name of exportResolver.exportNames(target.file)) {
      const next = exportResolver.resolveExport(target.file, name);
      if (!next) continue;
      if (next.kind === 'symbol') referenced.add(symbolKey(next));
      else markNamespace(next);
    }
  };
  const rootSink = {
    symbol: (target) => referenced.add(symbolKey(target)),
    namespace: markNamespace,
  };
  const moduleResolver = (file) => (specifier) => {
    if (!specifier || !ts.isStringLiteralLike(specifier)) return null;
    const resolved = resolve(specifier.text, file);
    return resolved ? path.resolve(resolved) : null;
  };

  for (const file of clients) {
    const record = exportResolver.recordOf(file);
    if (!record) continue;
    const bindings = new Map();
    for (const [local, binding] of record.imports) {
      const target = exportResolver.resolveImport(binding);
      if (target) bindings.set(local, target);
    }
    for (const name of record.declarations.keys()) {
      bindings.set(name, { kind: 'symbol', file, name });
    }

    const isCallee = calleeOf.get(file);
    for (const [name, node] of record.declarations) {
      const references = new Set();
      scanReferences(node, bindings, exportResolver, moduleResolver(file), {
        symbol: (target) => references.add(symbolKey(target)),
        namespace: markNamespace,
      });
      wrappers.set(symbolKey({ file, name }), {
        file,
        name,
        node,
        bindings,
        isCallee,
        commands: collectCommandCalls(node, isCallee),
        references,
        aggregate: isAggregate(node),
      });
      if (reachable.has(file) && ts.isVariableDeclaration(node) && node.initializer) {
        immediateRoots.push({ node: node.initializer, bindings, isCallee, file, name });
      }
    }
    if (reachable.has(file)) {
      for (const statement of record.moduleStatements) {
        for (const command of collectCommandCalls(statement, isCallee)) liveCommands.add(command);
        scanReferences(statement, bindings, exportResolver, moduleResolver(file), rootSink);
      }
    }
  }

  const carriers = new Set(clients);
  const consumers = new Set();
  const queue = [...clients];
  while (queue.length > 0) {
    const carrier = queue.pop();
    for (const importer of importers.get(carrier) ?? []) {
      if (!reachable.has(importer)) continue;
      if (!clients.has(importer)) consumers.add(importer);
      if (carriers.has(importer)) continue;
      const record = exportResolver.recordOf(importer);
      if (!record) continue;
      const reexportsCarrier =
        record.reexports.some((reexport) => carriers.has(reexport.file)) ||
        [...record.localExports.values()].some((local) =>
          carriers.has(record.imports.get(local)?.file),
        );
      if (reexportsCarrier) {
        carriers.add(importer);
        queue.push(importer);
      }
    }
  }

  for (const file of consumers) {
    const record = exportResolver.recordOf(file);
    if (!record) continue;
    const bindings = new Map();
    for (const [local, binding] of record.imports) {
      if (!carriers.has(binding.file)) continue;
      const target = exportResolver.resolveImport(binding);
      if (target) bindings.set(local, target);
    }
    const resolveCarrier = (specifier) => {
      const resolved = moduleResolver(file)(specifier);
      return resolved && carriers.has(resolved) ? resolved : null;
    };
    scanReferences(record.sourceFile, bindings, exportResolver, resolveCarrier, rootSink);
  }

  const scanImmediate = ({ node, bindings, isCallee, file }) => {
    const commands = collectCommandCalls(node, isCallee, true);
    const references = new Set();
    const namespaces = new Set();
    for (const command of commands) liveCommands.add(command);
    const sink = {
      symbol: (target) => {
        const key = symbolKey(target);
        references.add(key);
        immediatePending.push(key);
      },
      namespace: (target) => {
        if (namespaces.has(target.file)) return;
        namespaces.add(target.file);
        for (const name of exportResolver.exportNames(target.file)) {
          const next = exportResolver.resolveExport(target.file, name);
          if (next) sink[next.kind](next);
        }
      },
    };
    const visit = (current, shadowed) => {
      if (
        ts.isFunctionLike(current) ||
        ts.isClassDeclaration(current) ||
        ts.isClassExpression(current)
      ) {
        return;
      }
      const declared = namesDeclaredBy(current).filter((name) => bindings.has(name));
      const inner = declared.length > 0 ? new Set([...shadowed, ...declared]) : shadowed;
      if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
        scanReferences(
          current.expression,
          new Map([...bindings].filter(([name]) => !inner.has(name))),
          exportResolver,
          moduleResolver(file),
          sink,
        );
      }
      ts.forEachChild(current, (child) => visit(child, inner));
    };
    visit(node, new Set());
    return { commands, references };
  };
  for (const root of immediateRoots) {
    immediateEffects.set(symbolKey(root), scanImmediate(root));
  }
  while (immediatePending.length > 0) {
    const key = immediatePending.pop();
    if (immediateInvoked.has(key)) continue;
    const wrapper = wrappers.get(key);
    if (!wrapper) continue;
    immediateInvoked.add(key);
    const value = ts.isVariableDeclaration(wrapper.node) ? wrapper.node.initializer : wrapper.node;
    if (!value || !ts.isFunctionLike(value) || !value.body) continue;
    const parameters = new Set(namesDeclaredBy(value));
    immediateEffects.set(
      key,
      scanImmediate({
        ...wrapper,
        node: value.body,
        bindings: new Map([...wrapper.bindings].filter(([name]) => !parameters.has(name))),
      }),
    );
  }

  const live = new Set();
  const pending = [...referenced];
  while (pending.length > 0) {
    const key = pending.pop();
    if (live.has(key)) continue;
    live.add(key);
    for (const next of wrappers.get(key)?.references ?? []) pending.push(next);
  }

  const unusedWrappers = new Map();
  const unreferencedCallers = [];
  for (const [key, wrapper] of wrappers) {
    if (live.has(key)) {
      for (const command of wrapper.commands) liveCommands.add(command);
    }
  }
  const commandsReachedFrom = (start, graph = wrappers) => {
    const commands = new Set();
    const seen = new Set();
    const stack = [start];
    while (stack.length > 0) {
      const key = stack.pop();
      if (seen.has(key)) continue;
      seen.add(key);
      const wrapper = graph.get(key);
      if (!wrapper) continue;
      for (const command of wrapper.commands) commands.add(command);
      for (const next of wrapper.references) stack.push(next);
    }
    return commands;
  };
  for (const [key, wrapper] of wrappers) {
    if (live.has(key)) continue;
    const commands = wrapper.aggregate ? commandsReachedFrom(key) : wrapper.commands;
    if (commands.size === 0) continue;
    const site = `${path.relative(repoRoot, wrapper.file).split(path.sep).join('/')}#${wrapper.name}`;
    if (commandsReachedFrom(key, immediateEffects).size === 0) {
      unreferencedCallers.push({ site, commands: [...commands].sort() });
    }
    for (const command of commands) {
      if (liveCommands.has(command)) continue;
      const sites = unusedWrappers.get(command) ?? [];
      sites.push(site);
      unusedWrappers.set(command, sites);
    }
  }

  return { liveCommands, unusedWrappers, unreferencedCallers };
}

function extractFrontendCalls({ reachable, importers, resolve }) {
  const calls = new Set();
  const lexicalReachable = new Set();
  const callerFiles = new Map();

  for (const root of frontendRoots) {
    const files = walkFiles(root.path, (file) => /\.(?:ts|tsx)$/.test(file))
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
      .map((file) => path.resolve(path.join(repoRoot, file)));
    for (const absolutePath of files) {
      const source = stripComments(fs.readFileSync(absolutePath, 'utf8'));
      let found = false;
      for (const pattern of root.patterns) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) {
          found = true;
          calls.add(match[1]);
          if (reachable.has(absolutePath)) lexicalReachable.add(match[1]);
        }
      }
      if (found && reachable.has(absolutePath)) callerFiles.set(absolutePath, root.isCallee);
    }
  }

  const usage = analyzeCommandCallers({ callerFiles, reachable, importers, resolve });
  const reachableCalls = new Set(usage.liveCommands);
  const unusedWrappers = new Map();
  for (const command of lexicalReachable) {
    if (reachableCalls.has(command)) continue;
    if (usage.unusedWrappers.has(command)) {
      unusedWrappers.set(command, usage.unusedWrappers.get(command));
    } else {
      reachableCalls.add(command);
    }
  }

  return {
    calls,
    reachableCalls,
    unusedWrappers,
    unreferencedCallers: usage.unreferencedCallers,
  };
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

function readAllowlistSection(allowlist, sectionName, required) {
  const entries = allowlist[sectionName];
  if (entries === undefined) {
    if (required) throw new Error(`${allowlistPath} must contain ${sectionName}[]`);
    return [];
  }
  if (!Array.isArray(entries)) {
    throw new Error(`${allowlistPath}.${sectionName} must be an array`);
  }

  const commands = new Set();
  for (const [index, entry] of entries.entries()) {
    if (
      !entry ||
      typeof entry.command !== 'string' ||
      !/^[a-z_][a-z0-9_]*$/.test(entry.command) ||
      typeof entry.reason !== 'string' ||
      entry.reason.trim().length < 20
    ) {
      throw new Error(
        `${allowlistPath}.${sectionName} entry ${index + 1} must contain command and reason`,
      );
    }
    if (commands.has(entry.command)) {
      throw new Error(
        `${allowlistPath}.${sectionName} contains duplicate command ${entry.command}`,
      );
    }
    commands.add(entry.command);
  }
  return [...commands];
}

function readAllowlist() {
  const absolutePath = path.join(repoRoot, allowlistPath);
  if (!fs.existsSync(absolutePath)) {
    return { registeredWithoutFrontendCaller: [], registeredWithoutReachableCaller: [] };
  }

  const allowlist = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!allowlist || allowlist.schemaVersion !== 1) {
    throw new Error(`${allowlistPath} must have schemaVersion 1`);
  }

  return {
    registeredWithoutFrontendCaller: readAllowlistSection(
      allowlist,
      'registeredWithoutFrontendCaller',
      true,
    ),
    registeredWithoutReachableCaller: readAllowlistSection(
      allowlist,
      'registeredWithoutReachableCaller',
      false,
    ),
  };
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

export function analyzeWiring({
  registeredCommands,
  frontendCalls,
  rustDefinitions,
  allowlisted,
  reachableFrontendCalls = frontendCalls,
  reachabilityAllowlisted = new Set(),
  unusedWrappers = new Map(),
  unreferencedCallers = [],
}) {
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

  const withoutReachableCaller = [...registered]
    .filter(
      (command) =>
        frontendCalls.has(command) &&
        !reachableFrontendCalls.has(command) &&
        !allowlisted.has(command) &&
        !reachabilityAllowlisted.has(command),
    )
    .sort();
  const registeredWithoutReachableCaller = withoutReachableCaller.filter(
    (command) => !unusedWrappers.has(command),
  );
  const registeredWithUnusedWrapper = withoutReachableCaller
    .filter((command) => unusedWrappers.has(command))
    .map((command) => `${command} (${[...unusedWrappers.get(command)].sort().join(', ')})`);
  const staleReachabilityAllowlist = [...reachabilityAllowlisted]
    .filter((command) => !registered.has(command) || reachableFrontendCalls.has(command))
    .sort();
  const unreferencedLiveCallers = unreferencedCallers
    .filter(({ commands }) =>
      commands.every((command) => registered.has(command) && reachableFrontendCalls.has(command)),
    )
    .map(({ site, commands }) => `${site} (${commands.join(', ')})`)
    .sort();

  return {
    duplicateRegistrations,
    frontendWithoutRegistration,
    definitionWithoutRegistration,
    registeredWithoutFrontend,
    staleAllowlist,
    registeredWithoutReachableCaller,
    registeredWithUnusedWrapper,
    staleReachabilityAllowlist,
    unreferencedLiveCallers,
  };
}

const FAILURE_GROUPS = [
  {
    key: 'duplicateRegistrations',
    label: 'DUPLICATE (command registered more than once)',
    fix: `delete the repeated line from generate_handler! in ${libPath}.`,
  },
  {
    key: 'frontendWithoutRegistration',
    label: 'MISSING (frontend invoke without registration)',
    fix:
      `the renderer calls a command the host does not expose. Add the #[tauri::command] to ` +
      `generate_handler! in ${libPath}, or delete the call if the command was removed.`,
  },
  {
    key: 'definitionWithoutRegistration',
    label: 'MISSING (#[tauri::command] not in generate_handler!)',
    fix:
      `register the function in generate_handler! in ${libPath}, or drop its #[tauri::command] ` +
      'attribute if only Rust calls it.',
  },
  {
    key: 'registeredWithoutFrontend',
    label: 'ORPHAN (registered command has no frontend caller or allowlist entry)',
    fix:
      'delete the command, its generate_handler! entry and its REGISTERED_COMMANDS mirror entry. ' +
      `If Rust calls it in-process or the name is built at runtime, add it to ` +
      `registeredWithoutFrontendCaller in ${allowlistPath} with the call site as the reason.`,
  },
  {
    key: 'staleAllowlist',
    label: 'STALE (allowlist entry is no longer an orphaned registration)',
    fix: `remove the entry from registeredWithoutFrontendCaller in ${allowlistPath}.`,
  },
  {
    key: 'registeredWithoutReachableCaller',
    label:
      'UNREACHABLE (registered command is only invoked from modules unreachable from src/main.tsx)',
    fix:
      `import the calling module from something ${rendererEntry} reaches, or delete the ` +
      'command together with the unmounted module that calls it.',
  },
  {
    key: 'registeredWithUnusedWrapper',
    label:
      'UNUSED WRAPPER (the only caller is a function, in desktop-command-client or the ' +
      'renderer, that no module reachable from src/main.tsx references)',
    fix:
      `call the named function from a module ${rendererEntry} reaches, or cut the command: ` +
      'delete the function and its types, the Rust function, its generate_handler! entry in ' +
      `${libPath} and its REGISTERED_COMMANDS mirror entry. If Rust still calls the function ` +
      'in-process, delete only the TypeScript function and the registration. A ' +
      `command kept for a planned stage needs a registeredWithoutReachableCaller entry in ` +
      `${allowlistPath} opening with WIRE:, DELETE: or KEEP: and citing the spec or call site. ` +
      'Record the decision in docs/decisions/wire-or-cut.md.',
  },
  {
    key: 'staleReachabilityAllowlist',
    label: 'STALE (reachability allowlist entry now has a reachable caller)',
    fix: `remove the entry from registeredWithoutReachableCaller in ${allowlistPath}.`,
  },
  {
    key: 'unreferencedLiveCallers',
    label:
      'DEAD CALLER (a function, class or object literal reaches commands that are live ' +
      'elsewhere, but no module reachable from src/main.tsx references it)',
    fix:
      'delete the function, class or object literal and the types only it used, or use it from ' +
      `a module ${rendererEntry} reaches. The commands stay registered: another caller reaches them.`,
  },
  {
    key: 'hitlViolations',
    label: 'MISSING (HITL-required tool approval boundary)',
    fix:
      `the handler named in ${hitlPath} must call request_confirmation_simple before acting; ` +
      'restore the call or correct the handler path.',
  },
];

export function reportFailures(result, write = console.error) {
  let failureCount = 0;
  for (const { key, label, fix } of FAILURE_GROUPS) {
    const entries = result[key] ?? [];
    if (entries.length === 0) continue;
    for (const entry of entries) {
      write(`${label}: ${entry}`);
      failureCount += 1;
    }
    write(`  Fix: ${fix}`);
  }
  return failureCount;
}

export function main() {
  const registeredCommands = extractRegisteredCommands(
    fs.readFileSync(path.join(repoRoot, libPath), 'utf8'),
  );
  const rendererGraph = walkRendererGraph();
  const reachableFiles = rendererGraph.reachable;
  const {
    calls: frontendCalls,
    reachableCalls,
    unusedWrappers,
    unreferencedCallers,
  } = extractFrontendCalls(rendererGraph);
  const rustDefinitions = extractRustCommandDefinitions();
  const allowlist = readAllowlist();
  const allowlisted = new Set(allowlist.registeredWithoutFrontendCaller);
  const reachabilityAllowlisted = new Set(allowlist.registeredWithoutReachableCaller);
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
    reachableFrontendCalls: reachableCalls,
    reachabilityAllowlisted,
    unusedWrappers,
    unreferencedCallers,
  });
  result.hitlViolations = analyzeHitlRequirements(hitlRequirements, handlerSources);
  const failureCount = reportFailures(result);

  if (failureCount > 0) {
    console.error(
      `Wiring check failed: ${failureCount} issue(s); ${registeredCommands.length} registrations, ` +
        `${frontendCalls.size} frontend calls (${reachableCalls.size} with a live caller reachable ` +
        `from ${rendererEntry}), ${rustDefinitions.size} Rust command definitions.`,
    );
    process.exit(1);
  }

  console.log(
    `Wiring check passed: ${registeredCommands.length} registrations, ` +
      `${frontendCalls.size} frontend calls (${reachableCalls.size} with a live caller in ` +
      `${reachableFiles.size} modules reachable from ${rendererEntry}), ` +
      `${rustDefinitions.size} Rust command definitions, ` +
      `${allowlisted.size} reviewed orphan allowlist entries, ` +
      `${reachabilityAllowlisted.size} reviewed reachability allowlist entries.`,
  );
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) main();
