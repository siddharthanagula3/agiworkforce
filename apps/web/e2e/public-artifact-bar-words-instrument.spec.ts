import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import ts from 'typescript';
import {
  bindArtifactBarSources,
  measureArtifactBarWords,
  type ArtifactBarSourceContract,
} from './lib/public-artifact-bar-words';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  type PublicFeatureMockupScene,
} from './lib/public-feature-mockup';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { getPublicRouteInventory } from './lib/public-route-inventory';
import { scanPublicTypography, type PublicTypographyReport } from './lib/public-typography';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';

const repositoryRoot = path.resolve(__dirname, '../../..');
const sceneFile = 'apps/web/features/marketing/components/FeatureScenes.tsx';
const consumerFile = 'apps/web/e2e/public-artifact-mockup.spec.ts';
const collectorFile = 'apps/web/e2e/lib/public-feature-mockup.ts';
const oldCssFile = 'apps/web/e2e/fixtures/artifact-bar-before.css';
const oldCssHash = '5ef034e1be26cf7046673cd42d3f3be92e619be9bf097b34d0cf0ed03f6b8eb8';
const expectedFonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
type OwnerKind = ArtifactBarSourceContract['owners'][number]['kind'];
type BarReport = Awaited<ReturnType<typeof measureArtifactBarWords>>;
type FontProof = Awaited<ReturnType<typeof measurePublicFontProof>>;

function parse(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(path.join(repositoryRoot, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function variable(source: ts.SourceFile, name: string) {
  const found: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found.length !== 1 || !found[0]!.initializer)
    throw new Error('Expected one initialized source variable: ' + name);
  let node = found[0]!.initializer!;
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function property(object: ts.ObjectLiteralExpression, name: string) {
  const found = object.properties.filter(
    (node): node is ts.PropertyAssignment =>
      ts.isPropertyAssignment(node) && node.name.getText().replace(/^['"]|['"]$/g, '') === name,
  );
  if (found.length !== 1) throw new Error('Expected one literal source property: ' + name);
  return found[0]!.initializer;
}

function literal(node: ts.Node) {
  if (!ts.isStringLiteral(node)) throw new Error('Expected a current source string literal');
  return node.text;
}

function sourceArray(file: string, name: string, field?: string) {
  let node = variable(parse(file), name);
  if (field) {
    if (!ts.isObjectLiteralExpression(node)) throw new Error('Expected a source object');
    node = property(node, field);
  }
  if (!ts.isArrayLiteralExpression(node)) throw new Error('Expected a source array');
  return node.elements.map((value, index) => {
    if (
      file === collectorFile &&
      name === 'instrumentSources' &&
      index === 0 &&
      value.getText() === 'path.relative(repositoryRoot, __filename)'
    )
      return collectorFile;
    return literal(value);
  });
}

function currentScene() {
  const source = parse(sceneFile);
  const functions: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'ArtifactsWindow')
      functions.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (functions.length !== 1) throw new Error('Expected the canonical ArtifactsWindow function');
  const openings: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  const findOpening = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === 'AppWindow'
    )
      openings.push(node);
    ts.forEachChild(node, findOpening);
  };
  findOpening(functions[0]!);
  if (openings.length !== 1) throw new Error('Expected the Artifact AppWindow');
  const attribute = (name: string) => {
    const attrs = openings[0]!.attributes.properties.filter(
      (node): node is ts.JsxAttribute =>
        ts.isJsxAttribute(node) && node.name.getText(source) === name,
    );
    if (attrs.length !== 1 || !attrs[0]!.initializer)
      throw new Error('Expected the Artifact attribute: ' + name);
    return literal(attrs[0]!.initializer!);
  };
  const callerNodes = variable(parse(consumerFile), 'callers');
  if (!ts.isArrayLiteralExpression(callerNodes))
    throw new Error('Expected canonical Artifact callers');
  const caller = callerNodes.elements
    .filter(ts.isObjectLiteralExpression)
    .find((node) => literal(property(node, 'name')) === 'artifact-artifacts');
  if (!caller) throw new Error('Expected the canonical Artifacts hero caller');
  const scope = property(caller, 'scope');
  const wrapper = property(caller, 'wrapper');
  if (!ts.isObjectLiteralExpression(scope) || !ts.isObjectLiteralExpression(wrapper))
    throw new Error('Expected caller scope and wrapper');
  if (
    literal(property(scope, 'role')) !== 'region' ||
    literal(property(wrapper, 'kind')) !== 'hero'
  )
    throw new Error('Expected the current native hero anatomy');
  const artifact = variable(parse(consumerFile), 'artifact');
  if (
    !ts.isObjectLiteralExpression(artifact) ||
    literal(property(artifact, 'figure')) !== attribute('label')
  )
    throw new Error('The current component and consumer figure source disagree');
  const scene: PublicFeatureMockupScene = {
    name: 'artifact-bar-native-controls',
    pathname: literal(property(caller, 'pathname')),
    role: 'region',
    region: literal(property(scope, 'region')),
    figure: attribute('label'),
    sourceFiles: [
      ...sourceArray(consumerFile, 'artifact', 'sourceFiles'),
      literal(property(caller, 'pageFile')),
      oldCssFile,
    ],
  };
  return {
    scene,
    title: attribute('title'),
    badge: attribute('badge'),
    headingId: literal(property(wrapper, 'headingId')),
  };
}

function sourceFiles(scene: PublicFeatureMockupScene) {
  const route = getPublicRouteInventory().routes.filter((entry) => entry.path === scene.pathname);
  if (route.length !== 1 || route[0]!.context !== 'signed-out' || route[0]!.unresolvedFlags.length)
    throw new Error('Expected the current signed-out route');
  return [
    ...new Set([
      ...scene.sourceFiles,
      consumerFile,
      collectorFile,
      ...sourceArray(collectorFile, 'instrumentSources'),
      path.relative(repositoryRoot, __filename),
      'apps/web/e2e/lib/public-artifact-bar-words.ts',
      ...route[0]!.sourceFiles.map((file) => path.relative(repositoryRoot, file)),
    ]),
  ].sort();
}

function snapshot(files: readonly string[]) {
  return Object.fromEntries(
    files.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    ]),
  );
}

