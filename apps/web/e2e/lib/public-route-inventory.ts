import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';
import { INSPIRATION, inspirationPath } from '../../app/gallery/inspiration';
import { RELEASES, releasePath } from '../../lib/changelog-entries';
import {
  archivedPolicyText,
  archivedVersionHref,
  policyHistories,
  policyHistoryHref,
} from '../../lib/legal/policy-archive';
import { helpArticlePath } from '../../lib/support/help-paths';
import {
  KNOWN_DEVICE_TYPES,
  isKnownDeviceType,
} from '../../app/connect/[deviceType]/connect-client';

const WEB_ROOT = path.resolve(__dirname, '../..');
const APP_DIRECTORY = path.join(WEB_ROOT, 'app');
const PAGE_FILE = /^page\.(?:tsx?|jsx?)$/;
export const PUBLIC_PAGE_TYPES = ['marketing', 'docs', 'legal', 'utility'] as const;
export type PublicPageType = (typeof PUBLIC_PAGE_TYPES)[number];
export type ExpectedPublicHttpStatuses = readonly [number, ...number[]] | null;
export type PublicRouteOwnership =
  | 'public-layout'
  | 'lead-account-mechanics'
  | 'lead-form-mechanics'
  | 'lead-home-page'
  | 'public-layout-lead-pricing-logic'
  | 'lead-archive-publication';

export interface PublicPageSource {
  pattern: string;
  file: string;
  relativeFile: string;
  parallelSlot: boolean;
  disposition: 'render' | 'redirect-only' | 'not-found-only';
}

export interface ExcludedPublicPage extends PublicPageSource {
  reason: 'protected' | 'auth' | 'dev' | 'api' | 'redirect-only';
}

export interface PublicRouteCase {
  route: string;
  path: string;
  pattern: string;
  kind: 'fixed' | 'generated';
  sourceFiles: string[];
  dataSource?: string;
  pageType: PublicPageType;
  expectedHttpStatuses: ExpectedPublicHttpStatuses;
  expectedFinalPath: string | null;
  ownership: PublicRouteOwnership;
  context: 'signed-out';
  unresolvedFlags: string[];
}

export interface PublicRouteStateInput {
  pattern: string;
  path: string | null;
  state: string;
  expectedHttpStatuses: ExpectedPublicHttpStatuses;
  dataAccess: 'handler-guarded' | 'unverified' | 'fixture-required';
  source: string;
  pageType?: PublicPageType;
  expectedFinalPath?: string | null;
  ownership?: PublicRouteOwnership;
  context?: 'signed-out';
  unresolvedFlags?: string[];
  expectedNotFoundUi?: boolean;
  expectedRobots?: 'noindex' | null;
}

export interface PublicRouteStateSample extends PublicRouteStateInput {
  route: string;
  pageType: PublicPageType;
  expectedFinalPath: string | null;
  ownership: PublicRouteOwnership;
  context: 'signed-out';
  unresolvedFlags: string[];
  expectedNotFoundUi: boolean;
  expectedRobots: 'noindex' | null;
}

export interface UnresolvedPublicRoute {
  pattern: string;
  sourceFiles: string[];
  reason: string;
  stateSamples: PublicRouteStateInput[];
}

export interface PublicRouteInventory {
  fixedRoutes: PublicRouteCase[];
  generatedRoutes: PublicRouteCase[];
  routes: PublicRouteCase[];
  patterns: string[];
  unresolvedDynamic: UnresolvedPublicRoute[];
  unavailableDynamic: UnresolvedPublicRoute[];
  excludedPages: ExcludedPublicPage[];
  stateSamples: PublicRouteStateSample[];
}

export interface PublicRouteInventoryOptions {
  appDirectory?: string;
  supportDirectory?: string;
  corpusFile?: string;
  stateSamples?: readonly PublicRouteStateInput[];
}

interface CorpusDocument {
  id: string;
  source: string;
  chunks: unknown[];
}

interface CorpusData {
  documentCount: number;
  documents: CorpusDocument[];
}

function assertExpectedHttpStatuses(
  statuses: unknown,
  route: string,
): asserts statuses is ExpectedPublicHttpStatuses {
  if (statuses === null) return;
  if (
    !Array.isArray(statuses) ||
    statuses.length === 0 ||
    statuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599) ||
    new Set(statuses).size !== statuses.length
  ) {
    throw new Error(`Invalid expected HTTP statuses for public route ${route}`);
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compare);
}

function sourceFile(file: string): ts.SourceFile {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics.length) {
    const messages = diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );
    throw new Error(`Cannot parse route inventory source ${file}: ${messages.join('; ')}`);
  }
  return source;
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function variable(source: ts.SourceFile, name: string): ts.Expression {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return unwrap(declaration.initializer);
      }
    }
  }
  throw new Error(`Missing canonical ${name} in ${source.fileName}`);
}

function functionDeclaration(source: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (!declaration) throw new Error(`Missing canonical ${name} in ${source.fileName}`);
  return declaration;
}

function signature(node: ts.Node, source: ts.SourceFile): unknown[] {
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    children.push(signature(child, source));
  });
  const literal =
    ts.isIdentifier(node) ||
    ts.isStringLiteralLike(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
      ? node.text
      : ts.isNumericLiteral(node) || ts.isRegularExpressionLiteral(node)
        ? node.getText(source)
        : null;
  return [node.kind, literal, children];
}

