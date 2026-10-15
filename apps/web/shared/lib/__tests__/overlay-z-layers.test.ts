import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const FOUNDATION_CSS = 'packages/ui/design-tokens/src/foundation.css';
const CONSUMER_ROOTS = ['apps/web', 'packages/ui/ui/src', 'packages/ui/unified-chat/src'];
const OWNERSHIP_ROOTS = ['apps/web', 'apps/desktop/src', 'packages/ui'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'out', '__tests__']);

const LAYER_DECLARATION = /^[^\S\n]*--z-([a-z-]+)\s*:\s*(-?\d+)\s*;/gm;
const HAS_LAYER_DECLARATION = /^[^\S\n]*--z-[a-z-]+\s*:\s*-?\d+\s*;/m;
const LAYER_REFERENCE = /var\(\s*--z-([a-z-]+)\s*(?:,\s*(\d+)\s*)?\)/g;
const RAW_LAYER = /(?<![\w-])-?z-(?:\d+|\[(?!var\()[^\]]+\])/g;
const RAW_STYLE_LAYER = /\bzIndex\s*:\s*['"`]?-?\d+|z-index\s*:\s*-?\d+/g;
const LAYER_NAME = /--z-([a-z-]+)/g;
const POPUP_ROLE_ATTRIBUTE = /role=(?:"|\{\s*')(?:menu|listbox|dialog)/;
const POPUP_ROLES = new Set(['menu', 'listbox', 'dialog']);
const RESPONSIVE_VARIANTS = String.raw`(?:(?:sm|md|lg|xl|2xl|max-[\w-]+|min-[\w-]+):)*`;
const STACKING_UTILITIES = String.raw`(?:fixed|sticky|isolate|transform|-?(?:translate|scale|rotate|skew)-\S+|opacity-(?:\d{1,2}|\[[^\]]+\])|(?:backdrop-)?(?:blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia)(?:-\S+)?|drop-shadow(?:-\S+)?|filter|mix-blend-\S+|will-change-(?:transform|opacity|filter|\[[^\]]+\])|contain-(?:layout|paint|strict|content))`;
const STACKING_CLASS = new RegExp(String.raw`^${RESPONSIVE_VARIANTS}${STACKING_UTILITIES}$`);
const REVEALED_OPACITY = /(?:^|\s|:)opacity-100(?=\s|$)/;
const UNLAYERED_CONTEXT = 'auto';
const NOTICE_HOST_TAG = 'ProductNoticeHost';

function declaredLayers(relPath: string): Map<string, number> {
  const css = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const layers = new Map<string, number>();
  for (const match of css.matchAll(LAYER_DECLARATION)) {
    layers.set(match[1] as string, Number(match[2]));
  }
  return layers;
}

function sourceFiles(relDir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) sourceFiles(rel, out);
    } else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

type Reference = { file: string; line: number; layer: string; fallback: number | null };

function layerReferences(): Reference[] {
  const found: Reference[] = [];
  for (const root of CONSUMER_ROOTS) {
    for (const file of sourceFiles(root)) {
      stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          for (const match of line.matchAll(LAYER_REFERENCE)) {
            found.push({
              file,
              line: index + 1,
              layer: match[1] as string,
              fallback: match[2] === undefined ? null : Number(match[2]),
            });
          }
        });
    }
  }
  return found;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (match, lead: string) => lead + ' '.repeat(match.length - lead.length),
    );
}

type LayerSite = { rung: string; at: string };
type PopupPanel = { at: string; role: string; panelRungs: string[]; ancestors: LayerSite[] };

function moduleConstants(source: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return constants;
}

function literalText(node: ts.Node, constants: Map<string, ts.Expression>): string[] {
  const out: string[] = [];
  const resolved = new Set<string>();
  const walk = (current: ts.Node): void => {
    if (ts.isStringLiteralLike(current)) {
      out.push(current.text);
    } else if (ts.isTemplateExpression(current)) {
      out.push(current.head.text);
      for (const span of current.templateSpans) {
        walk(span.expression);
        out.push(span.literal.text);
      }
    } else if (ts.isIdentifier(current)) {
      const value = constants.get(current.text);
      if (value && !resolved.has(current.text)) {
        resolved.add(current.text);
        walk(value);
      }
    } else {
      ts.forEachChild(current, walk);
    }
  };
  walk(node);
  return out;
}

