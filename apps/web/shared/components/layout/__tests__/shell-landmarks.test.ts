import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const repoRoot = resolve(webRoot, '../..');
const SHELL = 'WebAppShell';
const MAIN_LANDMARK = /<main\b|role="main"|role: 'main'/;
const NAV_SOURCES = [
  resolve(repoRoot, 'packages/ui/ui/src/sidebar'),
  resolve(webRoot, 'shared/components/layout'),
];
const SHELL_ROOTS = [
  'shared/components/layout/WebAppShell.tsx',
  'features/chat/pages/WebChatPage.tsx',
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith('.tsx') && !/\.(test|spec|stories)\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const parse = (file: string) =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, 4);

const ALIASES: Array<[RegExp, string]> = [
  [/^@shared\//, 'shared/'],
  [/^@features\//, 'features/'],
  [/^@\//, ''],
];

function resolveImport(from: string, specifier: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
  const alias = ALIASES.find(([pattern]) => pattern.test(specifier));
  if (alias) base = resolve(webRoot, specifier.replace(alias[0], alias[1]));
  if (!base) return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function importsOf(sourceFile: ts.SourceFile): Map<string, string> {
  const imported = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    const clause = statement.importClause;
    if (clause.name) imported.set(clause.name.text, specifier);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) imported.set(element.name.text, specifier);
    }
  }
  return imported;
}

function declares(sourceFile: ts.SourceFile, name: string): boolean {
  return sourceFile.statements.some((statement) => {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      return statement.name?.text === name;
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      );
    }
    return false;
  });
}

/** Follows barrel re-exports to the module that defines the component. */
function definingModule(file: string, name: string, hops = 4): string | null {
  const sourceFile = parse(file);
  if (declares(sourceFile, name)) return file;
  if (hops === 0) return null;
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    const clause = statement.exportClause;
    const match =
      !clause ||
      (ts.isNamedExports(clause) && clause.elements.some((element) => element.name.text === name));
    if (!match) continue;
    const next = resolveImport(file, (statement.moduleSpecifier as ts.StringLiteral).text);
    const found = next ? definingModule(next, name, hops - 1) : null;
    if (found) return found;
  }
  return null;
}

function jsxTags(node: ts.Node, out = new Set<string>()): Set<string> {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    out.add(node.tagName.getText());
  }
  ts.forEachChild(node, (child) => void jsxTags(child, out));
  return out;
}

/** Follows the components rendered inside the shell, and the ones they render in turn. */
function mainLandmarksUnder(
  file: string,
  roots: ts.Node[],
  depth: number,
  seen: Set<string>,
): string[] {
  const sourceFile = roots[0]!.getSourceFile();
  const imported = importsOf(sourceFile);
  const found: string[] = [];
  for (const root of roots) {
    if (MAIN_LANDMARK.test(root.getText())) found.push(relative(webRoot, file));
    if (depth === 0) continue;
    for (const tag of jsxTags(root)) {
      const name = tag.split('.')[0]!;
      const specifier = imported.get(name);
      const resolved = specifier ? resolveImport(file, specifier) : null;
      const target = resolved ? definingModule(resolved, name) : null;
      if (!target || seen.has(target) || target.includes(`${SHELL}.tsx`)) continue;
      seen.add(target);
      const child = parse(target);
      found.push(...mainLandmarksUnder(target, [child], depth - 1, seen));
    }
  }
  return found;
}

interface ShellUse {
  file: string;
  children: ts.JsxElement;
}

function shellUses(): ShellUse[] {
  const uses: ShellUse[] = [];
  for (const root of ['app', 'features']) {
    for (const file of sourceFiles(resolve(webRoot, root))) {
      if (!readFileSync(file, 'utf8').includes(`<${SHELL}`)) continue;
      const visit = (node: ts.Node): void => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === SHELL) {
          uses.push({ file, children: node });
        }
        ts.forEachChild(node, visit);
      };
      visit(parse(file));
    }
  }
  return uses;
}

function countMainLandmarks(file: string): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const isMainTag = node.tagName.getText() === 'main';
      const role = node.attributes.properties.find(
        (property) => ts.isJsxAttribute(property) && property.name.getText() === 'role',
      ) as ts.JsxAttribute | undefined;
      if (isMainTag || role?.initializer?.getText() === '"main"') count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return count;
}

describe('the app shell gives assistive tech one map of the page', () => {
  const uses = shellUses();

  it('finds every route that renders inside the shell', () => {
    expect(uses.length).toBeGreaterThanOrEqual(8);
  });

  it('never nests a second main landmark inside the one the shell provides', () => {
    const offenders = uses.flatMap(({ file, children }) =>
      mainLandmarksUnder(file, [...children.children], 2, new Set()),
    );
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('gives each shell exactly one main landmark, the one the skip link targets', () => {
    for (const shell of SHELL_ROOTS) {
      expect(countMainLandmarks(resolve(webRoot, shell)), shell).toBe(1);
      expect(readFileSync(resolve(webRoot, shell), 'utf8')).toMatch(/id="main-content"/);
    }
  });

  it('names every navigation landmark the shell draws', () => {
    const unnamed: string[] = [];
    for (const dir of NAV_SOURCES) {
      for (const file of sourceFiles(dir)) {
        const visit = (node: ts.Node): void => {
          if (
            (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
            node.tagName.getText() === 'nav'
          ) {
            const named = node.attributes.properties.some(
              (property) =>
                ts.isJsxAttribute(property) &&
                ['aria-label', 'aria-labelledby'].includes(property.name.getText()),
            );
            if (!named) unnamed.push(relative(repoRoot, file));
          }
          ts.forEachChild(node, visit);
        };
        visit(parse(file));
      }
    }
    expect(unnamed).toEqual([]);
  });

  it('puts the narrow header outside the main landmark, where it reads as the page banner', () => {
    const shell = parse(resolve(webRoot, SHELL_ROOTS[0]!));
    let header: ts.JsxElement | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'header')
        header = node;
      ts.forEachChild(node, visit);
    };
    visit(shell);
    expect(header).toBeDefined();
    let ancestor: ts.Node | undefined = header?.parent;
    while (ancestor) {
      if (ts.isJsxElement(ancestor))
        expect(MAIN_LANDMARK.test(ancestor.openingElement.getText())).toBe(false);
      ancestor = ancestor.parent;
    }
  });
});