function assertExpression(source: ts.SourceFile, actual: ts.Expression, expected: string): void {
  const reference = ts.createSourceFile(
    'route-expression.ts',
    `const value = ${expected};`,
    ts.ScriptTarget.Latest,
    true,
  );
  if (
    JSON.stringify(signature(actual, source)) !==
    JSON.stringify(signature(variable(reference, 'value'), reference))
  ) {
    throw new Error(`Canonical route projection changed in ${source.fileName}`);
  }
}

function assertParameterProjection(source: ts.SourceFile, expected: string): void {
  const declaration = functionDeclaration(source, 'generateStaticParams');
  const statement = declaration.body?.statements[0];
  if (
    declaration.body?.statements.length !== 1 ||
    !statement ||
    !ts.isReturnStatement(statement) ||
    !statement.expression
  ) {
    throw new Error(`Cannot safely read generateStaticParams in ${source.fileName}`);
  }
  assertExpression(source, statement.expression, expected);
}

function defaultBody(source: ts.SourceFile): ts.Block | undefined {
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement.body;
    }
    if (ts.isExportAssignment(statement)) {
      const expression = unwrap(statement.expression);
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        return ts.isBlock(expression.body) ? expression.body : undefined;
      }
      if (ts.isIdentifier(expression)) {
        const declaration = source.statements.find(
          (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === expression.text,
        );
        if (declaration) return declaration.body;
      }
    }
  }
  return undefined;
}

function terminalNavigation(source: ts.SourceFile): 'redirect-only' | 'not-found-only' | 'render' {
  const names = new Map<string, string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'next/navigation' ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      names.set(element.name.text, (element.propertyName ?? element.name).text);
    }
  }
  const body = defaultBody(source);
  if (body?.statements.length !== 1) return 'render';
  const statement = body.statements[0];
  if (!statement) return 'render';
  const expression =
    ts.isExpressionStatement(statement) || ts.isReturnStatement(statement)
      ? statement.expression
      : undefined;
  if (!expression || !ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return 'render';
  }
  const name = names.get(expression.expression.text);
  return name === 'notFound'
    ? 'not-found-only'
    : name === 'redirect' || name === 'permanentRedirect'
      ? 'redirect-only'
      : 'render';
}

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => compare(a.name, b.name))
    .flatMap((entry) => {
      if (entry.name.startsWith('_') || ['node_modules', '.next'].includes(entry.name)) return [];
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? pageFiles(file) : PAGE_FILE.test(entry.name) ? [file] : [];
    });
}

function normalizePagePattern(relativeFile: string): string {
  const segments = relativeFile.split('/').slice(0, -1);
  if (segments.some((segment) => segment.startsWith('(.'))) {
    throw new Error(`Intercepted route needs explicit state coverage: ${relativeFile}`);
  }
  return (
    '/' +
    segments.filter((segment) => !/^\(.+\)$/.test(segment) && !segment.startsWith('@')).join('/')
  );
}

export function enumeratePublicPages(appDirectory = APP_DIRECTORY): {
  publicPages: PublicPageSource[];
  excludedPages: ExcludedPublicPage[];
} {
  const publicPages: PublicPageSource[] = [];
  const excludedPages: ExcludedPublicPage[] = [];
  for (const file of pageFiles(appDirectory)) {
    const relativeFile = path.relative(appDirectory, file).split(path.sep).join('/');
    const pattern = normalizePagePattern(relativeFile);
    const disposition = terminalNavigation(sourceFile(file));
    const record: PublicPageSource = {
      pattern,
      file,
      relativeFile,
      parallelSlot: relativeFile.split('/').some((segment) => segment.startsWith('@')),
      disposition,
    };
    const first = pattern.split('/')[1];
    const reason = isProductPath(pattern)
      ? 'protected'
      : isAuthPath(pattern)
        ? 'auth'
        : first === 'dev'
          ? 'dev'
          : first === 'api' || first === '.well-known'
            ? 'api'
            : disposition === 'redirect-only'
              ? 'redirect-only'
              : null;
    if (reason) excludedPages.push({ ...record, reason });
    else publicPages.push(record);
  }
  const primary = new Set<string>();
  for (const record of publicPages.filter((record) => !record.parallelSlot)) {
    if (primary.has(record.pattern))
      throw new Error(`Conflicting App Router pages for ${record.pattern}`);
    primary.add(record.pattern);
  }
  publicPages.sort(
    (a, b) => compare(a.pattern, b.pattern) || compare(a.relativeFile, b.relativeFile),
  );
  excludedPages.sort(
    (a, b) => compare(a.pattern, b.pattern) || compare(a.relativeFile, b.relativeFile),
  );
  return { publicPages, excludedPages };
}

function policyRoutePaths(): string[] {
  const source = sourceFile(path.join(WEB_ROOT, 'lib/legal-constants.ts'));
  const expression = variable(source, 'CANONICAL_POLICY_ROUTES');
  if (!ts.isObjectLiteralExpression(expression))
    throw new Error('Canonical policy routes are not a static object');
  return expression.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer)) {
      throw new Error('A canonical policy path is not statically readable');
    }
    return property.initializer.text;
  });
}