function attributeValue(
  element: ts.JsxOpeningLikeElement,
  names: readonly string[],
  constants: Map<string, ts.Expression>,
): string[] {
  return element.attributes.properties.flatMap((attribute) =>
    ts.isJsxAttribute(attribute) &&
    attribute.initializer &&
    names.includes(attribute.name.getText())
      ? literalText(attribute.initializer, constants)
      : [],
  );
}

function rungsOf(element: ts.JsxOpeningLikeElement, constants: Map<string, ts.Expression>) {
  return attributeValue(element, ['className', 'style'], constants).flatMap((text) =>
    [...text.matchAll(LAYER_NAME)].map((match) => match[1] as string),
  );
}

type ParsedSource = {
  file: string;
  source: ts.SourceFile;
  constants: Map<string, ts.Expression>;
  imports: Map<string, { imported: string; specifier: string }>;
};

const PACKAGE_SOURCE_ROOTS: ReadonlyArray<readonly [string, string]> = [
  ['@agiworkforce/unified-chat', 'packages/ui/unified-chat/src'],
  ['@agiworkforce/ui', 'packages/ui/ui/src'],
];
const PATH_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['@features/', 'apps/web/features/'],
  ['@shared/', 'apps/web/shared/'],
  ['@/', 'apps/web/'],
];
const COMPONENT_WRAPPER = /(?:^|\.)(?:forwardRef|memo)$/;
const PORTAL_CALL = /(?:^|\.)createPortal$/;
const PORTAL_TAG = /Portal$/;
const MAX_COMPONENT_HOPS = 8;

const consumerTsx = CONSUMER_ROOTS.flatMap((root) => sourceFiles(root)).filter((file) =>
  file.endsWith('.tsx'),
);
const consumerText = new Map(
  consumerTsx.map((file) => [file, readFileSync(join(REPO_ROOT, file), 'utf8')]),
);
const parsedSources = new Map<string, ParsedSource>();

function importsOf(source: ts.SourceFile): ParsedSource['imports'] {
  const imports: ParsedSource['imports'] = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause?.name) imports.set(clause.name.text, { imported: 'default', specifier });
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        imports.set(element.name.text, {
          imported: element.propertyName?.text ?? element.name.text,
          specifier,
        });
      }
    }
  }
  return imports;
}