async function rawSource(frame: Locator) {
  return frame.evaluate((root) => {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let index = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,textarea,option') || !node.data.trim())
        continue;
      const sourceKey = 'text:' + ++index;
      if (!root.contains(node)) continue;
      const owner = parent.closest('.agi-dev-title,.agi-dev-badge');
      nodes.push({
        sourceKey,
        text: node.data,
        normalized: node.data.replace(/\s+/g, ' ').trim(),
        barOwner: owner?.matches('.agi-dev-title')
          ? 'title'
          : owner?.matches('.agi-dev-badge')
            ? 'badge'
            : null,
      });
    }
    const code = root.querySelector('.agi-sc-artifact-source pre > code');
    if (!code || !code.textContent) throw new Error('The actual full Artifact source is missing');
    return { outerHTML: root.outerHTML, code: code.textContent, nodes };
  });
}

async function nativeBar(frame: Locator) {
  return frame.evaluate((root) => {
    const box = (rect: DOMRect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const owners = (['title', 'badge'] as const).flatMap((kind) => {
      const owner = root.querySelector(':scope > .agi-dev-shell > .agi-dev-bar > .agi-dev-' + kind);
      if (!owner) return [];
      const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
      const pieces: { node: Text; start: number; end: number }[] = [];
      let text = '';
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const start = text.length;
        text += node.data;
        pieces.push({ node, start, end: text.length });
      }
      const glyphs = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].map(
        (glyph) => {
          const start = glyph.index,
            end = start + glyph.segment.length;
          const mapped = pieces.filter((piece) => piece.start < end && piece.end > start);
          const range = document.createRange();
          range.setStart(mapped[0]!.node, start - mapped[0]!.start);
          range.setEnd(mapped.at(-1)!.node, end - mapped.at(-1)!.start);
          return {
            start,
            end,
            text: glyph.segment,
            rects: [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map(box),
          };
        },
      );
      const css = getComputedStyle(owner);
      const family = getComputedStyle(root)
        .getPropertyValue('--font-geist-mono')
        .split(',')[0]!
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase();
      return [
        {
          kind,
          text,
          nodeTexts: pieces.map((piece) => piece.node.data),
          glyphs,
          rect: box(owner.getBoundingClientRect()),
          clientTop: owner.clientTop,
          clientHeight: owner.clientHeight,
          lineHeight: css.lineHeight,
          display: css.display,
          visibility: css.visibility,
          columnCount: css.columnCount,
          columnWidth: css.columnWidth,
          textTransform: css.textTransform,
          fontFamily: css.fontFamily,
          request:
            css.fontStyle +
            ' ' +
            css.fontWeight +
            ' ' +
            css.fontSize +
            ' ' +
            JSON.stringify(family),
          family,
          position: css.position,
          top: css.top,
        },
      ];
    });
    return { owners, fontsStatus: document.fonts.status };
  });
}

async function settleStyles(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function measure(page: Page, frame: Locator, contract: ArtifactBarSourceContract) {
  await settleStyles(page);
  const proof = await measurePublicFontProof(page, frame, expectedFonts);
  const typography = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: contract.scope.selector,
  });
  const source = await rawSource(frame);
  const native = await nativeBar(frame);
  const report = await measureArtifactBarWords(frame, contract, typography, proof);
  return { proof, typography, source, native, report };
}

type Measurement = Awaited<ReturnType<typeof measure>>;
type NativeState = {
  page: Page;
  frame: Locator;
  contract: ArtifactBarSourceContract;
  baseline: Measurement;
  evidence: Record<string, unknown>;
};