function pageContext(
  page: PublicPageSource,
  legalPaths: string[],
): {
  pageType: PublicPageType;
  ownership: PublicRouteOwnership;
  unresolvedFlags: string[];
  expectedHttpStatuses: ExpectedPublicHttpStatuses;
  expectedFinalPath: string | null;
} {
  const source = sourceFile(page.file);
  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) =>
      ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '',
    );
  const docs = ['docs', 'help', 'api-docs'].includes(page.pattern.split('/')[1] ?? '');
  const legal = legalPaths.some(
    (route) => page.pattern === route || page.pattern.startsWith(route + '/'),
  );
  const account = imports.some((specifier) => specifier.includes('/features/auth/'));
  let noIndex = false;
  let queryDependent = false;
  let navigation = false;
  visit(source, (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'index' &&
      node.initializer.kind === ts.SyntaxKind.FalseKeyword
    )
      noIndex = true;
    if (ts.isIdentifier(node) && node.text === 'searchParams') queryDependent = true;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['redirect', 'permanentRedirect', 'forbidden', 'unauthorized'].includes(node.expression.text)
    )
      navigation = true;
  });
  const serverData = imports.some(
    (specifier) => specifier.includes('/server/') || specifier.includes('/server'),
  );
  const pageType: PublicPageType = docs
    ? 'docs'
    : legal
      ? 'legal'
      : account || noIndex
        ? 'utility'
        : 'marketing';
  const ownership: PublicRouteOwnership =
    page.relativeFile === 'page.tsx'
      ? 'lead-home-page'
      : page.relativeFile === 'pricing/page.tsx'
        ? 'public-layout-lead-pricing-logic'
        : page.relativeFile.startsWith('legal/archive/')
          ? 'lead-archive-publication'
          : account
            ? 'lead-account-mechanics'
            : [
                  'privacy/requests/',
                  'copyright/report/',
                  'contact/',
                  'contact-sales/',
                  'waitlist/',
                  'beta/',
                ].some((prefix) => page.relativeFile.startsWith(prefix))
              ? 'lead-form-mechanics'
              : 'public-layout';
  const unresolvedFlags = [
    ...(queryDependent ? ['query-dependent-state'] : []),
    ...(serverData ? ['server-data-dependent-state'] : []),
    ...(navigation ? ['conditional-navigation'] : []),
    ...(page.parallelSlot ? ['parallel-slot-hard-navigation-state'] : []),
    ...(page.disposition === 'not-found-only' ? ['not-found-http-streaming-context'] : []),
  ];
  return {
    pageType,
    ownership,
    unresolvedFlags,
    expectedHttpStatuses:
      navigation || serverData || page.disposition === 'not-found-only' ? null : [200],
    expectedFinalPath: navigation ? null : page.pattern,
  };
}

function sourceIdentity(file: string): string {
  const { dev, ino, size, mtimeNs, ctimeNs } = statSync(file, { bigint: true });
  return [dev, ino, size, mtimeNs, ctimeNs].map(String).join(':');
}

function stableSource(file: string): { text: string; identity: string } {
  const identity = sourceIdentity(file);
  const text = readFileSync(file, 'utf8');
  if (identity !== sourceIdentity(file))
    throw new Error('Support sources changed during validation');
  return { text, identity };
}

function supportSourceSnapshot(supportDirectory: string, corpusFile: string) {
  const directoryIdentity = sourceIdentity(supportDirectory);
  const files = [
    corpusFile,
    path.join(WEB_ROOT, 'scripts/build-support-corpus.mjs'),
    path.join(WEB_ROOT, 'scripts/lib/support-frontmatter.mjs'),
    ...readdirSync(supportDirectory)
      .filter((name) => name.endsWith('.md'))
      .sort(compare)
      .map((name) => path.join(supportDirectory, name)),
  ];
  const sources = Object.fromEntries(files.map((file) => [file, stableSource(file)]));
  if (directoryIdentity !== sourceIdentity(supportDirectory))
    throw new Error('Support sources changed during validation');
  return { directoryIdentity, sources };
}

export function getHelpArticleRoutePaths({
  supportDirectory = path.join(WEB_ROOT, 'content/support'),
  corpusFile = path.join(WEB_ROOT, 'lib/support/agent/corpus.generated.json'),
}: Pick<PublicRouteInventoryOptions, 'supportDirectory' | 'corpusFile'> = {}): string[] {
  const before = supportSourceSnapshot(supportDirectory, corpusFile);
  let checkerFailure: unknown;
  try {
    execFileSync(
      process.execPath,
      [
        path.join(WEB_ROOT, 'scripts/build-support-corpus.mjs'),
        '--check',
        '--content',
        supportDirectory,
        '--out',
        corpusFile,
      ],
      { env: { NODE_ENV: 'test' }, stdio: 'pipe' },
    );
  } catch (error) {
    checkerFailure = error;
  }
  const after = supportSourceSnapshot(supportDirectory, corpusFile);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Support sources changed during validation');
  if (checkerFailure) {
    const detail =
      checkerFailure instanceof Error ? checkerFailure.message : String(checkerFailure);
    throw new Error(
      `Support corpus disagrees with canonical Markdown; run build:support-corpus. ${detail}`,
    );
  }
  const raw: unknown = JSON.parse(before.sources[corpusFile]!.text);
  const corpus = raw as CorpusData;
  const ids = corpus.documents.map((document) => document.id);
  if (
    corpus.documentCount !== ids.length ||
    new Set(ids).size !== ids.length ||
    corpus.documents.some((document) => !document.chunks.length)
  ) {
    throw new Error('Support corpus route IDs/counts are inconsistent');
  }
  return ids.map(helpArticlePath).sort(compare);
}