function parsed(file: string): ParsedSource {
  const cached = parsedSources.get(file);
  if (cached) return cached;
  const source = ts.createSourceFile(
    file,
    consumerText.get(file) ?? readFileSync(join(REPO_ROOT, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const entry = { file, source, constants: moduleConstants(source), imports: importsOf(source) };
  parsedSources.set(file, entry);
  return entry;
}

function siteOf(node: ts.Node, entry: ParsedSource): string {
  const { line } = entry.source.getLineAndCharacterOfPosition(node.getStart(entry.source));
  return `${entry.file}:${line + 1}`;
}

function resolvesTo(specifier: string, fromFile: string, definingFile: string): boolean {
  for (const [name, root] of PACKAGE_SOURCE_ROOTS) {
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      return definingFile.startsWith(`${root}/`);
    }
  }
  const alias = PATH_ALIASES.find(([prefix]) => specifier.startsWith(prefix));
  const target = specifier.startsWith('.')
    ? posix.join(posix.dirname(fromFile), specifier)
    : alias
      ? `${alias[1]}${specifier.slice(alias[0].length)}`
      : null;
  if (!target) return false;
  const bare = definingFile.replace(/\.tsx?$/, '');
  return bare === target || bare === `${target}/index` || definingFile.startsWith(`${target}/`);
}

function rendersHostElement(element: ts.JsxOpeningLikeElement): boolean {
  const tag = element.tagName;
  return ts.isPropertyAccessExpression(tag) || /^[a-z]/.test(tag.getText());
}

function wrapsComponent(node: ts.Node): boolean {
  return ts.isCallExpression(node) && COMPONENT_WRAPPER.test(node.expression.getText());
}

function endsComponent(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return true;
  return (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    (!ts.isCallExpression(node.parent) || wrapsComponent(node.parent))
  );
}

function componentName(boundary: ts.Node): string | null {
  if (ts.isFunctionDeclaration(boundary)) return boundary.name?.text ?? null;
  if (ts.isMethodDeclaration(boundary)) {
    const owner = boundary.parent;
    return ts.isClassDeclaration(owner) ? (owner.name?.text ?? null) : null;
  }
  let node: ts.Node = boundary.parent;
  while (wrapsComponent(node)) node = node.parent;
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node.name.text : null;
}

function isDefaultExport(name: string, entry: ParsedSource): boolean {
  return entry.source.statements.some(
    (statement) =>
      (ts.isFunctionDeclaration(statement) &&
        statement.name?.text === name &&
        (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Default) !== 0) ||
      (ts.isExportAssignment(statement) &&
        !statement.isExportEquals &&
        statement.expression.getText() === name),
  );
}

const DECLARED_COMPONENT = /(?:function|const|class)\s+([A-Z]\w*)/g;
const declaringFiles = new Map<string, string[]>();
for (const file of consumerTsx) {
  for (const [, name] of (consumerText.get(file) ?? '').matchAll(DECLARED_COMPONENT)) {
    const files = declaringFiles.get(name as string) ?? [];
    if (!files.includes(file)) files.push(file);
    declaringFiles.set(name as string, files);
  }
}

function definitionsOf(name: string): Array<{ entry: ParsedSource; node: ts.Node }> {
  return (declaringFiles.get(name) ?? []).flatMap((file) => {
    const entry = parsed(file);
    const found: Array<{ entry: ParsedSource; node: ts.Node }> = [];
    const visit = (node: ts.Node): void => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.name?.text === name
      ) {
        found.push({ entry, node });
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === name
      ) {
        found.push({ entry, node });
      }
      ts.forEachChild(node, visit);
    };
    visit(entry.source);
    return found;
  });
}

const portalVerdicts = new Map<string, boolean>();

function rendersIntoPortal(name: string, seen: Set<string> = new Set()): boolean {
  const known = portalVerdicts.get(name);
  if (known !== undefined) return known;
  if (seen.has(name)) return false;
  seen.add(name);
  const verdict = definitionsOf(name).some(({ node }) => {
    const body = node.getText();
    if (body.includes('createPortal(')) return true;
    return [...body.matchAll(/<([A-Z][\w.]*)/g)].some(
      ([, tag]) => PORTAL_TAG.test(tag as string) || rendersIntoPortal(tag as string, seen),
    );
  });
  portalVerdicts.set(name, verdict);
  return verdict;
}

function isPortalTag(element: ts.JsxOpeningLikeElement, entry: ParsedSource): boolean {
  const tag = element.tagName.getText();
  if (PORTAL_TAG.test(tag)) return true;
  if (rendersHostElement(element)) return false;
  return rendersIntoPortal(entry.imports.get(tag)?.imported ?? tag);
}

const componentSites = new Map<string, LayerSite[]>();

function usagesOf(name: string, definingFile: string): Array<{ entry: ParsedSource; tag: string }> {
  const local = { entry: parsed(definingFile), tag: name };
  const imported = consumerTsx
    .filter((file) => file !== definingFile && (consumerText.get(file) ?? '').includes(name))
    .flatMap((file) => {
      const entry = parsed(file);
      return [...entry.imports.entries()]
        .filter(
          ([, binding]) =>
            resolvesTo(binding.specifier, file, definingFile) &&
            (binding.imported === name ||
              (binding.imported === 'default' && isDefaultExport(name, parsed(definingFile)))),
        )
        .map(([tag]) => ({ entry, tag }));
    });
  return [local, ...imported];
}

function rendersAt(node: ts.Node, tag: string): boolean {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    return node.tagName.getText() === tag;
  }
  return ts.isCallExpression(node) && node.expression.getText() === tag;
}

