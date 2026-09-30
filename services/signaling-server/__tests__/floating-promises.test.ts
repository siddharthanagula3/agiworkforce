import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { serviceRoot } from './websocket/harness.js';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function findUnhandledPromises(files: readonly string[]): string[] {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const findings: string[] = [];

  const isPromiseLike = (type: ts.Type, at: ts.Node): boolean => {
    if (type.isUnion()) return type.types.some((member) => isPromiseLike(member, at));
    const then = type.getProperty('then');
    if (!then) return false;
    return checker.getTypeOfSymbolAtLocation(then, at).getCallSignatures().length > 0;
  };

  const isHandled = (expression: ts.Expression): boolean => {
    if (!ts.isCallExpression(expression)) return false;
    if (!ts.isPropertyAccessExpression(expression.expression)) return false;
    const method = expression.expression.name.text;
    return method === 'catch' || (method === 'then' && expression.arguments.length >= 2);
  };

  const expectsVoid = (fn: ts.ArrowFunction | ts.FunctionExpression): boolean => {
    const contextual = checker.getContextualType(fn);
    if (!contextual) return false;
    const signatures = contextual.getNonNullableType().getCallSignatures();
    return (
      signatures.length > 0 &&
      signatures.every((signature) =>
        Boolean(checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Void),
      )
    );
  };

  const report = (file: ts.SourceFile, node: ts.Node, what: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    findings.push(`${relative(serviceRoot, file.fileName)}:${line + 1} ${what}`);
  };

  for (const file of program.getSourceFiles()) {
    if (!files.includes(file.fileName)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isExpressionStatement(node)) {
        const expression = ts.skipPartiallyEmittedExpressions(node.expression);
        const assigns =
          ts.isBinaryExpression(expression) &&
          expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
        if (
          !assigns &&
          !ts.isVoidExpression(expression) &&
          !ts.isAwaitExpression(expression) &&
          isPromiseLike(checker.getTypeAtLocation(expression), expression) &&
          !isHandled(expression)
        ) {
          report(file, node, 'discards a promise that can reject');
        }
      }
      if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && expectsVoid(node)) {
        const returned = ts.isArrowFunction(node) && !ts.isBlock(node.body) ? node.body : node;
        const asyncFunction = node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
        );
        if (
          asyncFunction ||
          (returned !== node &&
            !ts.isVoidExpression(returned) &&
            isPromiseLike(checker.getTypeAtLocation(returned), returned) &&
            !isHandled(returned as ts.Expression))
        ) {
          report(file, node, 'hands a promise to a caller that ignores it');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return findings;
}

describe('the relay never drops a rejection on the floor', () => {
  it('handles, awaits or explicitly voids every promise it starts', () => {
    const files = sourceFiles(join(serviceRoot, 'src'));
    expect(files.length).toBeGreaterThan(10);
    expect(findUnhandledPromises(files)).toEqual([]);
  }, 60_000);
});