function complete(report: BarReport, soft = false) {
  const assertion = soft ? expect.soft : expect;
  assertion(report.findings).toEqual([]);
  assertion(report.unmeasured).toEqual([]);
  assertion(report.coverage.measuredOwners).toBe(report.coverage.expectedOwners);
  assertion(report.coverage.measuredTextNodes).toBe(report.coverage.expectedTextNodes);
  assertion(report.coverage.mappedSourceUnits).toBe(report.coverage.expectedSourceUnits);
  assertion(report.coverage.measuredPaintedGraphemes).toBe(
    report.coverage.expectedPaintedGraphemes,
  );
  assertion(report.coverage.measuredWords).toBe(report.coverage.expectedWords);
  assertion(report.coverage.measuredWords).toBe(report.coverage.discoveredWords);
}

function canonicalComplete(value: Measurement) {
  expect(value.proof.fontCoverageGaps).toEqual([]);
  expect(
    value.proof.expectedFontProof.every(
      (font) => font.requests > 0 && font.requests === font.matchedRequests,
    ),
  ).toBe(true);
  expect(value.typography.findings).toEqual([]);
  expect(value.typography.unmeasured).toEqual([]);
  expect(value.typography.excluded).toEqual([]);
  expect(
    value.typography.samples
      .filter((sample) => sample.kind === 'text')
      .map((sample) => ({ sourceKey: sample.sourceKey, text: sample.text })),
  ).toEqual(
    value.source.nodes.map((node) => ({ sourceKey: node.sourceKey, text: node.normalized })),
  );
}

function preserved(baseline: Measurement, current: Measurement, removed?: OwnerKind) {
  expect(current.source.code).toBe(baseline.source.code);
  const expected = baseline.source.nodes
    .filter((node) => node.barOwner !== removed)
    .map(({ text, barOwner }) => ({ text, barOwner }));
  expect(current.source.nodes.map(({ text, barOwner }) => ({ text, barOwner }))).toEqual(expected);
}

function coverageFailure(report: BarReport) {
  expect(report.unmeasured).toContainEqual(
    expect.objectContaining({ kind: 'artifact-bar-source-coverage-incomplete' }),
  );
  expect(
    report.coverage.measuredOwners !== report.coverage.expectedOwners ||
      report.coverage.measuredTextNodes !== report.coverage.expectedTextNodes ||
      report.coverage.mappedSourceUnits !== report.coverage.expectedSourceUnits ||
      report.coverage.measuredPaintedGraphemes !== report.coverage.expectedPaintedGraphemes ||
      report.coverage.measuredWords !== report.coverage.expectedWords,
  ).toBe(true);
}

async function withNative(
  browser: Browser,
  baseURL: string | undefined,
  info: TestInfo,
  control: (state: NativeState) => Promise<void>,
) {
  if (!baseURL || info.config.workers !== 1)
    throw new Error('Native controls require the actual server and one worker');
  const primary = currentScene();
  const files = sourceFiles(primary.scene);
  const evidence: Record<string, unknown> = {
    test: info.title,
    repeatEachIndex: info.repeatEachIndex,
    primary,
    sourceStart: snapshot(files),
    runtimeTypography: {
      source: Function.prototype.toString.call(scanPublicTypography),
      sha256: createHash('sha256')
        .update(Function.prototype.toString.call(scanPublicTypography))
        .digest('hex'),
    },
    contextClosed: false,
    limits: [
      'Actual signed-out Artifact hero; styled controls are instrument fixtures, not native production behavior.',
      'Full source text stays unchanged except the named owner-removal controls.',
      'Registered face/raw-codepoint proof does not identify native glyph fallback pixels or transformed uppercase glyphs.',
      'No source truth, interaction or accessibility acceptance is inferred.',
    ],
  };
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1024, height: 844 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    hasTouch: true,
    storageState: { cookies: [], origins: [] },
  });
  let failure: Error | undefined;
  try {
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const page = await context.newPage();
    const route = getPublicRouteInventory().routes.find(
      (entry) => entry.path === primary.scene.pathname,
    )!;
    const destination = new URL(primary.scene.pathname, baseURL);
    const expectation = {
      ...route,
      expectedOrigin: destination.origin,
      expectedQuery: destination.search,
    };
    evidence['initialReadiness'] = await settlePublicPage(page, expectation);
    const consent = page.getByRole('region', { name: 'Cookie consent', exact: true });
    await expect(consent).toBeVisible();
    await consent.getByRole('button', { name: 'Necessary only', exact: true }).click();
    await expect(consent).toHaveCount(0);
    const preferences = parseCookieConsentRecord(
      await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
    );
    expect(preferences).toMatchObject({ ...NECESSARY_ONLY_PREFERENCES });
    expect(isCookieConsentCurrent(preferences)).toBe(true);
    evidence['readiness'] = await settlePublicPage(page, expectation);
    const located = await locatePublicFeatureMockup(page, primary.scene);
    try {
      expect(await located.region.getAttribute('aria-labelledby')).toBe(primary.headingId);
      await located.frame.scrollIntoViewIfNeeded();
      const header = page.getByRole('banner');
      await expect(header).toHaveCount(1);
      const headerBox = await header.boundingBox();
      if (!headerBox) throw new Error('Native header geometry is missing');
      await located.frame.evaluate(
        (root, bottom) => window.scrollBy(0, root.getBoundingClientRect().top - bottom),
        headerBox.y + headerBox.height,
      );
      await settleStyles(page);
      const contract = await bindArtifactBarSources(located.frame, {
        selector: located.scopeSelector,
        elementIndex: located.ownership.elementIndex,
        tag: located.ownership.tag,
        label: located.ownership.label,
      });
      expect(contract.owners.find((owner) => owner.kind === 'title')?.text).toBe(primary.title);
      expect(contract.owners.find((owner) => owner.kind === 'badge')?.text).toBe(primary.badge);
      const baseline = await measure(page, located.frame, contract);
      evidence['baseline'] = baseline;
      canonicalComplete(baseline);
      complete(baseline.report);
      await control({ page, frame: located.frame, contract, baseline, evidence });
      expect(page.url()).toBe(destination.href);
    } finally {
      await located.frameHandle.dispose();
    }
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    try {
      await context.close();
      evidence['contextClosed'] = true;
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error(String(error));
    }
    try {
      evidence['sourceEnd'] = snapshot(files);
      evidence['sourceUnchanged'] =
        JSON.stringify(evidence['sourceStart']) === JSON.stringify(evidence['sourceEnd']);
      if (!evidence['sourceUnchanged'])
        failure ??= new Error('Control source changed during measurement');
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error(String(error));
    }
    evidence['status'] = failure ? 'failed' : 'passed';
    if (failure) evidence['error'] = failure.message;
    await info.attach('artifact-bar-control.json', {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: 'application/json',
    });
  }
  if (failure) throw failure;
}