function layersAroundComponent(name: string, definingFile: string, hops: number): LayerSite[] {
  const key = `${definingFile}#${name}`;
  const cached = componentSites.get(key);
  if (cached) return cached;
  componentSites.set(key, []);
  const sites = usagesOf(name, definingFile).flatMap(({ entry, tag }) => {
    const found: LayerSite[] = [];
    const visit = (node: ts.Node): void => {
      if (rendersAt(node, tag)) found.push(...layersAbove(node, entry, hops));
      ts.forEachChild(node, visit);
    };
    visit(entry.source);
    return found;
  });
  componentSites.set(key, sites);
  return sites;
}

function formsStackingContext(
  element: ts.JsxOpeningLikeElement,
  constants: Map<string, ts.Expression>,
): boolean {
  const classes = attributeValue(element, ['className'], constants).join(' ');
  const revealed = REVEALED_OPACITY.test(classes);
  return classes
    .split(/\s+/)
    .some((token) => STACKING_CLASS.test(token) && !(revealed && token.startsWith('opacity-')));
}

function hostsProductNotices(node: ts.JsxElement): boolean {
  return node.children.some(
    (child) => ts.isJsxSelfClosingElement(child) && child.tagName.getText() === NOTICE_HOST_TAG,
  );
}

function layersAbove(start: ts.Node, entry: ParsedSource, hops: number) {
  const found: LayerSite[] = [];
  let node: ts.Node = ts.isJsxOpeningElement(start) ? start.parent.parent : start.parent;
  while (node && !ts.isSourceFile(node)) {
    if (ts.isJsxElement(node) && hostsProductNotices(node)) return found;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (isPortalTag(opening, entry)) return found;
      if (rendersHostElement(opening)) {
        const at = siteOf(opening, entry);
        const rungs = rungsOf(opening, entry.constants);
        found.push(...rungs.map((rung) => ({ rung, at })));
        if (rungs.length === 0 && formsStackingContext(opening, entry.constants)) {
          found.push({ rung: UNLAYERED_CONTEXT, at });
        }
      }
    }
    if (ts.isCallExpression(node) && PORTAL_CALL.test(node.expression.getText())) return found;
    if (endsComponent(node)) {
      const name = componentName(node);
      if (name && hops < MAX_COMPONENT_HOPS) {
        found.push(...layersAroundComponent(name, entry.file, hops + 1));
      }
      return found;
    }
    node = node.parent;
  }
  return found;
}

