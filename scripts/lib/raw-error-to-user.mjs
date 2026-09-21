import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * Sinks whose argument is rendered to a person, so a raw exception message
 * reaching one of them puts the browser's own wording on screen: "Failed to
 * fetch" in Chrome, "Load failed" in Safari. Neither names a condition nor
 * suggests an action.
 */
export const USER_VISIBLE_SINKS = [
  'setError',
  'setChatError',
  'setSaveError',
  'setLoadError',
  'setListError',
  'toast.error',
  'toast.warning',
];

const SINK_ALTERNATION = USER_VISIBLE_SINKS.map((s) => s.replace('.', '\\.')).join('|');

/**
 * `sink(err instanceof Error ? err.message : ...)` - the shape that forwards a
 * caught value's own message straight to a person. `toUserMessage` exists for
 * this; the check is that it was used.
 */
const RAW_TO_SINK = new RegExp(`^(?:${SINK_ALTERNATION})$`);

/**
 * The other shape a raw exception reaches a reader in: not a call at all, but
 * a field on a result object the transcript renders. A tool result carrying
 * `isError` is shown as a card with its `content` verbatim, so a driver
 * message, an internal hostname or a stack fragment lands in the conversation
 * the same way a `setError` would. The walker only visited call expressions,
 * which is why the baseline read clean while this class of leak existed.
 */
const USER_VISIBLE_RESULT_FIELDS = new Set(['content', 'message', 'text', 'summary', 'detail']);
const RESULT_IS_ERROR_MARKER = 'isError';

/**
 * Only the interpolated form. `content: err.message` on a narrowed
 * `ConnectorCredentialError` is copy this repo wrote and a reader is meant to
 * read; `content: `Tool ${name} failed: ${err.message}`` is prose wrapped
 * around whatever an SDK, driver or sandbox threw, which is the shape that put
 * stack fragments and absolute paths in a transcript. Flagging both would
 * price the check out of the build for no leak found.
 */
function interpolatesIntoProse(node) {
  if (ts.isTemplateExpression(node)) return true;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return true;
  }
  return false;
}

function declaresErrorMarker(objectLiteral) {
  return objectLiteral.properties.some(
    (property) =>
      property.name !== undefined &&
      ts.isIdentifier(property.name) &&
      property.name.text === RESULT_IS_ERROR_MARKER,
  );
}

function callName(expression, sourceFile) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.getText(sourceFile);
  return '';
}

function isUserVisibleSink(expression, sourceFile) {
  const name = callName(expression, sourceFile);
  return RAW_TO_SINK.test(name) || /^set[A-Z][A-Za-z0-9]*$/.test(name);
}

function containsUnsanitizedMessage(node, sourceFile) {
  if (
    ts.isCallExpression(node) &&
    /^(?:toUserMessage|toUserMessageWithStatus)$/.test(callName(node.expression, sourceFile))
  ) {
    return false;
  }
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') {
    const owner = node.expression.getText(sourceFile).split('.').at(-1) ?? '';
    if (/^(?:e|err|error|caught|cause|reason)$/i.test(owner) || /Error$/.test(owner)) return true;
  }
  return node
    .getChildren(sourceFile)
    .some((child) => containsUnsanitizedMessage(child, sourceFile));
}

export function findRawErrorSinks(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const results = [];

  function record(node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    results.push({
      file,
      line,
      text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 120),
    });
  }

  function visit(node) {
    if (ts.isObjectLiteralExpression(node) && declaresErrorMarker(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (!ts.isIdentifier(property.name)) continue;
        if (!USER_VISIBLE_RESULT_FIELDS.has(property.name.text)) continue;
        if (!interpolatesIntoProse(property.initializer)) continue;
        if (containsUnsanitizedMessage(property.initializer, sourceFile)) record(property);
      }
    }
    if (ts.isCallExpression(node) && isUserVisibleSink(node.expression, sourceFile)) {
      const rawArgument = node.arguments.find((argument) =>
        containsUnsanitizedMessage(argument, sourceFile),
      );
      if (rawArgument) record(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

export function countByFile(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.file] = (counts[finding.file] ?? 0) + 1;
  return counts;
}

export function checkAgainstBaseline(counts, baseline) {
  const errors = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline.perFile?.[file] ?? 0;
    if (count > allowed) {
      errors.push(`${file}: ${count} raw error message(s) reaching a user (baseline ${allowed})`);
    }
  }
  return errors;
}