function routePathExpression(source: ts.SourceFile): ts.Expression {
  const declaration = functionDeclaration(source, 'generateMetadata');
  const candidates: ts.Expression[] = [];
  visit(declaration, (node) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'buildMetadata'
    )
      return;
    const argument = node.arguments[0];
    if (!argument || !ts.isObjectLiteralExpression(argument)) return;
    for (const property of argument.properties) {
      if (ts.isPropertyAssignment(property) && property.name.getText(source) === 'path') {
        candidates.push(property.initializer);
      }
    }
  });
  const candidate = candidates[0];
  if (candidates.length !== 1 || !candidate)
    throw new Error(`No unique metadata route path in ${source.fileName}`);
  return candidate;
}

function projectUseCasePath(node: ts.Expression, source: ts.SourceFile, slug: string): string {
  node = unwrap(node);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans
        .map((span) => {
          const expression = unwrap(span.expression);
          if (
            !ts.isPropertyAccessExpression(expression) ||
            !ts.isIdentifier(expression.expression) ||
            expression.expression.text !== 'entry' ||
            expression.name.text !== 'slug'
          ) {
            throw new Error(`Unsupported use-case route path in ${source.fileName}`);
          }
          return slug + span.literal.text;
        })
        .join('')
    );
  }
  throw new Error(`Unsupported use-case route path in ${source.fileName}`);
}

function getUseCaseRoutes(page: PublicPageSource): string[] {
  const source = sourceFile(page.file);
  assertParameterProjection(source, 'USE_CASE_SLUGS.map((slug) => ({ slug }))');
  const owner = sourceFile(
    path.join(WEB_ROOT, 'features/marketing/components/pages/business/use-cases-content.ts'),
  );
  assertExpression(owner, variable(owner, 'USE_CASE_SLUGS'), 'Object.keys(USE_CASE_CONTENT)');
  const content = variable(owner, 'USE_CASE_CONTENT');
  if (!ts.isObjectLiteralExpression(content))
    throw new Error('Use-case content has no static keys');
  const slugs = content.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      throw new Error('Use-case route keys are not static');
    }
    const key =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : null;
    const entry = unwrap(property.initializer);
    if (!key || !ts.isObjectLiteralExpression(entry))
      throw new Error('Use-case route entry is not static');
    const slug = entry.properties.find(
      (child): child is ts.PropertyAssignment =>
        ts.isPropertyAssignment(child) && child.name.getText(owner) === 'slug',
    );
    if (!slug || !ts.isStringLiteralLike(slug.initializer) || slug.initializer.text !== key) {
      throw new Error('Use-case key and entry.slug disagree');
    }
    return key;
  });
  const expression = routePathExpression(source);
  return slugs.map((slug) => projectUseCasePath(expression, source, slug));
}

function regexFromSource(file: string, name: string): RegExp {
  const source = sourceFile(file);
  const expression = variable(source, name);
  if (!ts.isRegularExpressionLiteral(expression))
    throw new Error(`No static ${name} token validator in ${file}`);
  const literal = expression.getText(source);
  const end = literal.lastIndexOf('/');
  return new RegExp(literal.slice(1, end), literal.slice(end + 1));
}

