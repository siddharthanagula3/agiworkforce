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
import { bindArtifactBarSources, measureArtifactBarWords } from './lib/public-artifact-bar-words';
import {
  bindPublicWindowBarSources,
  measurePublicWindowBarWords,
  type PublicWindowBarKind,
  type PublicWindowBarSourceContract,
} from './lib/public-window-bar-words';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  type PublicFeatureMockupScene,
} from './lib/public-feature-mockup';
import { measurePublicFontProof } from './lib/public-page-readiness';
import { scanPublicTypography, type PublicTypographyReport } from './lib/public-typography';
import type { measurePublicFeatureBodyWords } from './lib/public-feature-body-words';

const repositoryRoot = path.resolve(__dirname, '../../..');
const sceneFile = 'apps/web/features/marketing/components/FeatureScenes.tsx';
const ownerFile = 'apps/web/e2e/lib/public-window-bar-words.ts';
const adapterFile = 'apps/web/e2e/lib/public-artifact-bar-words.ts';
const expectedFonts = [{ cssVariable: '--font-geist-sans' }, { cssVariable: '--font-geist-mono' }];
type Report = Awaited<ReturnType<typeof measurePublicWindowBarWords>>;
type FontProof = Awaited<ReturnType<typeof measurePublicFontProof>>;
type Mode =
  'positive' | 'wrong-kind' | 'dual-class' | 'empty-contract' | 'omitted-source' | 'word-split';

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
    throw new Error('Setup requires one initialized source variable: ' + name);
  let node = found[0]!.initializer!;
  while (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}
function property(object: ts.ObjectLiteralExpression, name: string) {
  const matches = object.properties.filter(
    (node): node is ts.PropertyAssignment =>
      ts.isPropertyAssignment(node) && node.name.getText().replace(/^['"]|['"]$/g, '') === name,
  );
  if (matches.length !== 1) throw new Error('Setup requires one source property: ' + name);
  return matches[0]!.initializer;
}
function literal(node: ts.Node) {
  if (!ts.isStringLiteral(node)) throw new Error('Setup refuses a nonliteral source string');
  return node.text;
}
function sourceString(source: ts.SourceFile, node: ts.Node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return literal(variable(source, node.text));
  throw new Error('Setup refuses an unknown string-source shape');
}
function object(node: ts.Node) {
  if (!ts.isObjectLiteralExpression(node)) throw new Error('Setup requires a source object');
  return node;
}
function currentScene(kind: PublicWindowBarKind) {
  const consumerFile =
    kind === 'artifact'
      ? 'apps/web/e2e/public-artifact-mockup.spec.ts'
      : 'apps/web/e2e/public-project-mockup.spec.ts';
  const consumer = parse(consumerFile);
  const config = object(variable(consumer, kind));
  const callers = variable(consumer, 'callers');
  if (!ts.isArrayLiteralExpression(callers))
    throw new Error('Setup requires the actual caller array');
  const name = kind === 'artifact' ? 'artifact-artifacts' : 'project-projects-hero';
  const matches = callers.elements
    .filter(ts.isObjectLiteralExpression)
    .filter((node) => literal(property(node, 'name')) === name);
  if (matches.length !== 1) throw new Error('Setup requires one actual hero caller');
  const caller = matches[0]!;
  const scope = object(property(caller, 'scope'));
  const wrapper = object(property(caller, 'wrapper'));
  if (
    literal(property(scope, 'role')) !== 'region' ||
    literal(property(wrapper, 'kind')) !== 'hero'
  )
    throw new Error('Setup refuses unknown caller anatomy');
  const files = property(config, 'sourceFiles');
  if (!ts.isArrayLiteralExpression(files))
    throw new Error('Setup requires the actual source roster');
  const sourceFiles = files.elements.map(literal);
  if (!sourceFiles.includes(ownerFile))
    throw new Error('Setup requires the generic owner in the consumer source roster');
  const bodyWords = object(property(config, 'bodyWords'));
  const component = parse(sceneFile);
  const functions: ts.FunctionDeclaration[] = [];
  const collect = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === (kind === 'artifact' ? 'ArtifactsWindow' : 'ProjectWindow')
    )
      functions.push(node);
    ts.forEachChild(node, collect);
  };
  collect(component);
  if (functions.length !== 1) throw new Error('Setup requires one current authored component');
  const openings: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  const collectOpening = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(component) === 'AppWindow'
    )
      openings.push(node);
    ts.forEachChild(node, collectOpening);
  };
  collectOpening(functions[0]!);
  if (openings.length !== 1) throw new Error('Setup requires one current AppWindow');
  const attribute = (name: string) => {
    const attrs = openings[0]!.attributes.properties.filter(
      (node): node is ts.JsxAttribute =>
        ts.isJsxAttribute(node) && node.name.getText(component) === name,
    );
    if (attrs.length !== 1 || !attrs[0]!.initializer)
      throw new Error('Setup requires the actual AppWindow attribute: ' + name);
    return literal(attrs[0]!.initializer!);
  };
  const className = kind === 'artifact' ? 'agi-artifact-responsive' : 'agi-project-responsive';
  if (
    attribute('className') !== className ||
    attribute('label') !== literal(property(config, 'figure'))
  )
    throw new Error('Setup requires current component/class/consumer agreement');
  const scene: PublicFeatureMockupScene = {
    name: 'window-bar-native-' + kind,
    pathname: literal(property(caller, 'pathname')),
    role: 'region',
    region: sourceString(consumer, property(scope, 'region')),
    figure: attribute('label'),
    bodyWords: { selector: literal(property(bodyWords, 'selector')) },
    sourceFiles: [
      ...new Set([
        ...sourceFiles,
        consumerFile,
        sceneFile,
        ownerFile,
        adapterFile,
        literal(property(caller, 'pageFile')),
      ]),
    ],
  };
  return {
    scene,
    title: attribute('title'),
    badge: attribute('badge'),
    className,
    headingId: literal(property(wrapper, 'headingId')),
  };
}

