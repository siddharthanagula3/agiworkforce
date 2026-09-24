import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * The error factories whose message the API error boundary delivers verbatim,
 * read from the two files that decide it rather than listed here: the factory
 * table in the utils package maps each name to an error code, and the web app's
 * error handler names the codes it exposes instead of replacing with generic
 * text for the status.
 */
export function deliveredFactories(input) {
  const codeByFactory = factoryCodes(input.factorySource);
  const exposed = exposedCodes(input.handlerSource, input.denialSource);
  const delivered = new Set();
  for (const [factory, code] of codeByFactory) {
    if (
      exposed.has(code) ||
      input.factorySource.includes(`ErrorCode.${code}, message).asUserSafe`)
    ) {
      delivered.add(factory);
    }
  }
  return { delivered, codeByFactory, exposed };
}

function factoryCodes(source) {
  const sourceFile = ts.createSourceFile('errors.ts', source, ts.ScriptTarget.Latest, true);
  const codes = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'createError' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
        const match = /ErrorCode\.([A-Z_]+)/.exec(property.initializer.getText(sourceFile));
        if (match) codes.set(property.name.text, match[1]);
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return codes;
}

function exposedCodes(handlerSource, denialSource) {
  const sourceFile = ts.createSourceFile('handler.ts', handlerSource, ts.ScriptTarget.Latest, true);
  const exposed = new Set();
  let spreadsDenials = false;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'SAFE_TO_EXPOSE_CODES' &&
      node.initializer
    ) {
      const text = node.initializer.getText(sourceFile);
      for (const [, literal] of text.matchAll(/'([A-Z_]+)'/g)) exposed.add(literal);
      spreadsDenials = text.includes('DenialErrorCode');
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  if (spreadsDenials) {
    const block = /export const DenialErrorCode = \{([\s\S]*?)\n\} as const;/.exec(denialSource);
    for (const [, literal] of (block?.[1] ?? '').matchAll(/:\s*'([A-Z_]+)'/g)) exposed.add(literal);
  }
  return exposed;
}

/**
 * `caught instanceof Error ? caught.message : …` and `getErrorMessage(caught)`
 * both mean "whatever was thrown", which is a driver, a parser or a filesystem
 * talking. A branch narrowed to an error class this repository declares is
 * copy the repository wrote, so it is not flagged.
 */
function forwardsWhateverWasThrown(node, sourceFile) {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ');
  if (/getErrorMessage\s*\(/.test(text)) return true;
  if (/\binstanceof Error\s*\?/.test(text) && /\.message\b/.test(text)) return true;
  return /\bString\s*\(\s*(?:e|err|error|caught|cause|reason)\s*\)/.test(text);
}

export function findDeliveredRawMessages(source, file, delivered) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings = [];

  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      const onFactory =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'createError' &&
        delivered.has(name);
      const marked = isUserSafeChain(node, sourceFile);
      if ((onFactory || marked) && forwardsWhateverWasThrown(node.arguments[0], sourceFile)) {
        findings.push({
          file,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 120),
        });
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return findings;
}

function isUserSafeChain(node, sourceFile) {
  let parent = node.parent;
  for (let depth = 0; parent && depth < 3; depth += 1) {
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.name.text === 'asUserSafe' &&
      ts.isCallExpression(parent.parent ?? node)
    ) {
      return true;
    }
    if (!ts.isCallExpression(parent) && !ts.isPropertyAccessExpression(parent)) return false;
    parent = parent.parent;
  }
  void sourceFile;
  return false;
}