function titleOwner(value: Measurement) {
  const owner = value.native.owners.find((item) => item.kind === 'title');
  if (!owner) throw new Error('Actual native title is missing');
  return owner;
}

function measuredWord(value: Measurement) {
  const owner = value.report.owners.find((item) => item.kind === 'title');
  const words = owner?.words.filter((word) => word.bands === 1 && word.rects.length === 1);
  const word = words?.toSorted((a, b) => b.rects[0]!.width - a.rects[0]!.width)[0];
  if (!word) throw new Error('A complete measured actual title word is required');
  const glyph = titleOwner(value).glyphs.find((part) => part.end === word.end);
  if (!glyph || glyph.rects.length !== 1)
    throw new Error('A measured final actual word grapheme is required');
  const width = word.rects[0]!.width - glyph.rects[0]!.width / 2;
  if (!Number.isFinite(width) || width <= 0) throw new Error('Derived control width is invalid');
  return { word, glyph, width };
}

async function barWidth(frame: Locator, width: number) {
  await frame.locator(':scope > .agi-dev-shell > .agi-dev-bar').evaluate((bar, contentWidth) => {
    const css = getComputedStyle(bar);
    const extra =
      parseFloat(css.paddingLeft) +
      parseFloat(css.paddingRight) +
      parseFloat(css.borderLeftWidth) +
      parseFloat(css.borderRightWidth);
    (bar as HTMLElement).style.boxSizing = 'border-box';
    (bar as HTMLElement).style.inlineSize = contentWidth + extra + 'px';
  }, width);
}

async function nativeWordRange(frame: Locator, start: number, end: number) {
  return frame.locator('.agi-dev-title').evaluate(
    (element, offsets) => {
      if (element.childNodes.length !== 1 || !(element.firstChild instanceof Text))
        throw new Error('The exact current native title partition changed');
      const node = element.firstChild;
      const range = document.createRange();
      range.setStart(node, offsets.start);
      range.setEnd(node, offsets.end);
      return {
        source: node.data,
        text: node.data.slice(offsets.start, offsets.end),
        ...offsets,
        rects: [...range.getClientRects()]
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          })),
      };
    },
    { start, end },
  );
}

async function oldStyles(frame: Locator) {
  const before = readFileSync(path.join(repositoryRoot, oldCssFile));
  expect(createHash('sha256').update(before).digest('hex')).toBe(oldCssHash);
  const css = [
    readFileSync(
      path.join(repositoryRoot, 'apps/web/features/marketing/components/legacy-landing.css'),
      'utf8',
    ),
    readFileSync(
      path.join(repositoryRoot, 'apps/web/features/marketing/components/legacy-pages.css'),
      'utf8',
    ),
    before.toString('utf8'),
  ];
  return frame.evaluate((root, sources) => {
    const applied = [];
    (root.querySelector('.agi-dev-title') as HTMLElement).style.order = 'initial';
    for (const text of sources) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule)) continue;
        for (const kind of ['bar', 'title'] as const) {
          const element = root.querySelector(
            ':scope > .agi-dev-shell > .agi-dev-bar' +
              (kind === 'title' ? ' > .agi-dev-title' : ''),
          );
          if (
            !element ||
            !rule.selectorText.includes('.agi-dev-' + kind) ||
            !element.matches(rule.selectorText)
          )
            continue;
          for (const name of rule.style)
            (element as HTMLElement).style.setProperty(
              name,
              rule.style.getPropertyValue(name),
              rule.style.getPropertyPriority(name),
            );
          applied.push({ kind, selector: rule.selectorText, declarations: rule.style.cssText });
        }
      }
    }
    const title = root.querySelector('.agi-dev-title')!;
    const style = getComputedStyle(title);
    return {
      applied,
      tracking: style.letterSpacing,
      flex: style.flex,
      overflowWrap: style.overflowWrap,
    };
  }, css);
}

