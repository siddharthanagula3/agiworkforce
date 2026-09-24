import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd();
const SOURCE_ROOTS = ['app', 'features', 'shared'];
const MARKER = 'data-app-header';
const HEADER_HEIGHT = 'h-12';
const OUT_OF_FLOW = new Set(['fixed', 'absolute', 'sticky']);
const SCROLLS = /^overflow(-y)?-(auto|scroll)$/;

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

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;

interface ClassTokens {
  always: string[];
  sometimes: string[];
}

interface HeaderSite {
  file: string;
  tag: string;
  ariaHidden: boolean;
  tokens: ClassTokens;
  ancestors: Array<{ tag: string; tokens: ClassTokens }>;
  firstChildOfParent: boolean;
}

function openingOf(node: JsxNode): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

function attribute(node: JsxNode, name: string): ts.JsxAttribute | undefined {
  return openingOf(node).attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function literalTokens(node: ts.Node, into: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    into.push(...node.text.split(/\s+/).filter(Boolean));
  }
}

function classTokens(node: JsxNode): ClassTokens {
  const always: string[] = [];
  const sometimes: string[] = [];
  const initializer = attribute(node, 'className')?.initializer;
  if (!initializer) return { always, sometimes };
  if (ts.isStringLiteral(initializer)) {
    literalTokens(initializer, always);
    return { always, sometimes };
  }
  const expression = ts.isJsxExpression(initializer) ? initializer.expression : undefined;
  if (!expression) return { always, sometimes };
  const direct = ts.isCallExpression(expression) ? expression.arguments : [expression];
  for (const argument of direct) {
    if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
      literalTokens(argument, always);
    } else {
      const visit = (child: ts.Node): void => {
        literalTokens(child, sometimes);
        ts.forEachChild(child, visit);
      };
      visit(argument);
    }
  }
  return { always, sometimes };
}

function tagName(node: JsxNode): string {
  return openingOf(node).tagName.getText();
}

function enclosingJsx(node: ts.Node): ts.JsxElement | undefined {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isFirstElementChild(node: JsxNode, parent: ts.JsxElement): boolean {
  for (const child of parent.children) {
    if (ts.isJsxText(child) && child.text.trim() === '') continue;
    let contains = false;
    const visit = (candidate: ts.Node): void => {
      if (candidate === node) contains = true;
      else if (!contains) ts.forEachChild(candidate, visit);
    };
    visit(child);
    return contains;
  }
  return false;
}

function headerSites(): HeaderSite[] {
  const sites: HeaderSite[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(resolve(webRoot, root))) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes(MARKER)) continue;
      const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, 4);
      const visit = (node: ts.Node): void => {
        if (
          (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
          attribute(node, MARKER)
        ) {
          const ancestors: HeaderSite['ancestors'] = [];
          let parent = enclosingJsx(node);
          const direct = parent;
          while (parent) {
            ancestors.push({ tag: tagName(parent), tokens: classTokens(parent) });
            parent = enclosingJsx(parent);
          }
          const hidden = attribute(node, 'aria-hidden')?.initializer;
          sites.push({
            file: relative(webRoot, file),
            tag: tagName(node),
            ariaHidden: Boolean(hidden && hidden.getText().replace(/[{}'"]/g, '') === 'true'),
            tokens: classTokens(node),
            ancestors,
            firstChildOfParent: direct ? isFirstElementChild(node, direct) : false,
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }
  return sites;
}

const sites = headerSites();
const rows = sites.filter((site) => !site.ariaHidden);
const bands = sites.filter((site) => site.ariaHidden);
const label = (site: HeaderSite) => `${site.file} <${site.tag}>`;
const utility = (token: string) => token.slice(token.lastIndexOf(':') + 1);
const allTokens = (tokens: ClassTokens) => [...tokens.always, ...tokens.sometimes].map(utility);

describe('every app header is one fixed row above the content it heads', () => {
  it('finds each shell header by the marker the desktop drag region already relies on', () => {
    expect(rows.map((site) => site.file).sort()).toEqual(
      expect.arrayContaining([
        'features/chat/pages/WebChatPage.tsx',
        'shared/components/layout/WebAppShell.tsx',
      ]),
    );
  });

  it('gives every header row the same 48px height in every state', () => {
    const offenders = rows.filter(
      (site) =>
        !site.tokens.always.includes(HEADER_HEIGHT) ||
        !site.tokens.always.includes('shrink-0') ||
        allTokens(site.tokens).includes('shrink') ||
        allTokens(site.tokens).some(
          (token) => /^(min-|max-)?h-/.test(token) && token !== HEADER_HEIGHT,
        ),
    );
    expect(offenders.map(label)).toEqual([]);
  });

  it('keeps every header row in the flow, so it can never be painted over anchored content', () => {
    const offenders = rows.filter((site) =>
      allTokens(site.tokens).some((token) => OUT_OF_FLOW.has(token)),
    );
    expect(offenders.map(label)).toEqual([]);
  });

  it('keeps every header row outside any scrolling ancestor, so it stays in view at every scroll position', () => {
    const offenders = rows.filter((site) =>
      site.ancestors.some((ancestor) => allTokens(ancestor.tokens).some((t) => SCROLLS.test(t))),
    );
    expect(offenders.map(label)).toEqual([]);
  });

  it('puts every header row first in a column, so the content starts below it', () => {
    const offenders = rows.filter((site) => {
      const parent = site.ancestors[0];
      return (
        !site.firstChildOfParent ||
        !parent ||
        !parent.tokens.always.includes('flex') ||
        !parent.tokens.always.includes('flex-col')
      );
    });
    expect(offenders.map(label)).toEqual([]);
  });

  it('lets a window drag band leave the flow only behind the page and hidden from assistive tech', () => {
    const offenders = bands.filter(
      (site) =>
        !site.tokens.always.some(
          (token) => /^-z-\d+$/.test(token) || token === 'z-[var(--z-behind)]',
        ) || allTokens(site.tokens).some((token) => token === 'sticky'),
    );
    expect(offenders.map(label)).toEqual([]);
  });
});
