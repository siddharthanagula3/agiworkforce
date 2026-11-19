import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ANDROID_ALERT_BUTTON_LIMIT = 3;
const ROOTS = ['src', 'app', 'components', 'hooks', 'lib', 'services', 'stores'].map((dir) =>
  path.join(__dirname, '..', dir),
);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function constListDeclaration(name: ts.Identifier): ts.VariableDeclaration | undefined {
  for (let scope: ts.Node | undefined = name.parent; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const list = statement.declarationList;
      const declaration = list.declarations.find(
        (entry) => ts.isIdentifier(entry.name) && entry.name.text === name.text,
      );
      if (!declaration) continue;
      return list.flags & ts.NodeFlags.Const ? declaration : undefined;
    }
  }
  return undefined;
}

function pushedButtons(use: ts.Identifier): number {
  const access = use.parent;
  if (
    !ts.isPropertyAccessExpression(access) ||
    access.expression !== use ||
    access.name.text !== 'push'
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const call = access.parent;
  if (!ts.isCallExpression(call) || call.expression !== access) return Number.POSITIVE_INFINITY;
  return call.arguments.reduce(
    (sum, argument) => sum + (ts.isSpreadElement(argument) ? Number.POSITIVE_INFINITY : 1),
    0,
  );
}

function namedListButtons(name: ts.Identifier): number {
  const declaration = constListDeclaration(name);
  if (!declaration?.initializer) return Number.POSITIVE_INFINITY;
  let count = maxButtons(declaration.initializer);
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      node.text === name.text &&
      node !== declaration.name &&
      node !== name
    ) {
      count += pushedButtons(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.parent.parent.parent);
  return count;
}

function maxButtons(node: ts.Expression): number {
  const expression = unwrap(node);
  if (ts.isConditionalExpression(expression)) {
    return Math.max(maxButtons(expression.whenTrue), maxButtons(expression.whenFalse));
  }
  if (ts.isIdentifier(expression)) {
    return expression.text === 'undefined' ? 0 : namedListButtons(expression);
  }
  if (!ts.isArrayLiteralExpression(expression)) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (const element of expression.elements) {
    count += ts.isSpreadElement(element) ? maxButtons(element.expression) : 1;
  }
  return count;
}

function onlyOnIos(node: ts.Node): boolean {
  let child: ts.Node = node;
  let parent = node.parent;
  while (parent) {
    if (
      ts.isIfStatement(parent) &&
      parent.thenStatement === child &&
      /^Platform\.OS\s*===\s*'ios'$/.test(parent.expression.getText())
    ) {
      return true;
    }
    child = parent;
    parent = parent.parent;
  }
  return false;
}

function oversizedAlerts(file: string): string[] {
  return oversizedAlertsIn(file, fs.readFileSync(file, 'utf8'));
}

function oversizedAlertsIn(file: string, text: string): string[] {
  if (!text.includes('Alert.alert')) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'Alert.alert' &&
      node.arguments[2] &&
      maxButtons(node.arguments[2]) > ANDROID_ALERT_BUTTON_LIMIT &&
      !onlyOnIos(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push(`${path.relative(path.join(__dirname, '..'), file)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('Android alerts', () => {
  it('never hands Alert more buttons than Android shows, so every action and Cancel stays reachable', () => {
    const offenders = ROOTS.flatMap((root) => sourceFiles(root)).flatMap(oversizedAlerts);
    expect(offenders).toEqual([]);
  });

  const BUTTON = "{ text: 'Choice' }";
  const inComponent = (body: string) =>
    oversizedAlertsIn(path.join(__dirname, 'Menu.tsx'), `function Menu() {\n${body}\n}`);

  it.each([
    [
      'a named list',
      `const buttons = [${Array(4).fill(BUTTON).join(', ')}];\nAlert.alert('Title', 'Message', buttons);`,
    ],
    [
      'a mapped list',
      "Alert.alert('Title', 'Message', options.map((option) => ({ text: option })));",
    ],
    [
      'a named list grown past the limit',
      `const buttons = [${BUTTON}];\nbuttons.push(${BUTTON}, ${BUTTON}, ${BUTTON});\nAlert.alert('Title', 'Message', buttons);`,
    ],
    [
      'a list spread into a named list',
      `const buttons = [${BUTTON}];\nbuttons.push(...more);\nAlert.alert('Title', 'Message', buttons);`,
    ],
    [
      'a list that is reassigned',
      `let buttons = [${BUTTON}];\nbuttons = more;\nAlert.alert('Title', 'Message', buttons);`,
    ],
    [
      'a list handed to other code',
      `const buttons = [${BUTTON}];\naddMore(buttons);\nAlert.alert('Title', 'Message', buttons);`,
    ],
    ['a list declared elsewhere', "Alert.alert('Title', 'Message', BUTTONS);"],
  ])('counts %s as able to exceed the limit', (_name, body) => {
    expect(inComponent(body)).toHaveLength(1);
  });

  it.each([
    [
      'a named list grown within the limit',
      `const buttons = [${BUTTON}];\nif (canManage) {\n  buttons.push(${BUTTON});\n}\nAlert.alert('Title', 'Message', buttons);`,
    ],
    [
      'an inline list within the limit',
      `Alert.alert('Title', 'Message', [${Array(3).fill(BUTTON).join(', ')}]);`,
    ],
  ])('accepts %s', (_name, body) => {
    expect(inComponent(body)).toEqual([]);
  });
});