test('complete actual Artifact bar keeps every source and core capture gate', async ({
  browser,
  baseURL,
}, info) => {
  const primary = currentScene();
  await measurePublicFeatureMockup(
    browser,
    baseURL,
    info,
    {
      ...primary.scene,
      sourceFiles: sourceFiles(primary.scene),
    },
    1024,
    'light',
    async (page, evidence) => {
      evidence['runtimeTypography'] = {
        source: Function.prototype.toString.call(scanPublicTypography),
        sha256: createHash('sha256')
          .update(Function.prototype.toString.call(scanPublicTypography))
          .digest('hex'),
      };
      const located = await locatePublicFeatureMockup(page, primary.scene);
      try {
        expect(await located.region.getAttribute('aria-labelledby')).toBe(primary.headingId);
        const contract = await bindArtifactBarSources(located.frame, {
          selector: located.scopeSelector,
          elementIndex: located.ownership.elementIndex,
          tag: located.ownership.tag,
          label: located.ownership.label,
        });
        expect(contract.owners.find((owner) => owner.kind === 'title')?.text).toBe(primary.title);
        expect(contract.owners.find((owner) => owner.kind === 'badge')?.text).toBe(primary.badge);
        evidence['barControlContract'] = contract;
        const reports: BarReport[] = [];
        evidence['barControlReadings'] = reports;
        return {
          scope: primary.scene,
          preserveScroll: false,
          assertRetained: async (phase) => {
            if (phase !== 'before-capture' && phase !== 'after-capture') return;
            const report = await measureArtifactBarWords(
              located.frame,
              contract,
              evidence['typography'],
              evidence['fontProof'],
            );
            reports.push(report);
            complete(report, true);
            if (phase === 'after-capture') expect.soft(report).toEqual(reports[0]);
          },
        };
      } finally {
        await located.frameHandle.dispose();
      }
    },
  );
});

test('source-preserving controlled bare-host punctuation break retains every adjoining word', async ({
  browser,
  baseURL,
}, info) => {
  await withNative(browser, baseURL, info, async (state) => {
    const owner = titleOwner(state.baseline);
    const mark = [...owner.text.matchAll(/\p{P}/gu)].find(
      (entry) =>
        entry.index > 0 &&
        /[\p{L}\p{N}]/u.test(owner.text[entry.index - 1]!) &&
        /[\p{L}\p{N}]/u.test(owner.text[entry.index + entry[0].length] ?? ''),
    );
    if (!mark) throw new Error('The actual title has no internal source punctuation control');
    const next = owner.glyphs.find((glyph) => glyph.start === mark.index + mark[0].length);
    if (!next || next.rects.length !== 1)
      throw new Error('Punctuation control needs the next measured source grapheme');
    const end = mark.index + mark[0].length;
    const width = await state.frame.locator('.agi-dev-title').evaluate(
      (element, args) => {
        if (element.childNodes.length !== 1 || !(element.firstChild instanceof Text))
          throw new Error('Actual title partition changed');
        const range = document.createRange();
        range.setStart(element.firstChild, 0);
        range.setEnd(element.firstChild, args.end);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        if (rects.length !== 1) throw new Error('Actual prefix needs one complete native range');
        return rects[0]!.width + args.nextWidth / 2;
      },
      { end, nextWidth: next.rects[0]!.width },
    );
    await state.frame.locator('.agi-dev-title').evaluate((element) => {
      const style = (element as HTMLElement).style;
      style.flex = '1 1 100%';
      style.order = '1';
      style.minInlineSize = '0';
      style.whiteSpace = 'normal';
      style.overflowWrap = 'anywhere';
      style.wordBreak = 'normal';
    });
    await barWidth(state.frame, width);
    const current = await measure(state.page, state.frame, state.contract);
    state.evidence['mutation'] = { punctuation: mark[0], start: mark.index, end, width, current };
    preserved(state.baseline, current);
    const native = titleOwner(current);
    const punctuation = native.glyphs.find((glyph) => glyph.start === mark.index)!;
    const following = native.glyphs.find((glyph) => glyph.start === end)!;
    expect(punctuation.rects).toHaveLength(1);
    expect(following.rects).toHaveLength(1);
    expect(following.rects[0]!.top).toBeGreaterThan(punctuation.rects[0]!.top);
    const words = current.report.owners.find((part) => part.kind === 'title')!.words;
    expect(words.some((word) => word.end === mark.index)).toBe(true);
    expect(words.some((word) => word.start === end)).toBe(true);
    canonicalComplete(current);
    complete(current.report);
  });
});