export function routeMatchesPattern(pattern: string, route: string): boolean {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const segments = pattern.split('/').filter(Boolean);
  const expression = segments
    .map((segment) =>
      /^\[\[\.\.\./.test(segment)
        ? '(?:/.*)?'
        : /^\[\.\.\./.test(segment)
          ? '/.+'
          : /^\[/.test(segment)
            ? '/[^/]+'
            : '/' + escape(segment),
    )
    .join('');
  return new RegExp(`^${expression || '/'}$`).test(route);
}

function tokenGuardBeforeCalls(
  source: ts.SourceFile,
  body: ts.Block | undefined,
  name: string,
): ts.IfStatement {
  if (!body) throw new Error(`Missing token guard body in ${source.fileName}`);
  const guardIndex = body.statements.findIndex((statement) => ts.isIfStatement(statement));
  const guard = body.statements[guardIndex];
  if (guardIndex < 0 || !guard || !ts.isIfStatement(guard)) {
    throw new Error(`Malformed-token state lacks its guard in ${source.fileName}`);
  }
  assertExpression(source, guard.expression, `!${name}.test(token)`);
  let priorCall = false;
  for (const statement of body.statements.slice(0, guardIndex)) {
    visit(statement, (node) => {
      if (ts.isCallExpression(node)) priorCall = true;
    });
  }
  if (priorCall)
    throw new Error(
      `Malformed-token sample may access data before its guard in ${source.fileName}`,
    );
  return guard;
}

function bindingContains(name: ts.BindingName, expected: string): boolean {
  return ts.isIdentifier(name)
    ? name.text === expected
    : name.elements.some((element) =>
        ts.isBindingElement(element) ? bindingContains(element.name, expected) : false,
      );
}

function assertNamedValueImport(source: ts.SourceFile, name: string, module: string): void {
  let canonicalImports = 0;
  let conflictingBinding = false;
  visit(source, (node) => {
    if (ts.isImportSpecifier(node) && node.name.text === name) {
      const declaration = node.parent.parent.parent;
      if (
        ts.isImportDeclaration(declaration) &&
        !node.isTypeOnly &&
        !declaration.importClause?.isTypeOnly &&
        ts.isStringLiteral(declaration.moduleSpecifier) &&
        declaration.moduleSpecifier.text === module &&
        (node.propertyName ?? node.name).text === name
      )
        canonicalImports += 1;
      else conflictingBinding = true;
    }
    if (
      ((ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        bindingContains(node.name, name)) ||
      ((ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isEnumDeclaration(node)) &&
        node.name?.text === name) ||
      (ts.isImportClause(node) && node.name?.text === name) ||
      ((ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) &&
        node.name.text === name)
    )
      conflictingBinding = true;
  });
  if (canonicalImports !== 1 || conflictingBinding)
    throw new Error(
      `Malformed-token binding is not canonical or is shadowed: ${name} in ${source.fileName}`,
    );
}

function assertParamsBinding(source: ts.SourceFile, body: ts.Block | undefined): void {
  const declaration = body?.parent;
  const parameter =
    declaration && ts.isFunctionDeclaration(declaration) ? declaration.parameters[0] : undefined;
  const element =
    parameter && ts.isObjectBindingPattern(parameter.name) ? parameter.name.elements[0] : undefined;
  if (
    !declaration ||
    !ts.isFunctionDeclaration(declaration) ||
    declaration.parameters.length !== 1 ||
    !parameter ||
    parameter.initializer ||
    !ts.isObjectBindingPattern(parameter.name) ||
    parameter.name.elements.length !== 1 ||
    !element ||
    element.initializer ||
    element.dotDotDotToken ||
    element.propertyName ||
    !ts.isIdentifier(element.name) ||
    element.name.text !== 'params'
  )
    throw new Error(`Malformed-token handler parameter projection changed in ${source.fileName}`);
}

function assertTokenProjection(source: ts.SourceFile, statement: ts.Statement | undefined): void {
  const declaration =
    statement && ts.isVariableStatement(statement)
      ? statement.declarationList.declarations[0]
      : undefined;
  const element =
    declaration && ts.isObjectBindingPattern(declaration.name)
      ? declaration.name.elements[0]
      : undefined;
  if (
    !statement ||
    !ts.isVariableStatement(statement) ||
    statement.declarationList.declarations.length !== 1 ||
    !(statement.declarationList.flags & ts.NodeFlags.Const) ||
    !declaration ||
    !declaration.initializer ||
    !ts.isObjectBindingPattern(declaration.name) ||
    declaration.name.elements.length !== 1 ||
    !element ||
    element.initializer ||
    element.dotDotDotToken ||
    element.propertyName ||
    !ts.isIdentifier(element.name) ||
    element.name.text !== 'token'
  )
    throw new Error(`Malformed-token handler token projection changed in ${source.fileName}`);
  assertExpression(source, declaration.initializer, 'await params');
}

function assertDirectTokenPrefix(
  source: ts.SourceFile,
  body: ts.Block | undefined,
  guard: ts.IfStatement,
): void {
  assertParamsBinding(source, body);
  if (body?.statements.indexOf(guard) !== 1)
    throw new Error(`Malformed-token handler has an unchecked prefix in ${source.fileName}`);
  assertTokenProjection(source, body.statements[0]);
}

function assertScheduleEntries(source: ts.SourceFile, reader: ts.FunctionDeclaration): void {
  const token = reader.parameters[0];
  if (
    reader.parameters.length !== 1 ||
    !token ||
    !ts.isIdentifier(token.name) ||
    token.name.text !== 'token' ||
    token.initializer
  )
    throw new Error(`Malformed-token schedule reader parameter changed in ${source.fileName}`);
  let conflicts = 0;
  visit(source, (node) => {
    if (
      ((ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
        bindingContains(node.name, 'readShare')) ||
      (ts.isImportSpecifier(node) && node.name.text === 'readShare') ||
      (ts.isImportClause(node) && node.name?.text === 'readShare') ||
      ((ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) &&
        node.name.text === 'readShare') ||
      ((ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isFunctionExpression(node)) &&
        node.name?.text === 'readShare') ||
      (ts.isFunctionDeclaration(node) && node.name?.text === 'readShare' && node !== reader)
    )
      conflicts += 1;
  });
  if (conflicts)
    throw new Error(`Malformed-token binding shadows its guarded reader in ${source.fileName}`);
  const body = defaultBody(source);
  const metadataBody = functionDeclaration(source, 'generateMetadata').body;
  assertParamsBinding(source, body);
  assertParamsBinding(source, metadataBody);
  const first = body?.statements[0];
  const second = body?.statements[1];
  const terminal = body?.statements[2];
  const expected = ts.createSourceFile(
    'schedule-entry.ts',
    `async function Page({ params }) {
    const { token } = await params;
    const share = await readShare(token);
    if (!share) notFound();
  }`,
    ts.ScriptTarget.Latest,
    true,
  );
  const expectedBody = functionDeclaration(expected, 'Page').body!;
  if (
    !first ||
    !second ||
    !terminal ||
    [first, second, terminal].some(
      (statement, index) =>
        JSON.stringify(signature(statement, source)) !==
        JSON.stringify(signature(expectedBody.statements[index]!, expected)),
    )
  )
    throw new Error(
      `Malformed-token schedule entry no longer calls its guarded reader first in ${source.fileName}`,
    );
  const metadataFirst = metadataBody?.statements[0];
  const expectedMetadata = ts.createSourceFile(
    'schedule-metadata.ts',
    `async function Metadata({ params }) {
    const share = await readShare((await params).token);
  }`,
    ts.ScriptTarget.Latest,
    true,
  );
  if (
    !metadataFirst ||
    JSON.stringify(signature(metadataFirst, source)) !==
      JSON.stringify(
        signature(
          functionDeclaration(expectedMetadata, 'Metadata').body!.statements[0]!,
          expectedMetadata,
        ),
      )
  )
    throw new Error(
      `Malformed-token schedule metadata no longer calls its guarded reader first in ${source.fileName}`,
    );
}

function assertMalformedTokenGuard(page: PublicPageSource, name: string, module: string): void {
  const source = sourceFile(page.file);
  assertNamedValueImport(source, name, module);
  const schedules = page.relativeFile === 'share/schedules/[token]/page.tsx';
  const reader = schedules ? functionDeclaration(source, 'readShare') : undefined;
  const guard = tokenGuardBeforeCalls(source, reader ? reader.body : defaultBody(source), name);
  if (reader) {
    if (reader.body?.statements[0] !== guard)
      throw new Error(`Malformed-token schedule reader has an unchecked prefix in ${page.file}`);
  } else assertDirectTokenPrefix(source, defaultBody(source), guard);
  const statements = ts.isBlock(guard.thenStatement)
    ? guard.thenStatement.statements
    : [guard.thenStatement];
  const terminalStatement = statements[0];
  if (
    statements.length !== 1 ||
    !terminalStatement ||
    (!ts.isReturnStatement(terminalStatement) && !ts.isExpressionStatement(terminalStatement))
  ) {
    throw new Error(
      `Malformed-token guard is not an unconditional terminal branch in ${page.file}`,
    );
  }
  const expression = terminalStatement.expression
    ? unwrap(terminalStatement.expression)
    : undefined;
  const terminal = schedules
    ? ts.isReturnStatement(terminalStatement) && expression?.kind === ts.SyntaxKind.NullKeyword
    : page.relativeFile === 'share/[token]/page.tsx'
      ? expression !== undefined &&
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === 'notFound' &&
        expression.arguments.length === 0
      : ts.isReturnStatement(terminalStatement) &&
        expression !== undefined &&
        ts.isJsxSelfClosingElement(expression) &&
        expression.tagName.getText(source) === 'UnavailableArtifact' &&
        expression.attributes.properties.length === 0;
  if (!terminal)
    throw new Error(`Malformed-token guard no longer reaches its declared state in ${page.file}`);
  if (page.relativeFile === 'shared-artifact/[token]/page.tsx') {
    assertNamedValueImport(source, 'UnavailableArtifact', './UnavailableArtifact');
  } else assertNamedValueImport(source, 'notFound', 'next/navigation');
  const metadata = functionDeclaration(source, 'generateMetadata');
  if (schedules) {
    assertScheduleEntries(source, reader!);
    visit(metadata, (node) => {
      if (
        ts.isCallExpression(node) &&
        (!ts.isIdentifier(node.expression) || node.expression.text !== 'readShare')
      ) {
        throw new Error(
          `Malformed-token metadata may access data outside its guarded reader in ${page.file}`,
        );
      }
    });
  } else {
    const metadataGuard = tokenGuardBeforeCalls(source, metadata.body, name);
    assertDirectTokenPrefix(source, metadata.body, metadataGuard);
    const branches = ts.isBlock(metadataGuard.thenStatement)
      ? metadataGuard.thenStatement.statements
      : [metadataGuard.thenStatement];
    const metadataBranch = branches[0];
    if (branches.length !== 1 || !metadataBranch || !ts.isReturnStatement(metadataBranch)) {
      throw new Error(
        `Malformed-token metadata does not return before data access in ${page.file}`,
      );
    }
    visit(metadataBranch, (node) => {
      if (ts.isCallExpression(node))
        throw new Error(`Malformed-token metadata branch calls a data reader in ${page.file}`);
    });
  }
}

function stateSamplesFor(page: PublicPageSource): PublicRouteStateInput[] {
  const success: PublicRouteStateInput = {
    pattern: page.pattern,
    path: null,
    state: 'successful-content',
    expectedHttpStatuses: null,
    dataAccess: 'fixture-required',
    source: 'No successful local route data is available to this source inventory.',
  };
  if (page.relativeFile === 'connect/[deviceType]/page.tsx') {
    const unknownDevice = 'inventory-unknown-device';
    if (isKnownDeviceType(unknownDevice))
      throw new Error('Unknown-device sample became a supported input');
    return [...KNOWN_DEVICE_TYPES, unknownDevice].map((device) => ({
      pattern: page.pattern,
      path: page.pattern.replace('[deviceType]', encodeURIComponent(device)),
      state: isKnownDeviceType(device) ? 'device-sign-in-instructions' : 'unknown-device',
      expectedHttpStatuses: [200],
      dataAccess: 'unverified',
      source: 'app/connect/[deviceType]/connect-client.tsx and page ConnectBody branches',
    }));
  }
  const tokenAdapter =
    page.relativeFile === 'share/[token]/page.tsx'
      ? {
          file: path.join(WEB_ROOT, 'lib/services/org-shared-session-service.ts'),
          name: 'SHARE_TOKEN_REGEX',
          module: '@/lib/services/org-shared-session-service',
          state: 'not-found',
          statuses: [200, 404] as const,
        }
      : page.relativeFile === 'share/schedules/[token]/page.tsx'
        ? {
            file: path.resolve(
              WEB_ROOT,
              '../../packages/contracts/cloud-contracts/src/schedules.ts',
            ),
            name: 'MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN',
            module: '@agiworkforce/cloud-contracts',
            state: 'not-found',
            statuses: [200, 404] as const,
          }
        : page.relativeFile === 'shared-artifact/[token]/page.tsx'
          ? {
              file: path.join(WEB_ROOT, 'lib/services/published-artifact-service.ts'),
              name: 'PUBLISHED_TOKEN_REGEX',
              module: '@/lib/services/published-artifact-service',
              state: 'unavailable-artifact',
              statuses: [200] as const,
            }
          : null;
  if (tokenAdapter) {
    assertMalformedTokenGuard(page, tokenAdapter.name, tokenAdapter.module);
    const invalidToken = 'inventory-invalid-token!';
    if (regexFromSource(tokenAdapter.file, tokenAdapter.name).test(invalidToken)) {
      throw new Error(`Malformed token sample became valid for ${page.pattern}`);
    }
    return [
      {
        pattern: page.pattern,
        path: page.pattern.replace('[token]', encodeURIComponent(invalidToken)),
        state: tokenAdapter.state,
        expectedHttpStatuses: tokenAdapter.statuses,
        expectedNotFoundUi: tokenAdapter.state === 'not-found',
        expectedRobots: 'noindex',
        dataAccess: 'handler-guarded',
        source: `${page.relativeFile}: recognized malformed-token handler and metadata guards; ${tokenAdapter.name}; full route execution is unverified`,
      },
      success,
    ];
  }
  return [success];
}

export function getPublicRouteInventory(
  options: PublicRouteInventoryOptions = {},
): PublicRouteInventory {
  const appDirectory = options.appDirectory ?? APP_DIRECTORY;
  const { publicPages, excludedPages } = enumeratePublicPages(appDirectory);
  const groups = new Map<string, PublicPageSource[]>();
  for (const page of publicPages)
    groups.set(page.pattern, [...(groups.get(page.pattern) ?? []), page]);
  const fixedRoutes: PublicRouteCase[] = [];
  const generatedRoutes: PublicRouteCase[] = [];
  const unresolvedDynamic: UnresolvedPublicRoute[] = [];
  const unavailableDynamic: UnresolvedPublicRoute[] = [];
  const helpPaths = getHelpArticleRoutePaths(options);
  const legalPaths = policyRoutePaths();
  for (const [pattern, pages] of groups) {
    const primary = pages.find((page) => !page.parallelSlot) ?? pages[0];
    if (!primary) throw new Error(`Public route group has no source page: ${pattern}`);
    const sourceFiles = pages.map((page) => page.file).sort(compare);
    const details = pageContext(primary, legalPaths);
    if (!pattern.includes('[')) {
      fixedRoutes.push({
        route: pattern,
        path: pattern,
        pattern,
        kind: 'fixed',
        sourceFiles,
        ...details,
        context: 'signed-out',
      });
      continue;
    }
    if (pages.every((page) => page.disposition === 'not-found-only')) {
      unavailableDynamic.push({
        pattern,
        sourceFiles,
        reason: 'Page unconditionally returns notFound; no successful content route exists.',
        stateSamples: [
          {
            pattern,
            path: pattern
              .split('/')
              .map((segment) => (segment.startsWith('[') ? 'inventory-unavailable' : segment))
              .join('/'),
            state: 'not-found',
            expectedHttpStatuses: [200, 404],
            expectedNotFoundUi: true,
            expectedRobots: 'noindex',
            dataAccess: 'unverified',
            source: primary.relativeFile,
          },
        ],
      });
      continue;
    }
    const source = sourceFile(primary.file);
    let paths: string[] | null = null;
    let dataSource: string | undefined;
    if (primary.relativeFile === 'help/[slug]/page.tsx') {
      paths = helpPaths;
      dataSource = 'Canonical support corpus rebuilt from content/support; helpArticlePath';
    } else if (primary.relativeFile === 'gallery/[templateId]/page.tsx') {
      assertParameterProjection(
        source,
        'INSPIRATION.map((template) => ({ templateId: template.id }))',
      );
      paths = INSPIRATION.map((template) => inspirationPath(template.id));
      dataSource = 'app/gallery/inspiration.ts: INSPIRATION and inspirationPath';
    } else if (primary.relativeFile === 'release-notes/[slug]/page.tsx') {
      assertParameterProjection(
        source,
        'RELEASE_NOTES.map((note) => ({ slug: releaseSlug(note) }))',
      );
      const notes = sourceFile(path.join(WEB_ROOT, 'app/release-notes/release-notes-data.ts'));
      assertExpression(
        notes,
        variable(notes, 'RELEASE_NOTES'),
        `RELEASES.map((release) => {
        const state = RELEASE_STATE[release.date];
        if (!state) throw new Error(\`No release state recorded for \${release.date}\`);
        return { ...release, maturity: state.maturity, surfaces: state.surfaces };
      })`,
      );
      paths = RELEASES.map(releasePath);
      dataSource = 'lib/changelog-entries.ts: RELEASES and releasePath';
    } else if (primary.relativeFile === 'use-cases/[slug]/page.tsx') {
      paths = getUseCaseRoutes(primary);
      dataSource = 'Canonical USE_CASE_CONTENT keys and actual page metadata path expression';
    } else if (primary.relativeFile === 'legal/archive/[policy]/page.tsx') {
      assertParameterProjection(
        source,
        'policyHistories().map((history) => ({ policy: history.slug }))',
      );
      paths = policyHistories().map(policyHistoryHref);
      dataSource = 'lib/legal/policy-archive.ts: policyHistories and policyHistoryHref';
    } else if (primary.relativeFile === 'legal/archive/[policy]/[date]/page.tsx') {
      assertParameterProjection(
        source,
        `policyHistories().flatMap((history) => history.versions
        .filter((version) => version.status === 'archived')
        .map((version) => ({ policy: history.slug, date: version.date })))`,
      );
      paths = policyHistories().flatMap((history) =>
        history.versions
          .filter((version) => version.status === 'archived')
          .map((version) => {
            if (!archivedPolicyText(history.key, version.date))
              throw new Error(`Missing local archived text for ${history.slug}/${version.date}`);
            return archivedVersionHref(history, version.date);
          }),
      );
      dataSource =
        'lib/legal/policy-archive.ts: archived histories, local archived text and archivedVersionHref';
    }
    if (paths === null) {
      unresolvedDynamic.push({
        pattern,
        sourceFiles,
        reason: 'Successful runtime data is unavailable locally; no success path is invented.',
        stateSamples: stateSamplesFor(primary),
      });
      continue;
    }
    if (
      new Set(paths).size !== paths.length ||
      paths.some((route) => !routeMatchesPattern(pattern, route))
    ) {
      throw new Error(`Canonical content paths disagree with route pattern ${pattern}`);
    }
    generatedRoutes.push(
      ...paths.map((route) => ({
        route,
        path: route,
        pattern,
        kind: 'generated' as const,
        sourceFiles,
        dataSource,
        ...details,
        expectedFinalPath: details.expectedFinalPath === null ? null : route,
        context: 'signed-out' as const,
      })),
    );
  }
  const routeOrder = (a: PublicRouteCase, b: PublicRouteCase) => compare(a.path, b.path);
  fixedRoutes.sort(routeOrder);
  generatedRoutes.sort(routeOrder);
  const routes = [...fixedRoutes, ...generatedRoutes].sort(routeOrder);
  if (new Set(routes.map((route) => route.path)).size !== routes.length)
    throw new Error('Public route cases contain duplicate concrete paths');
  unresolvedDynamic.sort((a, b) => compare(a.pattern, b.pattern));
  unavailableDynamic.sort((a, b) => compare(a.pattern, b.pattern));
  const supplied = [...(options.stateSamples ?? [])];
  for (const sample of supplied) {
    if (!['unverified', 'fixture-required'].includes(sample.dataAccess))
      throw new Error(`Invalid state data-access proof scope for ${sample.pattern}`);
    assertExpectedHttpStatuses(sample.expectedHttpStatuses, sample.path ?? sample.pattern);
    if (
      !groups.has(sample.pattern) ||
      (sample.path && !routeMatchesPattern(sample.pattern, sample.path))
    ) {
      throw new Error(`State sample does not match a public source route: ${sample.pattern}`);
    }
  }
  const stateSamples: PublicRouteStateSample[] = [...unresolvedDynamic, ...unavailableDynamic]
    .flatMap((route) => route.stateSamples)
    .concat(supplied)
    .map((sample) => {
      const page =
        groups.get(sample.pattern)?.find((candidate) => !candidate.parallelSlot) ??
        groups.get(sample.pattern)?.[0];
      if (!page) throw new Error(`State sample has no public source page: ${sample.pattern}`);
      const details = pageContext(page, legalPaths);
      return {
        ...sample,
        route: sample.path ?? sample.pattern,
        pageType: sample.pageType ?? details.pageType,
        ownership: sample.ownership ?? details.ownership,
        expectedNotFoundUi: sample.expectedNotFoundUi ?? sample.state === 'not-found',
        expectedRobots:
          sample.expectedRobots === undefined
            ? sample.state === 'not-found'
              ? 'noindex'
              : null
            : sample.expectedRobots,
        expectedFinalPath:
          sample.expectedFinalPath === undefined ? sample.path : sample.expectedFinalPath,
        context: 'signed-out' as const,
        unresolvedFlags: sortedUnique([
          'module-initializers-unverified',
          'import-side-effects-unverified',
          'transitive-bindings-unverified',
          'parameter-and-expression-evaluation-unverified',
          'render-execution-unverified',
          ...(sample.unresolvedFlags ??
            (sample.dataAccess === 'fixture-required'
              ? [...details.unresolvedFlags, 'successful-local-data-unavailable']
              : details.unresolvedFlags)),
        ]),
      };
    });
  for (const route of [...routes, ...stateSamples])
    assertExpectedHttpStatuses(route.expectedHttpStatuses, route.path ?? route.pattern);
  return {
    fixedRoutes,
    generatedRoutes,
    routes,
    patterns: sortedUnique([...groups.keys()]),
    unresolvedDynamic,
    unavailableDynamic,
    excludedPages,
    stateSamples,
  };
}

export function getPublicRoutePaths(options: PublicRouteInventoryOptions = {}): string[] {
  return getPublicRouteInventory(options).routes.map((route) => route.path);
}

export function selectPublicRouteCases(
  inventory: PublicRouteInventory,
  selection: { paths?: readonly string[]; pageTypes?: readonly PublicPageType[] } = {},
): PublicRouteCase[] {
  if (selection.paths?.length === 0 || selection.pageTypes?.length === 0) {
    throw new Error('Public route subset must not be empty');
  }
  const available = new Set(inventory.routes.map((route) => route.path));
  const unknownPaths = selection.paths?.filter((route) => !available.has(route)) ?? [];
  if (unknownPaths.length)
    throw new Error(`Unknown public route subset: ${unknownPaths.join(', ')}`);
  if (selection.pageTypes?.some((type) => !PUBLIC_PAGE_TYPES.includes(type))) {
    throw new Error('Unknown public page type subset');
  }
  const selected = inventory.routes.filter(
    (route) =>
      (!selection.paths || selection.paths.includes(route.path)) &&
      (!selection.pageTypes || selection.pageTypes.includes(route.pageType)),
  );
  if (!selected.length) throw new Error('Public route subset selected no cases');
  for (const route of selected) assertExpectedHttpStatuses(route.expectedHttpStatuses, route.path);
  return selected;
}
