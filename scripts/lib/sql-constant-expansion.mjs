import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function resolveLiteralModule(repoRoot, fromFile, specifier) {
  const base = specifier.startsWith('@/')
    ? path.join(repoRoot, 'apps/web', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    const relative = path.relative(repoRoot, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

function exportedLiteral(ts, file, name) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  if (source.parseDiagnostics.length) return null;
  const matches = source.statements.flatMap((statement) => {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    )
      return [];
    return statement.declarationList.declarations.filter(
      (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
    );
  });
  return matches.length === 1 ? matches[0].initializer : null;
}

export function sqlPredicateCode(sql) {
  if (sql === null || /;|--|\/\*|\*\/|\\|"|\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql)) return null;
  const code = sql.replace(/'(?:[^']|'')*'/g, ' ').toLowerCase();
  return code.includes("'") ? null : code;
}

export function scopingInterpolations(sql, lower) {
  const names = [];
  const start = lower.search(/\b(?:where|on\s+conflict)\b/);
  if (start >= 0) {
    const tail = lower.slice(start).search(/\b(?:returning|order\s+by|group\s+by|limit)\b/);
    const end = tail < 0 ? lower.length : start + tail;
    for (const m of sql.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)/g)) {
      if (m.index >= start && m.index < end) names.push(m[1]);
    }
  }
  for (const m of sql.matchAll(
    /insert\s+into\s+(?:public\.)?[a-z_]+\s*\(\s*\$\{\s*([A-Za-z_$][\w$]*)/gi,
  )) {
    names.push(m[1]);
  }
  return names;
}

function localStringTemplates(file, { repoRoot = null, importConstants = false } = {}) {
  const ts = createRequire(import.meta.url)('typescript');
  const program = ts.createProgram([file], {
    noResolve: true,
    noLib: true,
    types: [],
    allowJs: true,
    target: ts.ScriptTarget.Latest,
    jsx: ts.JsxEmit.Preserve,
  });
  const source = program.getSourceFile(file);
  if (!source || source.parseDiagnostics.length) return null;
  const checker = program.getTypeChecker();
  const templates = new Map();
  const visit = (node) => {
    if (ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent)) {
      templates.set(node.getStart(source), node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const literalValue = (expression) => {
    if (!ts.isIdentifier(expression)) return null;
    const declarations = checker.getSymbolAtLocation(expression)?.declarations;
    if (declarations?.length !== 1) return null;
    const declaration = declarations[0];
    let value;
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.getSourceFile() === source &&
      ts.isVariableDeclarationList(declaration.parent) &&
      declaration.parent.flags & ts.NodeFlags.Const
    ) {
      value = declaration.initializer;
    } else if (
      importConstants &&
      repoRoot &&
      ts.isImportSpecifier(declaration) &&
      !declaration.isTypeOnly &&
      !declaration.parent.parent.isTypeOnly
    ) {
      const imported = declaration.parent.parent.parent;
      if (ts.isImportDeclaration(imported) && ts.isStringLiteral(imported.moduleSpecifier)) {
        const target = resolveLiteralModule(repoRoot, file, imported.moduleSpecifier.text);
        if (target)
          value = exportedLiteral(
            ts,
            target,
            declaration.propertyName?.text ?? declaration.name.text,
          );
      }
    }
    if (!value || (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)))
      return null;
    return value.text;
  };
  return { source, templates, literalValue };
}

export function staticTemplatePrefixes(file) {
  const context = localStringTemplates(file);
  if (!context) return [];
  const prefixes = [];
  for (const template of context.templates.values()) {
    let prefix = template.head.text;
    for (const span of template.templateSpans) {
      const value = context.literalValue(span.expression);
      if (value === null) break;
      prefix += value + span.literal.text;
    }
    if (prefix) prefixes.push(prefix);
  }
  return prefixes;
}

export function localSqlConstantExpansion(file, options = {}) {
  const context = localStringTemplates(file, options);
  if (!context) return () => null;
  const { source, templates, literalValue } = context;
  return (sql, index) => {
    const template = templates.get(index);
    if (!template || template.end - index !== sql.length + 2) return null;
    const names = new Set(scopingInterpolations(sql, sql.toLowerCase()));
    const replacements = [];
    for (const span of template.templateSpans) {
      if (!names.has(span.expression.text)) continue;
      const value = literalValue(span.expression);
      if (value === null) continue;
      const start = source.text.lastIndexOf('${', span.expression.getStart(source));
      const end = source.text.indexOf('}', span.expression.end) + 1;
      if (source.text.slice(start, end).replace(/\s/g, '') !== '${' + span.expression.text + '}')
        continue;
      replacements.push({ start: start - index - 1, end: end - index - 1, value });
    }
    if (!replacements.length) return null;
    let expanded = sql;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
      expanded =
        expanded.slice(0, replacement.start) + replacement.value + expanded.slice(replacement.end);
    }
    return expanded.includes('${') ? null : expanded;
  };
}
