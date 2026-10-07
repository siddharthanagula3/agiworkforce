import postcss from 'postcss';
import ts from 'typescript';

export type PublicTypographySourceFinding = {
  line: number;
  value: string;
  kind:
    | 'raw-font-size'
    | 'raw-font-shorthand'
    | 'raw-font-class'
    | 'unresolved-font-size'
    | 'unresolved-font-shorthand'
    | 'unresolved-font-class'
    | 'unresolved-inline-typography';
};

const INHERITED_SIZE = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const TOKEN_SIZE = /^var\(\s*--[a-zA-Z0-9-]+\s*\)$/;
const SIZE_KEYWORD =
  /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|math)$/i;
const LENGTH_UNIT =
  '(?:px|r?em|[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)|pt|pc|cm|mm|q|in|r?ch|r?ex|r?cap|r?ic|r?lh)';
const LENGTH = new RegExp(`(?:^|[\\s(,])[-+]?(?:\\d*\\.)?\\d+(?:%|${LENGTH_UNIT}\\b)`, 'i');
const RAW_FONT_CLASS = new RegExp(
  `(?:^|\\s)(?:[^\\s]*:)?!?text-\\[(?:length:)?[^\\]]*\\d(?:${LENGTH_UNIT}|%)[^\\]]*\\]!?`,
  'gi',
);

function shorthandKind(value: string): PublicTypographySourceFinding['kind'] | null {
  value = value.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  if (INHERITED_SIZE.test(value) || TOKEN_SIZE.test(value)) return null;
  let prefix = '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (character === '/' && depth === 0) break;
    prefix += character;
  }
  if (
    LENGTH.test(prefix) ||
    prefix.split(/\s+/).some((word) => SIZE_KEYWORD.test(word) || /^[-+]?0(?:\.0+)?$/.test(word))
  ) {
    return 'raw-font-shorthand';
  }
  if (/\b(?:calc|clamp|min|max|env)\s*\(/i.test(prefix)) return 'raw-font-shorthand';
  return /\bvar\(\s*--[a-zA-Z0-9-]+\s*\)/.test(prefix) ? null : 'unresolved-font-shorthand';
}

export function scanPublicStylesheetTypography(
  source: string,
  filename: string,
): PublicTypographySourceFinding[] {
  const findings: PublicTypographySourceFinding[] = [];
  postcss.parse(source, { from: filename }).walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    const value = declaration.value.trim();
    if (property === 'font-size' && !INHERITED_SIZE.test(value) && !TOKEN_SIZE.test(value)) {
      findings.push({ line: declaration.source?.start?.line ?? 1, value, kind: 'raw-font-size' });
    }
    if (property === 'font') {
      const kind = shorthandKind(value);
      if (kind) findings.push({ line: declaration.source?.start?.line ?? 1, value, kind });
    }
  });
  return findings;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.expression;
  return node;
}

function bindingContains(name: ts.BindingName, identifier: string): boolean {
  return ts.isIdentifier(name)
    ? name.text === identifier
    : name.elements.some(
        (element) => ts.isBindingElement(element) && bindingContains(element.name, identifier),
      );
}

function localInitializer(node: ts.Identifier): ts.Expression | null | undefined {
  for (let scope: ts.Node | undefined = node.parent; scope; scope = scope.parent) {
    if (
      ts.isFunctionLike(scope) &&
      scope.parameters.some((parameter) => bindingContains(parameter.name, node.text))
    )
      return null;
    if (
      ts.isCatchClause(scope) &&
      scope.variableDeclaration &&
      bindingContains(scope.variableDeclaration.name, node.text)
    )
      return null;
    if (
      (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer) &&
      scope.initializer.declarations.some((declaration) =>
        bindingContains(declaration.name, node.text),
      )
    )
      return null;
    if (!ts.isSourceFile(scope) && !ts.isBlock(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!bindingContains(declaration.name, node.text)) continue;
          return ts.isIdentifier(declaration.name) &&
            (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
            ? (declaration.initializer ?? null)
            : null;
        }
      }
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === node.text) return null;
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        if (statement.importClause.name?.text === node.text) return null;
        const bindings = statement.importClause.namedBindings;
        if (
          bindings &&
          (ts.isNamespaceImport(bindings)
            ? bindings.name.text === node.text
            : bindings.elements.some((element) => element.name.text === node.text))
        )
          return null;
      }
    }
  }
  return undefined;
}

function staticExpression(node: ts.Expression, seen = new Set<ts.Node>()): ts.Expression | null {
  node = unwrap(node);
  if (seen.has(node)) return null;
  seen.add(node);
  if (ts.isIdentifier(node)) {
    const initializer = localInitializer(node);
    if (node.text === 'undefined' && initializer === undefined) return node;
    return initializer ? staticExpression(initializer, seen) : null;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const owner = staticExpression(node.expression, seen);
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : null;
    if (!owner || !key || !ts.isObjectLiteralExpression(owner)) return null;
    const member = owner.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === key,
    );
    return member ? staticExpression(member.initializer, seen) : null;
  }
  return node;
}

function staticText(node: ts.Expression, seen = new Set<ts.Node>()): string | null {
  const expression = staticExpression(node, seen);
  if (!expression) return null;
  if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) return expression.text;
  if (
    ts.isPrefixUnaryExpression(expression) &&
    [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(expression.operator)
  ) {
    const operand = staticExpression(expression.operand, seen);
    return operand && ts.isNumericLiteral(operand)
      ? (expression.operator === ts.SyntaxKind.MinusToken ? '-' : '+') + operand.text
      : null;
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticText(expression.left, new Set(seen));
    const right = staticText(expression.right, new Set(seen));
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const text = staticText(span.expression, new Set(seen));
      if (text === null) return null;
      value += text + span.literal.text;
    }
    return value;
  }
  return null;
}