function complete(report: Report) {
  expect(report.findings).toEqual([]);
  expect(report.unmeasured).toEqual([]);
  expect(report.coverage.expectedOwners).toBe(2);
  expect(report.owners.map((owner) => owner.kind)).toEqual(['title', 'badge']);
  expect(report.coverage.expectedTextNodes).toBeGreaterThan(0);
  expect(report.coverage.expectedSourceUnits).toBeGreaterThan(0);
  expect(report.coverage.expectedPaintedGraphemes).toBeGreaterThan(0);
  expect(report.coverage.expectedWords).toBeGreaterThan(0);
  expect(report.coverage.measuredOwners).toBe(report.coverage.expectedOwners);
  expect(report.coverage.measuredTextNodes).toBe(report.coverage.expectedTextNodes);
  expect(report.coverage.mappedSourceUnits).toBe(report.coverage.expectedSourceUnits);
  expect(report.coverage.measuredPaintedGraphemes).toBe(report.coverage.expectedPaintedGraphemes);
  expect(report.coverage.measuredWords).toBe(report.coverage.expectedWords);
  expect(report.coverage.measuredWords).toBe(report.coverage.discoveredWords);
  for (const owner of report.owners) {
    expect(owner.sourceKeys.length).toBeGreaterThan(0);
    expect(owner.words.length).toBeGreaterThan(0);
    for (const word of owner.words) expect(word.bands).toBe(1);
  }
}
const rawBar = (frame: Locator) =>
  frame.evaluate((root) => {
    const bar = root.querySelector(':scope > .agi-dev-shell > .agi-dev-bar');
    if (!bar) throw new Error('Native bar is absent');
    return {
      label: root.getAttribute('aria-label'),
      owners: (['title', 'badge'] as const).map((kind) => {
        const owner = bar.querySelector(':scope > .agi-dev-' + kind);
        if (!owner) throw new Error('Native source owner is absent');
        const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
        const nodeTexts: string[] = [];
        while (walker.nextNode()) nodeTexts.push((walker.currentNode as Text).data);
        return { kind, nodeTexts, text: nodeTexts.join('') };
      }),
    };
  });

async function currentMeasurement(
  page: Page,
  frame: Locator,
  contract: PublicWindowBarSourceContract,
  kind: PublicWindowBarKind,
  pathname: string,
) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const proof = await measurePublicFontProof(page, frame, expectedFonts);
  const typography = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    pathname,
    scopeSelector: contract.scope.selector,
  });
  const report = await measurePublicWindowBarWords(frame, contract, typography, proof, kind);
  return { report, typography, proof, raw: await rawBar(frame) };
}

