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

  function visit(node) {
    if (ts.isCallExpression(node) && isUserVisibleSink(node.expression, sourceFile)) {
      const rawArgument = node.arguments.find((argument) =>
        containsUnsanitizedMessage(argument, sourceFile),
      );
      if (rawArgument) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        results.push({
          file,
          line,
          text: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 120),
        });
      }
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