export function scanPublicComponentTypography(
  source: string,
  filename: string,
): PublicTypographySourceFinding[] {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics.length > 0) throw new Error(`Cannot parse typography source: ${filename}`);
  const findings: PublicTypographySourceFinding[] = [];
  const visitedClasses = new WeakMap<ts.Node, number>();
  const visitedStyles = new WeakSet<ts.Node>();
  const findingKeys = new Set<string>();
  const line = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const add = (
    node: ts.Node,
    kind: PublicTypographySourceFinding['kind'],
    value = node.getText(file),
  ) => {
    const key = `${node.pos}:${kind}:${value}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({ line: line(node), value, kind });
  };
  const literalClass = (node: ts.Node, value: string) => {
    for (const match of value.matchAll(RAW_FONT_CLASS))
      add(node, 'raw-font-class', match[0].trim());
  };
  const classText = (input: ts.Expression, variants = false) => {
    const node = unwrap(input);
    const mode = variants ? 2 : 1;
    const visited = visitedClasses.get(node) ?? 0;
    if (visited & mode) return;
    visitedClasses.set(node, visited | mode);
    if (
      ts.isTemplateExpression(node) ||
      (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    ) {
      const text = staticText(node);
      if (text !== null) {
        literalClass(node, text);
        return;
      }
    }
    if (ts.isStringLiteralLike(node)) {
      literalClass(node, node.text);
      return;
    }
    if (ts.isIdentifier(node) && node.text === 'undefined' && localInitializer(node) === undefined)
      return;
    if (
      ts.isIdentifier(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const resolved = staticExpression(node);
      if (resolved) classText(resolved, variants);
      else add(node, 'unresolved-font-class');
      return;
    }
    if (ts.isTemplateExpression(node)) {
      literalClass(node.head, node.head.text);
      for (const span of node.templateSpans) {
        classText(span.expression, variants);
        literalClass(span.literal, span.literal.text);
      }
      return;
    }
    if (ts.isConditionalExpression(node)) {
      classText(node.whenTrue, variants);
      classText(node.whenFalse, variants);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken)
        classText(node.left, variants);
      classText(node.right, variants);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['cn', 'clsx', 'cva'].includes(node.expression.text)
    ) {
      node.arguments.forEach((argument, index) =>
        classText(argument, node.expression.getText(file) === 'cva' && index > 0),
      );
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element) => classText(element, variants));
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          if (ts.isStringLiteralLike(property.name))
            literalClass(property.name, property.name.text);
          if (variants) classText(property.initializer, true);
          else if (ts.isComputedPropertyName(property.name)) classText(property.name.expression);
        } else if (ts.isSpreadAssignment(property)) classText(property.expression, variants);
      }
      return;
    }
    if (
      ts.isNumericLiteral(node) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
        node.kind,
      )
    )
      return;
    add(node, 'unresolved-font-class');
  };
  const fontValue = (input: ts.Expression, shorthand: boolean) => {
    const node = staticExpression(input);
    if (
      node &&
      (node.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isIdentifier(node) &&
          node.text === 'undefined' &&
          localInitializer(node) === undefined))
    )
      return;
    const text = staticText(input);
    if (text !== null) {
      const kind = shorthand
        ? shorthandKind(text)
        : INHERITED_SIZE.test(text) || TOKEN_SIZE.test(text)
          ? null
          : 'raw-font-size';
      if (kind) add(input, kind, text);
      return;
    }
    if (node && ts.isConditionalExpression(node)) {
      fontValue(node.whenTrue, shorthand);
      fontValue(node.whenFalse, shorthand);
      return;
    }
    add(input, shorthand ? 'unresolved-font-shorthand' : 'unresolved-font-size');
  };
  const inlineStyle = (input: ts.Expression) => {
    const node = staticExpression(input);
    if (
      node &&
      (node.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isIdentifier(node) &&
          node.text === 'undefined' &&
          localInitializer(node) === undefined))
    )
      return;
    if (!node) {
      add(input, 'unresolved-inline-typography');
      return;
    }
    if (visitedStyles.has(node)) return;
    visitedStyles.add(node);
    if (ts.isConditionalExpression(node)) {
      inlineStyle(node.whenTrue);
      inlineStyle(node.whenFalse);
      return;
    }
    if (!ts.isObjectLiteralExpression(node)) {
      add(input, 'unresolved-inline-typography');
      return;
    }
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        inlineStyle(property.expression);
        continue;
      }
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
        continue;
      if (
        (!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name)) ||
        !['fontSize', 'font'].includes(property.name.text)
      )
        continue;
      fontValue(
        ts.isPropertyAssignment(property) ? property.initializer : property.name,
        property.name.text === 'font',
      );
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const initializer = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (initializer) {
        if (node.name.getText(file) === 'className') classText(initializer);
        if (node.name.getText(file) === 'style') inlineStyle(initializer);
        if (['fontSize', 'font-size'].includes(node.name.getText(file)))
          fontValue(initializer, false);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['cn', 'clsx', 'cva'].includes(node.expression.text)
    )
      classText(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return findings;
}