test('source-preserving old CSS exposes an actual letter-run split', async ({
  browser,
  baseURL,
}, info) => {
  await withNative(browser, baseURL, info, async (state) => {
    const styles = await oldStyles(state.frame);
    const original = await measure(state.page, state.frame, state.contract);
    const target = measuredWord(original);
    await barWidth(state.frame, target.width);
    const current = await measure(state.page, state.frame, state.contract);
    state.evidence['mutation'] = { styles, target, current };
    preserved(state.baseline, current);
    expect(styles.overflowWrap).toBe('anywhere');
    expect(
      styles.applied.some(
        (rule) => rule.kind === 'title' && rule.declarations.includes('letter-spacing'),
      ),
    ).toBe(true);
    const glyphs = titleOwner(current).glyphs.filter(
      (glyph) => glyph.start >= target.word.start && glyph.end <= target.word.end,
    );
    expect(
      new Set(glyphs.flatMap((glyph) => glyph.rects.map((rect) => rect.top))).size,
    ).toBeGreaterThan(1);
    expect(current.report.findings).toContainEqual(
      expect.objectContaining({
        kind: 'artifact-bar-word-split',
        owner: 'title',
        text: target.word.text,
      }),
    );
    expect(current.report.coverage.measuredWords).toBe(current.report.coverage.expectedWords);
    expect(current.report.coverage.measuredPaintedGraphemes).toBe(
      current.report.coverage.expectedPaintedGraphemes,
    );
  });
});

test('source-preserving overlapping line boxes cannot masquerade as an intact word', async ({
  browser,
  baseURL,
}, info) => {
  await withNative(browser, baseURL, info, async (state) => {
    await oldStyles(state.frame);
    const original = await measure(state.page, state.frame, state.contract);
    const target = measuredWord(original);
    await barWidth(state.frame, target.width);
    await state.frame.locator('.agi-dev-title').evaluate((element, height) => {
      (element as HTMLElement).style.lineHeight = height / 2 + 'px';
    }, target.glyph.rects[0]!.height);
    const current = await measure(state.page, state.frame, state.contract);
    state.evidence['mutation'] = { target, current };
    preserved(state.baseline, current);
    const rects = titleOwner(current)
      .glyphs.filter((glyph) => glyph.start >= target.word.start && glyph.end <= target.word.end)
      .flatMap((glyph) => glyph.rects);
    expect(
      rects.some((first) =>
        rects.some(
          (last) =>
            last.top > first.top &&
            Math.min(first.bottom, last.bottom) > Math.max(first.top, last.top),
        ),
      ),
    ).toBe(true);
    expect(current.report.unmeasured).toContainEqual(
      expect.objectContaining({
        kind: 'artifact-bar-word-baseline-geometry-unmeasured',
        owner: 'title',
        text: target.word.text,
      }),
    );
    coverageFailure(current.report);
  });
});

test('source-preserving relative baseline shift is explicitly unmeasured', async ({
  browser,
  baseURL,
}, info) => {
  await withNative(browser, baseURL, info, async (state) => {
    const owner = titleOwner(state.baseline);
    const first = owner.glyphs.find((glyph) => glyph.text.trim() && glyph.rects.length === 1)!;
    const shift = first.rects[0]!.height / 2;
    await state.frame.locator('.agi-dev-title').evaluate((element, delta) => {
      const style = (element as HTMLElement).style;
      style.position = 'relative';
      style.top = delta + 'px';
    }, shift);
    const current = await measure(state.page, state.frame, state.contract);
    state.evidence['mutation'] = { shift, current };
    preserved(state.baseline, current);
    expect(
      titleOwner(current).glyphs.find((glyph) => glyph.start === first.start)!.rects[0]!.top,
    ).toBeGreaterThan(first.rects[0]!.top);
    expect(current.report.unmeasured).toContainEqual(
      expect.objectContaining({
        kind: 'artifact-bar-word-baseline-geometry-unmeasured',
        owner: 'title',
      }),
    );
    coverageFailure(current.report);
  });
});

test('source-preserving same-height native column continuation is explicitly unmeasured', async ({
  browser,
  baseURL,
}, info) => {
  await withNative(browser, baseURL, info, async (state) => {
    await oldStyles(state.frame);
    const original = await measure(state.page, state.frame, state.contract);
    const target = measuredWord(original);
    const lineHeight = parseFloat(titleOwner(original).lineHeight);
    await state.frame.locator('.agi-dev-title').evaluate(
      (element, args) => {
        const style = (element as HTMLElement).style;
        style.flex = '0 0 auto';
        style.inlineSize = args.width * 2 + 'px';
        style.blockSize = args.lineHeight + 'px';
        style.columnCount = '2';
        style.columnGap = '0px';
        style.columnFill = 'auto';
        style.overflow = 'visible';
      },
      { width: target.width, lineHeight },
    );
    const current = await measure(state.page, state.frame, state.contract);
    const range = await nativeWordRange(state.frame, target.word.start, target.word.end);
    state.evidence['mutation'] = { target, lineHeight, range, current };
    preserved(state.baseline, current);
    const owner = titleOwner(current);
    expect(owner.columnCount).toBe('2');
    expect(range.source).toBe(titleOwner(state.baseline).text);
    expect(range.text).toBe(target.word.text);
    const rects = range.rects;
    expect(rects.length).toBeGreaterThan(1);
    expect(new Set(rects.map((rect) => rect.left)).size).toBeGreaterThan(1);
    expect(
      Math.min(...rects.map((rect) => rect.bottom)) - Math.max(...rects.map((rect) => rect.top)),
    ).toBeGreaterThan(0);
    expect(current.report.unmeasured).toContainEqual(
      expect.objectContaining({
        kind: 'artifact-bar-multicolumn-source-unmeasured',
        owner: 'title',
      }),
    );
    expect(current.report.unmeasured).toContainEqual(
      expect.objectContaining({
        kind: 'artifact-bar-word-baseline-geometry-unmeasured',
        owner: 'title',
        text: target.word.text,
      }),
    );
    coverageFailure(current.report);
  });
});

