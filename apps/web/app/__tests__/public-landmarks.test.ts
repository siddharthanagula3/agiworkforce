import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const SOURCE_ROOTS = ['app', 'features', 'shared'];
const SITE_CHROME = new Set(['Header', 'MarketingHeader', 'MarketingFooter']);
const NATIVE_CHROME = new Set(['header', 'footer']);
const SKIP_TARGET = 'main-content';

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

interface LandmarkReport {
  rendersSiteChrome: boolean;
  problems: string[];
}

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

const isJsxTag = (node: ts.Node): node is JsxTag =>
  ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);

function attributeText(tag: JsxTag, name: string): string | undefined {
  for (const property of tag.attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText() !== name) continue;
    const value = property.initializer;
    if (!value) return undefined;
    if (ts.isStringLiteral(value)) return value.text;
    if (ts.isJsxExpression(value) && value.expression && ts.isStringLiteralLike(value.expression)) {
      return value.expression.text;
    }
    return undefined;
  }
  return undefined;
}

const isMainLandmark = (tag: JsxTag): boolean =>
  tag.tagName.getText() === 'main' || attributeText(tag, 'role') === 'main';

function landmarkReport(fileName: string, source: string): LandmarkReport {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lineOf = (node: ts.Node) =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const mains: JsxTag[] = [];
  let rendersSiteChrome = false;

  const collect = (node: ts.Node): void => {
    if (isJsxTag(node)) {
      if (SITE_CHROME.has(node.tagName.getText())) rendersSiteChrome = true;
      if (isMainLandmark(node)) mains.push(node);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);

  const problems: string[] = [];

  for (const main of mains) {
    const where = `${fileName}:${lineOf(main)}`;
    if (attributeText(main, 'id') !== SKIP_TARGET) {
      problems.push(`${where} main lacks id="${SKIP_TARGET}"`);
    }
    if (!rendersSiteChrome || !ts.isJsxOpeningElement(main)) continue;
    const nested = (node: ts.Node): void => {
      if (isJsxTag(node)) {
        const name = node.tagName.getText();
        if (SITE_CHROME.has(name) || NATIVE_CHROME.has(name)) {
          problems.push(`${where} main contains <${name}> at line ${lineOf(node)}`);
        }
      }
      ts.forEachChild(node, nested);
    };
    for (const child of main.parent.children) nested(child);
  }
  return { rendersSiteChrome, problems };
}

const UNTARGETED_MAIN_ALLOWLIST: Record<string, string> = {
  'app/dev/renderer-probe/page.tsx': 'development-only probe, not reachable in production',
  'app/dev/token-probe/page.tsx': 'development-only probe, not reachable in production',
  'app/operator/support/page.tsx': 'signed-in operator console, no marketing chrome',
  'features/admin/pages/AdminConsolePage.tsx': 'signed-in admin console, no marketing chrome',
  'features/admin/pages/DirectorySyncAdminPage.tsx': 'signed-in admin console, no marketing chrome',
  'features/admin/pages/PluginModerationPage.tsx': 'signed-in admin console, no marketing chrome',
  'features/admin/pages/RefundOperationsPage.tsx': 'signed-in admin console, no marketing chrome',
  'features/admin/pages/ReleaseDashboardPage.tsx': 'signed-in admin console, no marketing chrome',
  'features/admin/pages/WorkspaceDeletionPage.tsx': 'signed-in admin console, no marketing chrome',
  'features/workspace-console/components/WorkspaceConsoleShell.tsx':
    'signed-in workspace console, no marketing chrome',
};

const page = (body: string) =>
  `export default function Page() {\n  return (\n    <div data-design="agi">\n${body}\n    </div>\n  );\n}\n`;

const WELL_FORMED = page(
  [
    '      <Header />',
    '      <main id="main-content" tabIndex={-1} className="agi-shell">',
    '        <section><h1>Title</h1></section>',
    '      </main>',
    '      <MarketingFooter />',
  ].join('\n'),
);

const MALFORMED: Array<{ name: string; source: string; expected: string[] }> = [
  {
    name: 'a main without the skip target id',
    source: page(
      [
        '      <Header />',
        '      <main className="agi-shell">',
        '        <h1>Title</h1>',
        '      </main>',
      ].join('\n'),
    ),
    expected: ['fixture.tsx:5 main lacks id="main-content"'],
  },
  {
    name: 'a main whose id is some other value',
    source: page(
      [
        '      <Header />',
        '      <main id="content">',
        '        <h1>Title</h1>',
        '      </main>',
      ].join('\n'),
    ),
    expected: ['fixture.tsx:5 main lacks id="main-content"'],
  },
  {
    name: 'the site header inside main',
    source: page(
      [
        '      <main id="main-content">',
        '        <Header />',
        '        <h1>Title</h1>',
        '      </main>',
      ].join('\n'),
    ),
    expected: ['fixture.tsx:4 main contains <Header> at line 5'],
  },
  {
    name: 'the marketing header inside main',
    source: page(
      [
        '      <main id="main-content">',
        '        <MarketingHeader minimal />',
        '        <h1>Title</h1>',
        '      </main>',
      ].join('\n'),
    ),
    expected: ['fixture.tsx:4 main contains <MarketingHeader> at line 5'],
  },
  {
    name: 'the site footer inside main',
    source: page(
      [
        '      <Header />',
        '      <main id="main-content">',
        '        <h1>Title</h1>',
        '        <MarketingFooter />',
        '      </main>',
      ].join('\n'),
    ),
    expected: ['fixture.tsx:5 main contains <MarketingFooter> at line 7'],
  },
  {
    name: 'a native header and footer inside main',
    source: page(
      [
        '      <Header />',
        '      <main id="main-content">',
        '        <header><h1>Title</h1></header>',
        '        <footer>Updated today</footer>',
        '      </main>',
      ].join('\n'),
    ),
    expected: [
      'fixture.tsx:5 main contains <header> at line 6',
      'fixture.tsx:5 main contains <footer> at line 7',
    ],
  },
  {
    name: 'a second branch that renders a bare main',
    source: [
      'export default function Page({ embedded }: { embedded: boolean }) {',
      '  if (embedded) return <main><h1>Title</h1></main>;',
      '  return (',
      '    <>',
      '      <Header />',
      '      <main id="main-content"><h1>Title</h1></main>',
      '      <MarketingFooter />',
      '    </>',
      '  );',
      '}',
    ].join('\n'),
    expected: ['fixture.tsx:2 main lacks id="main-content"'],
  },
  {
    name: 'a role="main" container that wraps the footer',
    source: page(
      [
        '      <Header />',
        '      <div role="main" id="main-content">',
        '        <h1>Title</h1>',
        '        <MarketingFooter condensed />',
        '      </div>',
      ].join('\n'),
    ),
    expected: ['fixture.tsx:5 main contains <MarketingFooter> at line 7'],
  },
];

describe('public pages keep the site chrome outside the main landmark', () => {
  const scanned = SOURCE_ROOTS.flatMap((root) => sourceFiles(resolve(webRoot, root))).map(
    (file) => {
      const name = relative(webRoot, file);
      return { name, ...landmarkReport(name, readFileSync(file, 'utf8')) };
    },
  );
  const chromeFiles = scanned.filter((file) => file.rendersSiteChrome);

  it('reads every file that renders the site header or footer', () => {
    expect(chromeFiles.length).toBeGreaterThanOrEqual(100);
  });

  it('gives each of those files a main the skip link can reach, with the chrome outside it', () => {
    expect(chromeFiles.flatMap((file) => file.problems)).toEqual([]);
  });

  it('gives every main outside the allowlist the skip target id', () => {
    const offenders = scanned
      .filter((file) => !(file.name in UNTARGETED_MAIN_ALLOWLIST))
      .flatMap((file) => file.problems.filter((problem) => problem.includes('lacks id')));
    expect(offenders).toEqual([]);
  });

  it('keeps the allowlist limited to files that still render a main without the id', () => {
    const stale = Object.keys(UNTARGETED_MAIN_ALLOWLIST).filter(
      (name) =>
        !scanned.some(
          (file) =>
            file.name === name && file.problems.some((problem) => problem.includes('lacks id')),
        ),
    );
    expect(stale).toEqual([]);
  });

  it('reports a bare main in a file that renders no site chrome', () => {
    const source = page('      <main className="p-6"><h1>Title</h1></main>');
    expect(landmarkReport('fixture.tsx', source)).toEqual({
      rendersSiteChrome: false,
      problems: ['fixture.tsx:4 main lacks id="main-content"'],
    });
  });

  it('accepts a page with the header before main and the footer after it', () => {
    expect(landmarkReport('fixture.tsx', WELL_FORMED)).toEqual({
      rendersSiteChrome: true,
      problems: [],
    });
  });

  it.each(MALFORMED)('reports $name', ({ source, expected }) => {
    expect(landmarkReport('fixture.tsx', source).problems).toEqual(expected);
  });
});
