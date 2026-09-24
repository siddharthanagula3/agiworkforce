import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const COMPOSER_DIR = join(import.meta.dirname, '..');
const PRODUCTION_FILES = readdirSync(COMPOSER_DIR)
  .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))
  .sort();
const DYNAMIC_ICON_NAMES = new Set([
  'Icon',
  'ModeGlyph',
  'PrimaryOverflowIcon',
  'Glyph',
  'ConnectorsGlyph',
  'PluginsGlyph',
]);
const ALLOWED_CLASS_SIZES = new Set(['4', '5']);
const ALLOWED_PROP_SIZES = new Set(['16', '20']);
const DECORATIVE_FILES = new Set(['DragDropOverlay.tsx']);

function attributeExpression(attribute: ts.JsxAttribute): ts.Expression | null {
  const initializer = attribute.initializer;
  if (initializer === undefined) return null;
  if (ts.isStringLiteral(initializer)) return initializer;
  return ts.isJsxExpression(initializer) ? (initializer.expression ?? null) : null;
}

function classFragments(
  node: ts.Node,
  constants: Map<string, ts.Expression>,
  visited: Set<string> = new Set(),
): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isIdentifier(node) && constants.has(node.text) && !visited.has(node.text)) {
    return classFragments(
      constants.get(node.text) as ts.Expression,
      constants,
      new Set([...visited, node.text]),
    );
  }
  const fragments: string[] = [];
  ts.forEachChild(node, (child) => {
    fragments.push(...classFragments(child, constants, visited));
  });
  return fragments;
}

function classConstants(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return constants;
}

function iconImports(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@agiworkforce/icons'
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) names.add(element.name.text);
    }
  }
  return names;
}

describe('composer icon contract', () => {
  it('uses the owned icon family in every production composer file', () => {
    const mixed = PRODUCTION_FILES.filter((file) =>
      /from ['"]lucide-react['"]/.test(readFileSync(join(COMPOSER_DIR, file), 'utf8')),
    );
    expect(mixed).toEqual([]);
  });

  it('renders composer glyphs at 16px or 20px', () => {
    const violations: string[] = [];
    for (const file of PRODUCTION_FILES) {
      if (DECORATIVE_FILES.has(file)) continue;
      const source = readFileSync(join(COMPOSER_DIR, file), 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const imported = iconImports(sourceFile);
      const constants = classConstants(sourceFile);

      function visit(node: ts.Node): void {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
          const name = node.tagName.getText(sourceFile);
          if (imported.has(name) || DYNAMIC_ICON_NAMES.has(name)) {
            const className = node.attributes.properties.find(
              (attribute): attribute is ts.JsxAttribute =>
                ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'className',
            );
            const size = node.attributes.properties.find(
              (attribute): attribute is ts.JsxAttribute =>
                ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'size',
            );
            const classExpression = className ? attributeExpression(className) : null;
            const sizeExpression = size ? attributeExpression(size) : null;
            if (classExpression !== null) {
              const classText = classFragments(classExpression, constants).join(' ');
              const dimensions = [...classText.matchAll(/(?:^|\s)[hw]-([\d.]+)(?=\s|$)/g)].map(
                (match) => match[1] as string,
              );
              if (
                dimensions.length !== 2 ||
                dimensions.some((dimension) => !ALLOWED_CLASS_SIZES.has(dimension))
              ) {
                violations.push(
                  `${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${name} className=${classText}`,
                );
              }
            } else if (
              sizeExpression === null ||
              !ALLOWED_PROP_SIZES.has(sizeExpression.getText(sourceFile).replace(/["'`]/g, ''))
            ) {
              violations.push(
                `${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${name} has no 16px or 20px size`,
              );
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });
});