for (const kind of ['title', 'badge'] as const) {
  test(
    'missing actual ' + kind + ' cannot rebind away expected source',
    async ({ browser, baseURL }, info) => {
      await withNative(browser, baseURL, info, async (state) => {
        await state.frame.locator('.agi-dev-' + kind).evaluate((element) => element.remove());
        const current = await measure(state.page, state.frame, state.contract);
        state.evidence['mutation'] = { kind, current };
        preserved(state.baseline, current, kind);
        expect(current.report.findings).toContainEqual(
          expect.objectContaining({
            kind: 'artifact-bar-source-owner-missing',
            owner: kind,
          }),
        );
        expect(current.report.coverage.measuredOwners).toBeLessThan(
          current.report.coverage.expectedOwners,
        );
        coverageFailure(current.report);
        await expect(bindArtifactBarSources(state.frame, state.contract.scope)).rejects.toThrow(
          'direct ' + kind + ' source span',
        );
      });
    },
  );

  for (const mode of ['display', 'visibility'] as const) {
    test(
      'hidden actual ' + kind + ' by ' + mode + ' fails expected painted coverage',
      async ({ browser, baseURL }, info) => {
        await withNative(browser, baseURL, info, async (state) => {
          await state.frame
            .locator('.agi-dev-' + kind)
            .evaluate(
              (element, property) =>
                (element as HTMLElement).style.setProperty(
                  property,
                  property === 'display' ? 'none' : 'hidden',
                ),
              mode,
            );
          await expect
            .poll(() =>
              state.frame
                .locator('.agi-dev-' + kind)
                .evaluate((element, property) => getComputedStyle(element)[property], mode),
            )
            .toBe(mode === 'display' ? 'none' : 'hidden');
          const nativeBefore = await nativeBar(state.frame);
          const current = await measure(state.page, state.frame, state.contract);
          state.evidence['mutation'] = { kind, mode, nativeBefore, current };
          preserved(state.baseline, current);
          const before = nativeBefore.owners.find((owner) => owner.kind === kind);
          expect(before).toBeDefined();
          expect(before![mode]).toBe(mode === 'display' ? 'none' : 'hidden');
          const native = current.native.owners.find((owner) => owner.kind === kind);
          expect(native).toBeDefined();
          expect(native![mode]).toBe(mode === 'display' ? 'none' : 'hidden');
          const glyphs = native!.glyphs.filter((glyph) => glyph.text.trim());
          expect(glyphs.length).toBeGreaterThan(0);
          expect(current.report.findings).toContainEqual(
            expect.objectContaining({
              kind: 'artifact-bar-hidden-source',
              owner: kind,
            }),
          );
          if (mode === 'display') {
            expect(glyphs.every((glyph) => glyph.rects.length === 0)).toBe(true);
            expect(current.report.unmeasured).toContainEqual(
              expect.objectContaining({
                kind: 'artifact-bar-source-not-proven',
                owner: kind,
              }),
            );
          } else {
            expect(glyphs.every((glyph) => glyph.rects.length > 0)).toBe(true);
            expect(before!.glyphs.filter((glyph) => glyph.text.trim())).toHaveLength(glyphs.length);
            expect(current.typography.excluded).toContainEqual(
              expect.objectContaining({ text: native!.text, reason: 'visibility' }),
            );
            expect(
              current.typography.samples.filter(
                (sample) => sample.kind === 'text' && sample.text === native!.text,
              ),
            ).toEqual([]);
            expect(current.report.coverage.measuredWords).toBe(
              current.report.coverage.expectedWords,
            );
          }
          expect(current.report.unmeasured).toContainEqual(
            expect.objectContaining({ kind: 'artifact-bar-source-not-proven', owner: kind }),
          );
          expect(current.report.coverage.measuredTextNodes).toBeLessThan(
            current.report.coverage.expectedTextNodes,
          );
          expect(current.report.coverage.mappedSourceUnits).toBe(
            current.report.coverage.expectedSourceUnits,
          );
          expect(current.report.coverage.measuredPaintedGraphemes).toBe(
            current.report.coverage.expectedPaintedGraphemes - glyphs.length,
          );
          expect(current.report.coverage.measuredPaintedGraphemes).toBeLessThan(
            current.report.coverage.expectedPaintedGraphemes,
          );
          coverageFailure(current.report);
        });
      },
    );
  }

  test(
    'clipped actual ' + kind + ' keeps raw ranges and fails paint coverage',
    async ({ browser, baseURL }, info) => {
      await withNative(browser, baseURL, info, async (state) => {
        const owner = state.baseline.native.owners.find((item) => item.kind === kind)!;
        const last = owner.glyphs
          .filter((glyph) => glyph.text.trim() && glyph.rects.length === 1)
          .at(-1)!;
        const rect = last.rects[0]!;
        const cut = rect.top + rect.height / 2;
        await state.frame.locator('.agi-dev-' + kind).evaluate((element, edge) => {
          const box = element.getBoundingClientRect();
          const css = getComputedStyle(element);
          const style = (element as HTMLElement).style;
          style.boxSizing = 'border-box';
          style.overflow = 'hidden';
          style.blockSize = edge - box.top + parseFloat(css.borderBottomWidth) + 'px';
        }, cut);
        const current = await measure(state.page, state.frame, state.contract);
        state.evidence['mutation'] = { kind, last, cut, current };
        preserved(state.baseline, current);
        const native = current.native.owners.find((item) => item.kind === kind)!;
        const raw = native.glyphs.find((glyph) => glyph.start === last.start)!.rects[0]!;
        expect(raw.width).toBeGreaterThan(0);
        expect(raw.height).toBeGreaterThan(0);
        const clipBottom = native.rect.top + native.clientTop + native.clientHeight;
        expect(clipBottom).toBeGreaterThan(raw.top);
        expect(clipBottom).toBeLessThan(raw.bottom);
        expect(current.report.findings).toContainEqual(
          expect.objectContaining({
            kind: 'artifact-bar-grapheme-clipped',
            owner: kind,
            text: last.text,
          }),
        );
        expect(current.report.coverage.measuredPaintedGraphemes).toBeLessThan(
          current.report.coverage.expectedPaintedGraphemes,
        );
        coverageFailure(current.report);
      });
    },
  );
}