function popupPanels(): PopupPanel[] {
  const panels: PopupPanel[] = [];
  for (const file of consumerTsx) {
    if (!POPUP_ROLE_ATTRIBUTE.test(consumerText.get(file) ?? '')) continue;
    const entry = parsed(file);
    const visit = (node: ts.Node): void => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        rendersHostElement(node)
      ) {
        const role = attributeValue(node, ['role'], entry.constants).join('');
        if (POPUP_ROLES.has(role)) {
          panels.push({
            at: siteOf(node, entry),
            role,
            panelRungs: rungsOf(node, entry.constants),
            ancestors: layersAbove(node, entry, 0),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(entry.source);
  }
  return panels;
}

const layers = declaredLayers(FOUNDATION_CSS);
const references = layerReferences();

describe('overlay stacking contract', () => {
  it('has one canonical owner for every z-index rung', () => {
    const owners = OWNERSHIP_ROOTS.flatMap((root) => sourceFiles(root))
      .filter((file) => file.endsWith('.css'))
      .filter((file) => HAS_LAYER_DECLARATION.test(readFileSync(join(REPO_ROOT, file), 'utf8')));
    expect(owners).toEqual([FOUNDATION_CSS]);
  });

  it('rejects numeric Tailwind, arbitrary and CSS rungs in production source', () => {
    const violations: string[] = [];
    for (const root of CONSUMER_ROOTS) {
      for (const file of sourceFiles(root)) {
        stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'))
          .split('\n')
          .forEach((line, index) => {
            for (const match of line.matchAll(RAW_LAYER)) {
              violations.push(`${file}:${index + 1} ${match[0]}`);
            }
            for (const match of line.matchAll(RAW_STYLE_LAYER)) {
              violations.push(`${file}:${index + 1} ${match[0]}`);
            }
          });
      }
    }
    expect(violations, 'stacking must consume a named --z-* rung from foundation.css').toEqual([]);
  });

  it('declares every referenced layer and uses no numeric fallback', () => {
    for (const reference of references) {
      expect(
        layers.has(reference.layer),
        `${reference.file}:${reference.line} reads --z-${reference.layer}, which ${FOUNDATION_CSS} does not declare`,
      ).toBe(true);
      expect(
        reference.fallback,
        `${reference.file}:${reference.line} carries a numeric fallback instead of failing closed on the canonical stylesheet`,
      ).toBeNull();
    }
  });

  it('keeps popover and tooltip above modal', () => {
    const modal = layers.get('modal');
    const popover = layers.get('popover');
    const tooltip = layers.get('tooltip');
    expect([modal, popover, tooltip]).not.toContain(undefined);
    // A Select or Tooltip opened from inside a Dialog is a sibling of it under
    // <body>, so it disappears behind the dialog unless it outranks --z-modal.
    expect(popover as number).toBeGreaterThan(modal as number);
    expect(tooltip as number).toBeGreaterThan(popover as number);
  });

  it('keeps product notices beneath every dialog, menu, panel and popover opened over them', () => {
    const source = stripComments(
      readFileSync(join(REPO_ROOT, 'apps/web/shared/components/ProductNotice.tsx'), 'utf8'),
    );
    const stack = /function ProductNoticeStack[\s\S]*?z-\[var\(--z-([a-z-]+)\)\]/.exec(source);
    expect(stack, 'ProductNoticeStack must sit on a named --z-* rung').not.toBeNull();
    const rung = layers.get(stack?.[1] as string);
    expect(rung).toBeDefined();
    for (const overlay of [
      'panel-backdrop',
      'panel',
      'dropdown',
      'overlay',
      'modal',
      'popover',
      'tooltip',
    ]) {
      expect(
        rung as number,
        `product notices on --z-${stack?.[1]} would paint over --z-${overlay}`,
      ).toBeLessThan(layers.get(overlay) as number);
    }
  });

  it('keeps every in-page popup panel above product notices, through every component and stacking context that holds it', () => {
    const banner = layers.get('banner') as number;
    const height = (rung: string) =>
      rung === UNLAYERED_CONTEXT ? 0 : (layers.get(rung) as number);
    const panels = popupPanels();
    expect(panels.length, 'the scan must find the hand-rolled menu panels').toBeGreaterThan(10);
    const buried = panels.flatMap((panel) => [
      ...panel.panelRungs
        .filter((rung) => height(rung) <= banner)
        .map((rung) => `${panel.at} ${panel.role} panel sits on --z-${rung}`),
      ...panel.ancestors
        .filter(({ rung }) => height(rung) <= banner)
        .map(({ rung, at }) =>
          rung === UNLAYERED_CONTEXT
            ? `${panel.at} ${panel.role} panel is held inside a stacking context with no rung at ${at}`
            : `${panel.at} ${panel.role} panel is held inside a --z-${rung} layer at ${at}`,
        ),
    ]);
    expect(buried, `product notices on --z-banner paint over these panels`).toEqual([]);
  }, 60_000);

  it('keeps every named rung in one monotonic ladder', () => {
    const ordered = [
      'behind-far',
      'behind',
      'base',
      'content',
      'content-raised',
      'control',
      'content-sticky',
      'banner',
      'panel-backdrop',
      'panel',
      'panel-raised',
      'dropdown',
      'navigation',
      'navigation-sticky',
      'sticky',
      'overlay',
      'overlay-panel',
      'modal',
      'popover',
      'tooltip',
      'notification',
      'fullscreen',
      'skip-link',
    ].map((layer) => layers.get(layer));
    expect(ordered).not.toContain(undefined);
    expect(ordered).toEqual([...ordered].sort((a, b) => (a as number) - (b as number)));
  });
});