async function nativeControl(
  kind: PublicWindowBarKind,
  mode: Mode,
  browser: Browser,
  baseURL: string | undefined,
  info: TestInfo,
) {
  const primary = currentScene(kind);
  const scene = { ...primary.scene, name: primary.scene.name + '-' + mode };
  const witness = 'Witnessed window bar control: ' + kind + '/' + mode;
  const readings: Report[] = [];
  let reached = false;
  let collectorEvidence: Record<string, unknown> | undefined;
  const operation = measurePublicFeatureMockup(
    browser,
    baseURL,
    info,
    scene,
    1024,
    'light',
    async (page, evidence) => {
      collectorEvidence = evidence;
      evidence['windowBarControlLimits'] = [
        'Actual caller source and native DOM through the unchanged collector; class/style/source-input mutations are named test fixtures.',
        'Negative controls intentionally stop before capture after their specific native premise and rejection are witnessed.',
        'Raw-source Unicode coverage does not certify transformed uppercase glyphs or native fallback pixels.',
      ];
      const located = await locatePublicFeatureMockup(page, primary.scene);
      try {
        await expect(located.region).toHaveAttribute('aria-labelledby', primary.headingId);
        const contract = await bindPublicWindowBarSources(
          located.frame,
          {
            selector: located.scopeSelector,
            elementIndex: located.ownership.elementIndex,
            tag: located.ownership.tag,
            label: located.ownership.label,
          },
          kind,
        );
        expect(contract.owners[0]!.text).toBe(primary.title);
        expect(contract.owners[1]!.text).toBe(primary.badge);
        evidence['windowBarBoundSources'] = contract;
        return {
          scope: primary.scene,
          preserveScroll: false,
          assertRetained: async (phase: string) => {
            if (phase !== 'before-capture' && phase !== 'after-capture') return;
            const canonical = evidence['typography'] as PublicTypographyReport;
            const proof = evidence['fontProof'] as FontProof;
            const bodyWords = evidence['bodyWords'] as
              Awaited<ReturnType<typeof measurePublicFeatureBodyWords>> | undefined;
            expect(canonical.findings).toEqual([]);
            expect(canonical.unmeasured).toEqual([]);
            expect(canonical.excluded).toEqual([]);
            expect(bodyWords).toBeDefined();
            expect(bodyWords!.findings).toEqual([]);
            expect(bodyWords!.unmeasured).toEqual([]);
            expect(bodyWords!.coverage.owners).toBe(kind === 'artifact' ? 2 : 3);
            expect(bodyWords!.coverage.ordinaryWords).toBeGreaterThan(0);
            expect(proof.expectedFontProof).toHaveLength(2);
            for (const font of proof.expectedFontProof) {
              expect(font.requests).toBeGreaterThan(0);
              expect(font.matchedRequests).toBe(font.requests);
            }
            const baseline = await measurePublicWindowBarWords(
              located.frame,
              contract,
              canonical,
              proof,
              kind,
            );
            complete(baseline);
            const raw = await rawBar(located.frame);
            evidence['windowBarControlBaseline'] = { baseline, raw };
            readings.push(baseline);
            evidence['windowBarControlReadings'] = readings;
            if (kind === 'artifact') {
              expect(await bindArtifactBarSources(located.frame, contract.scope)).toEqual(contract);
              expect(
                await measureArtifactBarWords(located.frame, contract, canonical, proof),
              ).toEqual(baseline);
            }
            if (mode === 'positive') {
              if (phase === 'after-capture') expect(baseline).toEqual(readings[0]);
              return;
            }
            expect(phase).toBe('before-capture');
            if (mode === 'wrong-kind') {
              const other = kind === 'artifact' ? 'project' : 'artifact';
              await expect(
                bindPublicWindowBarSources(located.frame, contract.scope, other),
              ).rejects.toThrow('exact current');
              const report = await measurePublicWindowBarWords(
                located.frame,
                contract,
                canonical,
                proof,
                other,
              );
              expect(report.unmeasured).toContainEqual({
                kind: other + '-bar-current-scope-mismatch',
              });
              expect(report.coverage.measuredOwners).toBe(0);
              const unknown = 'unregistered-fixture' as PublicWindowBarKind;
              await expect(
                bindPublicWindowBarSources(located.frame, contract.scope, unknown),
              ).rejects.toThrow('known Artifact or Project figure kind');
              await expect(
                measurePublicWindowBarWords(located.frame, contract, canonical, proof, unknown),
              ).rejects.toThrow('known Artifact or Project figure kind');
              if (kind === 'project')
                await expect(bindArtifactBarSources(located.frame, contract.scope)).rejects.toThrow(
                  'exact current Artifact figure',
                );
              evidence['windowBarControlMutation'] = { mode, other, report };
            } else if (mode === 'dual-class') {
              const otherClass =
                kind === 'artifact' ? 'agi-project-responsive' : 'agi-artifact-responsive';
              await located.frame.evaluate(
                (root, className) => root.classList.add(className),
                otherClass,
              );
              expect(
                await located.frame.evaluate(
                  (root, className) => root.classList.contains(className),
                  otherClass,
                ),
              ).toBe(true);
              await expect(
                bindPublicWindowBarSources(located.frame, contract.scope, kind),
              ).rejects.toThrow('exact current');
              const report = await measurePublicWindowBarWords(
                located.frame,
                contract,
                canonical,
                proof,
                kind,
              );
              expect(report.unmeasured).toContainEqual({
                kind: kind + '-bar-current-scope-mismatch',
              });
              expect(report.coverage.measuredOwners).toBe(0);
              evidence['windowBarControlMutation'] = { mode, otherClass, report };
            } else if (mode === 'empty-contract') {
              const malformed = { ...contract, owners: [] };
              await expect(
                measurePublicWindowBarWords(located.frame, malformed, canonical, proof, kind),
              ).rejects.toThrow('distinct bound title and badge sources');
              const duplicate = {
                ...contract,
                owners: [
                  contract.owners[0]!,
                  { ...contract.owners[1]!, elementIndex: contract.owners[0]!.elementIndex },
                ],
              };
              await expect(
                measurePublicWindowBarWords(located.frame, duplicate, canonical, proof, kind),
              ).rejects.toThrow('distinct bound title and badge sources');
              evidence['windowBarControlMutation'] = { mode, malformed, duplicate };
            } else if (mode === 'omitted-source') {
              const sourceKey = baseline.owners.find((owner) => owner.kind === 'title')!
                .sourceKeys[0]!;
              const modified = structuredClone(canonical);
              expect(
                modified.samples.filter((sample) => sample.sourceKey === sourceKey),
              ).toHaveLength(1);
              modified.samples = modified.samples.filter(
                (sample) => sample.sourceKey !== sourceKey,
              );
              const report = await measurePublicWindowBarWords(
                located.frame,
                contract,
                modified,
                proof,
                kind,
              );
              expect(report.unmeasured).toContainEqual(
                expect.objectContaining({
                  kind: kind + '-bar-source-not-proven',
                  owner: 'title',
                  sourceKey,
                }),
              );
              expect(report.unmeasured).toContainEqual({
                kind: kind + '-bar-source-coverage-incomplete',
              });
              expect(report.coverage.measuredTextNodes).toBeLessThan(
                report.coverage.expectedTextNodes,
              );
              expect(report.coverage.measuredPaintedGraphemes).toBeLessThan(
                report.coverage.expectedPaintedGraphemes,
              );
              evidence['windowBarControlMutation'] = { mode, sourceKey, modified, report };
              complete(
                await measurePublicWindowBarWords(located.frame, contract, canonical, proof, kind),
              );
            } else {
              const owner = baseline.owners.find((owner) => owner.kind === 'title')!;
              const target = owner.words
                .filter(
                  (word) => word.text.length > 1 && word.rects.length === 1 && word.bands === 1,
                )
                .toSorted((a, b) => b.rects[0]!.width - a.rects[0]!.width)[0];
              if (!target) throw new Error('Word fixture requires a genuine complete native word');
              const glyph = owner.glyphs.find(
                (entry) => entry.end === target.end && entry.rects.length === 1,
              );
              if (!glyph)
                throw new Error('Word fixture requires its genuine final native grapheme');
              const width = target.rects[0]!.width - glyph.rects[0]!.width / 2;
              expect(width).toBeGreaterThan(0);
              await located.frame
                .locator(':scope > .agi-dev-shell > .agi-dev-bar > .agi-dev-title')
                .evaluate((element, width) => {
                  const style = (element as HTMLElement).style;
                  style.flex = '0 0 auto';
                  style.inlineSize = width + 'px';
                  style.maxInlineSize = width + 'px';
                  style.whiteSpace = 'normal';
                  style.wordBreak = 'break-all';
                  style.overflowWrap = 'anywhere';
                  style.overflow = 'visible';
                }, width);
              await located.frame
                .locator(':scope > .agi-dev-shell > .agi-dev-bar')
                .evaluate((element) => {
                  const style = (element as HTMLElement).style;
                  style.blockSize = 'auto';
                  style.flexWrap = 'wrap';
                  style.overflow = 'visible';
                });
              const current = await currentMeasurement(
                page,
                located.frame,
                contract,
                kind,
                primary.scene.pathname,
              );
              const native = await located.frame
                .locator(':scope > .agi-dev-shell > .agi-dev-bar > .agi-dev-title')
                .evaluate(
                  (element, offsets) => {
                    if (element.childNodes.length !== 1 || !(element.firstChild instanceof Text))
                      throw new Error('Word fixture refuses an unknown native source partition');
                    const node = element.firstChild;
                    const range = document.createRange();
                    range.setStart(node, offsets.start);
                    range.setEnd(node, offsets.end);
                    return {
                      source: node.data,
                      text: node.data.slice(offsets.start, offsets.end),
                      rects: [...range.getClientRects()]
                        .filter((rect) => rect.width > 0 && rect.height > 0)
                        .map((rect) => ({
                          top: rect.top,
                          bottom: rect.bottom,
                          left: rect.left,
                          right: rect.right,
                          width: rect.width,
                          height: rect.height,
                        })),
                    };
                  },
                  { start: target.start, end: target.end },
                );
              expect(native.source).toBe(owner.text);
              expect(native.text).toBe(target.text);
              expect(native.rects.length).toBeGreaterThan(1);
              expect(new Set(native.rects.map((rect) => rect.top)).size).toBeGreaterThan(1);
              expect(current.raw).toEqual(raw);
              expect(current.report.findings).toContainEqual(
                expect.objectContaining({
                  kind: kind + '-bar-word-split',
                  owner: 'title',
                  text: target.text,
                }),
              );
              expect(current.report.unmeasured).toEqual([]);
              expect(
                current.report.findings.every(
                  (issue) => issue.kind === kind + '-bar-word-split' && issue.owner === 'title',
                ),
              ).toBe(true);
              expect(current.report.coverage.measuredWords).toBe(
                current.report.coverage.expectedWords,
              );
              expect(current.report.coverage.measuredPaintedGraphemes).toBe(
                current.report.coverage.expectedPaintedGraphemes,
              );
              evidence['windowBarControlMutation'] = {
                mode,
                target,
                glyph,
                width,
                native,
                current,
              };
            }
            expect(await rawBar(located.frame)).toEqual(raw);
            reached = true;
            evidence['windowBarControlWitness'] = witness;
            throw new Error(witness);
          },
        };
      } finally {
        await located.frameHandle.dispose();
      }
    },
  );
  if (mode === 'positive') await operation;
  else await expect(operation).rejects.toThrow(witness);
  expect(reached).toBe(mode !== 'positive');
  const reports = info.attachments.filter(
    (attachment) => attachment.name === 'feature-mockup.json',
  );
  expect(reports).toHaveLength(1);
  const attachment = reports[0]!;
  if (
    attachment.path !== undefined ||
    !Buffer.isBuffer(attachment.body) ||
    attachment.contentType !== 'application/json'
  )
    throw new Error('Native collector report requires its genuine Buffer body attachment');
  const bytes = attachment.body;
  const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  expect(raw['scene']).toEqual(scene);
  expect(raw['repeatEachIndex']).toBe(info.repeatEachIndex);
  expect(raw['width']).toBe(1024);
  expect(raw['theme']).toBe('light');
  expect(raw['status']).toBe(mode === 'positive' ? 'passed' : 'failed');
  if (mode !== 'positive') expect(raw['error']).toBe(witness);
  if (!collectorEvidence) throw new Error('Native collector preparation evidence is absent');
  for (const field of [
    'frameHandleDisposeError',
    'contextCloseError',
    'sourceEndError',
    'reportAttachError',
  ]) {
    expect(Object.hasOwn(raw, field), 'Attached collector finalization error: ' + field).toBe(
      false,
    );
    expect(
      Object.hasOwn(collectorEvidence, field),
      'Live collector finalization error: ' + field,
    ).toBe(false);
  }
  expect(raw['contextClosed']).toBe(true);
  expect(raw['sourceUnchanged']).toBe(true);
  expect(raw['sourceEnd']).toEqual(raw['sourceStart']);
  for (const [file, hash] of Object.entries(raw['sourceStart'] as Record<string, string>))
    expect(hash, file).toBe(
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    );
  expect(Object.hasOwn(raw['sourceStart'] as object, ownerFile)).toBe(true);
  expect(info.errors).toEqual([]);
}

for (const kind of ['artifact', 'project'] as const) {
  for (const mode of [
    'positive',
    'wrong-kind',
    'dual-class',
    'empty-contract',
    'omitted-source',
    'word-split',
  ] as const) {
    test('actual native ' + kind + ' bar ' + mode, async ({ browser, baseURL }, info) => {
      await nativeControl(kind, mode, browser, baseURL, info);
    });
  }
}