for (const fault of [
  'canonical-source',
  'mono-proof',
  'mono-request',
  'missing-codepoint',
  'uncovered-codepoint',
] as const) {
  test(
    'missing actual evidence ' + fault + ' cannot pass source coverage',
    async ({ browser, baseURL }, info) => {
      await withNative(browser, baseURL, info, async (state) => {
        const canonical: PublicTypographyReport = structuredClone(state.baseline.typography);
        const proof: FontProof = structuredClone(state.baseline.proof);
        const baselineTypography = JSON.stringify(state.baseline.typography);
        const baselineFontProof = JSON.stringify(state.baseline.proof);
        const owner = titleOwner(state.baseline);
        const sourceKey = state.baseline.report.owners.find((item) => item.kind === 'title')!
          .sourceKeys[0]!;
        const family = proof.usedFontFamilies.find((item) => item.family === owner.family)!;
        const request = family.requests.find((entry) => entry.font === owner.request)!;
        const point = [...owner.text].find((glyph) => glyph.trim())!.codePointAt(0)!;
        expect(request.codepoints).toContain(point);
        if (fault === 'canonical-source')
          canonical.samples = canonical.samples.filter((sample) => sample.sourceKey !== sourceKey);
        else if (fault === 'mono-proof')
          proof.expectedFontProof = proof.expectedFontProof.filter(
            (entry) => entry.family !== owner.family,
          );
        else if (fault === 'mono-request')
          family.requests = family.requests.filter((entry) => entry.font !== owner.request);
        else if (fault === 'missing-codepoint')
          request.codepoints = request.codepoints.filter((entry) => entry !== point);
        else request.uncoveredCodepoints = [...new Set([...request.uncoveredCodepoints, point])];
        const report = await measureArtifactBarWords(state.frame, state.contract, canonical, proof);
        state.evidence['fault'] = {
          fault,
          sourceKey,
          family: owner.family,
          request: owner.request,
          point,
          canonical,
          proof,
          report,
        };
        expect(await rawSource(state.frame)).toEqual(state.baseline.source);
        expect(JSON.stringify(state.baseline.typography)).toBe(baselineTypography);
        expect(JSON.stringify(state.baseline.proof)).toBe(baselineFontProof);
        if (fault === 'mono-proof') {
          expect(report.unmeasured).toContainEqual(
            expect.objectContaining({ kind: 'artifact-bar-loaded-mono-proof-missing' }),
          );
          expect(report.coverage.measuredOwners).toBeLessThan(report.coverage.expectedOwners);
        } else {
          expect(report.unmeasured).toContainEqual(
            expect.objectContaining({
              kind: 'artifact-bar-source-not-proven',
              owner: 'title',
            }),
          );
          expect(report.coverage.measuredTextNodes).toBeLessThan(report.coverage.expectedTextNodes);
          expect(report.coverage.measuredPaintedGraphemes).toBeLessThan(
            report.coverage.expectedPaintedGraphemes,
          );
          coverageFailure(report);
        }
        complete(
          await measureArtifactBarWords(
            state.frame,
            state.contract,
            state.baseline.typography,
            state.baseline.proof,
          ),
        );
      });
    },
  );
}
