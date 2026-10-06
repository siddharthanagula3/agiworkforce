import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { publicCapturePngDimensions } from './lib/public-viewport-strip-capture';
import { expect, test } from '@playwright/test';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  scopePublicFadedText,
  type PublicFeatureMockupScope,
} from './lib/public-feature-mockup';

const figure = 'Example fixture awaiting approval';
const region = 'Feature fixture';
const mainScope = { role: 'main', figure } as const;
const regionScope = { role: 'region', region, figure } as const;
const articleScope = { role: 'article', region, figure } as const;
const frame = `<figure id="expected-frame" aria-label="${figure}" data-fixture-frame><p>Fixture text</p></figure>`;

const successfulScopes: {
  name: string;
  scope: PublicFeatureMockupScope;
  html: string;
}[] = [
  {
    name: 'native main without an id',
    scope: mainScope,
    html: `<main data-fixture-owner>${frame}</main>`,
  },
  {
    name: 'native main with an id',
    scope: mainScope,
    html: `<main id="fixture-main" data-fixture-owner>${frame}</main>`,
  },
  {
    name: 'explicit div main without an id',
    scope: mainScope,
    html: `<div role="main" data-fixture-owner>${frame}</div>`,
  },
  {
    name: 'explicit div main with an id',
    scope: mainScope,
    html: `<div id="fixture-main" role="main" data-fixture-owner>${frame}</div>`,
  },
  {
    name: 'existing labelled region',
    scope: regionScope,
    html: `<section role="region" aria-labelledby="fixture-heading" data-fixture-owner><h2 id="fixture-heading">${region}</h2>${frame}</section>`,
  },
  {
    name: 'existing labelled article',
    scope: articleScope,
    html: `<article aria-labelledby="fixture-heading" data-fixture-owner><h2 id="fixture-heading">${region}</h2>${frame}</article>`,
  },
];

for (const fixture of successfulScopes) {
  test(`the strict locator accepts ${fixture.name}`, async ({ page }) => {
    await page.setContent(fixture.html);
    const located = await locatePublicFeatureMockup(page, fixture.scope);
    try {
      await expect(located.region).toHaveCount(1);
      await expect(located.frame).toHaveCount(1);
      expect(
        await located.region.evaluate(
          (root) => root === document.querySelector('[data-fixture-owner]'),
        ),
      ).toBe(true);
      const independent = await located.frameHandle.evaluate((root, selector) => {
        const matches = [...document.querySelectorAll(selector)];
        return {
          expectedFrame: root === document.getElementById('expected-frame'),
          expectedOwnerContains:
            document.querySelector('[data-fixture-owner]')?.contains(root) === true,
          connected: root.isConnected,
          matches: matches.length,
          sameElement: matches.length === 1 && matches[0] === root,
          elementIndex: [...document.querySelectorAll('*')].indexOf(root),
          tag: root.localName,
          label: root.getAttribute('aria-label'),
        };
      }, located.scopeSelector);
      expect(independent.expectedFrame).toBe(true);
      expect(independent.expectedOwnerContains).toBe(true);
      expect(independent.connected).toBe(true);
      expect(independent.matches).toBe(1);
      expect(independent.sameElement).toBe(true);
      expect(located.ownership).toEqual({
        selector: located.scopeSelector,
        matches: independent.matches,
        sameElement: independent.sameElement,
        connected: independent.connected,
        elementIndex: independent.elementIndex,
        tag: independent.tag,
        label: independent.label,
      });
    } finally {
      await located.frameHandle.dispose();
    }
  });
}

const rejectedScopes: {
  name: string;
  scope: PublicFeatureMockupScope;
  html: string;
  frames: number;
  error: RegExp;
}[] = [
  {
    name: 'missing main',
    scope: mainScope,
    html: `<aside>${frame}</aside>`,
    frames: 1,
    error: /Feature mockup must have exactly one role owner/,
  },
  {
    name: 'missing figure',
    scope: mainScope,
    html: '<main><p>Fixture without a figure</p></main>',
    frames: 0,
    error: /Feature mockup must have exactly one figure in its role owner/,
  },
  {
    name: 'duplicate figure in one main',
    scope: mainScope,
    html: `<main>${frame}<figure aria-label="${figure}" data-fixture-frame><p>Duplicate fixture</p></figure></main>`,
    frames: 2,
    error: /Feature mockup must have exactly one figure in its role owner/,
  },
  {
    name: 'matching figure outside the wrong main',
    scope: mainScope,
    html: `<main><figure aria-label="A different fixture" data-fixture-frame><p>Wrong fixture</p></figure></main><aside>${frame}</aside>`,
    frames: 2,
    error: /Feature mockup must have exactly one figure in its role owner/,
  },
  {
    name: 'CSS scope borrowing a figure from an outside hidden main',
    scope: mainScope,
    html: `<main><div id="expected-frame" role="figure" aria-label="${figure}" data-fixture-frame><p>Role-located fixture</p></div></main><main aria-hidden="true"><figure aria-label="${figure}" data-fixture-frame><p>Outside native figure</p></figure></main>`,
    frames: 2,
    error: /Feature mockup CSS scope must own the role-located figure/,
  },
  {
    name: 'duplicate visible main',
    scope: mainScope,
    html: `<main>${frame}</main><main><figure aria-label="${figure}" data-fixture-frame><p>Second main fixture</p></figure></main>`,
    frames: 2,
    error: /Feature mockup must have exactly one role owner/,
  },
  {
    name: 'duplicate CSS owner id outside the role main',
    scope: mainScope,
    html: `<div id="shared-owner" role="main">${frame}</div><div id="shared-owner"><figure aria-label="${figure}" data-fixture-frame><p>Outside CSS match</p></figure></div>`,
    frames: 2,
    error: /Feature mockup CSS scope must match exactly one figure/,
  },
  {
    name: 'labelled region without a canonical heading owner',
    scope: regionScope,
    html: `<section role="region" aria-label="${region}">${frame}</section>`,
    frames: 1,
    error: /Frame region has no canonical heading owner/,
  },
];

for (const fixture of rejectedScopes) {
  test(`the strict locator rejects ${fixture.name}`, async ({ page }) => {
    await page.setContent(fixture.html);
    await expect(page.locator('[data-fixture-frame]')).toHaveCount(fixture.frames);
    await expect(locatePublicFeatureMockup(page, fixture.scope)).rejects.toThrow(fixture.error);
  });
}

function researchCollectorControlScene(name: string) {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const callerFile = 'apps/web/e2e/public-research-mockup.spec.ts';
  const callerSource = readFileSync(path.join(repositoryRoot, callerFile), 'utf8');
  const sourceMatches = [...callerSource.matchAll(/sourceFiles:\s*\[([^\]]*)\]/gu)];
  expect(sourceMatches, 'The current Research source-file contract must be unique').toHaveLength(1);
  const sourceBody = sourceMatches[0]![1]!;
  const literalPaths = [...sourceBody.matchAll(/'([^'\r\n]+)'/gu)];
  expect(sourceBody.replace(/'[^'\r\n]+'/gu, '').replace(/[\s,]/gu, '')).toBe('');
  const sourceFiles = literalPaths.map((match) => match[1]!);
  expect(sourceFiles.length).toBeGreaterThan(0);
  expect(new Set(sourceFiles).size).toBe(sourceFiles.length);
  return {
    name,
    pathname: '/features/deep-research',
    role: 'main',
    figure: 'Example Web research plan awaiting approval',
    bodyWords: { selector: '.agi-sc-research-plan p, .agi-sc-research-steps li' },
    sourceFiles: [...sourceFiles, callerFile],
  } as const;
}

test('the actual collector rejects a preparation that replaces its requested Research figure', async ({
  browser,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error('The collector control requires the running public site');
  const scene = researchCollectorControlScene('research-preparation-figure-control');
  const requestedFigure = scene.figure;
  const wrongFigure = 'Native copied Research figure for the prepared-scope control';
  const reports: Record<string, unknown>[] = [];
  const collectorInfo = new Proxy(testInfo, {
    get(target, property) {
      if (property === 'attach') {
        return async (...args: Parameters<typeof testInfo.attach>) => {
          await target.attach(...args);
          if (args[0] === 'feature-mockup.json') {
            const body = args[1]?.body;
            if (!body) throw new Error('The collector must attach its raw JSON report');
            reports.push(JSON.parse(body.toString()) as Record<string, unknown>);
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  let collectorReturned = false;
  let collectorError: unknown;
  try {
    await measurePublicFeatureMockup(
      browser,
      baseURL,
      collectorInfo,
      scene,
      320,
      'light',
      async (page, evidence) => {
        const located = await locatePublicFeatureMockup(page, scene);
        try {
          const swap = await located.frame.evaluate((root, label) => {
            const rectOf = (element: Element) => {
              const rect = element.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            };
            const stylesOf = (element: Element) => {
              const style = getComputedStyle(element);
              return [...style].map((property) => [property, style.getPropertyValue(property)]);
            };
            const parent = root.parentElement;
            const before = {
              label: root.getAttribute('aria-label'),
              className: root.getAttribute('class'),
              rect: rectOf(root),
              style: stylesOf(root),
              html: root.innerHTML,
            };
            const clone = root.cloneNode(true) as Element;
            clone.setAttribute('aria-label', label);
            root.replaceWith(clone);
            return {
              before,
              after: {
                label: clone.getAttribute('aria-label'),
                className: clone.getAttribute('class'),
                rect: rectOf(clone),
                style: stylesOf(clone),
                html: clone.innerHTML,
              },
              originalConnected: root.isConnected,
              cloneConnected: clone.isConnected,
              sameParent: clone.parentElement === parent,
            };
          }, wrongFigure);
          evidence['preparationFigureSwap'] = swap;
          expect(swap.before.label).toBe(requestedFigure);
          expect(swap.after.label).toBe(wrongFigure);
          expect(swap.originalConnected).toBe(false);
          expect(swap.cloneConnected).toBe(true);
          expect(swap.sameParent).toBe(true);
          expect(swap.after.className).toBe(swap.before.className);
          expect(swap.after.rect).toEqual(swap.before.rect);
          expect(swap.after.style).toEqual(swap.before.style);
          expect(swap.after.html).toBe(swap.before.html);
        } finally {
          await located.frameHandle.dispose();
        }
        const observations: unknown[] = [];
        evidence['preparedFigureControl'] = observations;
        const assertRetained = async (phase: string) => {
          const requested = page.getByRole('figure', {
            name: requestedFigure,
            exact: true,
            includeHidden: true,
          });
          const wrong = page.getByRole('figure', {
            name: wrongFigure,
            exact: true,
            includeHidden: true,
          });
          const state = {
            phase,
            requestedCount: await requested.count(),
            preparedCount: await wrong.count(),
            prepared: await wrong.evaluate((root) => ({
              connected: root.isConnected,
              label: root.getAttribute('aria-label'),
            })),
          };
          observations.push(state);
          expect(state.requestedCount).toBe(0);
          expect(state.preparedCount).toBe(1);
          expect(state.prepared).toEqual({ connected: true, label: wrongFigure });
        };
        await assertRetained('prepared');
        return {
          scope: { role: 'main', figure: wrongFigure },
          preserveScroll: false,
          assertRetained,
        };
      },
    );
    collectorReturned = true;
  } catch (error) {
    collectorError = error;
  }
  expect(reports, 'The actual collector must retain one raw report').toHaveLength(1);
  const report = reports[0]!;
  expect(report['contextClosed']).toBe(true);
  expect(report['sourceUnchanged']).toBe(true);
  expect(report['scene']).toEqual(scene);
  expect(report['resolvedScope']).toEqual({ role: 'main', figure: wrongFigure });
  expect(report['preparedFigureControl']).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ phase: 'prepared', requestedCount: 0, preparedCount: 1 }),
    ]),
  );
  await testInfo.attach('prepared-figure-control-outcome.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          collectorReturned,
          collectorError:
            collectorError instanceof Error ? collectorError.message : String(collectorError),
          status: report['status'],
          requestedFigure,
          measuredLabel: (report['reading'] as { label?: string } | undefined)?.label ?? null,
          resolvedScope: report['resolvedScope'],
          contextClosed: report['contextClosed'],
          sourceUnchanged: report['sourceUnchanged'],
          limits:
            'Only the real DOM clone label changes; native CSS, fonts, active state, capture and all measurements belong to the actual collector. No native before/after outcome has been established by the source draft.',
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
  expect(
    collectorReturned,
    'A wrong prepared figure must not receive a passing collector result',
  ).toBe(false);
  expect(collectorError).toBeInstanceOf(Error);
  expect((collectorError as Error).message).toBe(
    'Prepared feature scope must keep the requested figure',
  );
  expect(report['status']).toBe('failed');
  expect(report['reading']).toBeUndefined();
});

for (const mode of ['positive', 'wrong-source', 'wrong-copy'] as const) {
  test(`the actual collector ${mode} native copied-path PNG attachment`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    if (!baseURL) throw new Error('The attachment control requires the running public site');
    const scene = researchCollectorControlScene(`research-native-attachment-${mode}`);
    const reports: Record<string, unknown>[] = [];
    const attachments: {
      name: string;
      nativeOriginalPath: string;
      delegatedPath: string | null;
      copiedPath: string | null;
      bodyRetained: boolean;
      originalHash: string;
      copiedHash: string | null;
      originalDimensions: { width: number; height: number };
      copiedDimensions: { width: number; height: number } | null;
      copiedMatchedOriginalBeforeFault: boolean | null;
      copiedMatchesOriginal: boolean | null;
      faultApplied: boolean;
    }[] = [];
    let alternateNativePath: string | undefined;
    let alternateNativeBytes: Buffer | undefined;
    let faultApplied = false;
    const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    const collectorInfo = new Proxy(testInfo, {
      get(target, property) {
        if (property === 'attach') {
          return async (...args: Parameters<typeof testInfo.attach>) => {
            const [name, options] = args;
            if (/^frame-strip-\d+\.png$/u.test(name)) {
              const nativeOriginalPath = target.outputPath(name);
              const originalBytes = readFileSync(nativeOriginalPath);
              const originalDimensions = publicCapturePngDimensions(originalBytes);
              let delegated = options;
              let thisFault = false;
              if (options?.path) {
                expect(options.path).toBe(nativeOriginalPath);
                expect(options.body).toBeUndefined();
                if (mode === 'wrong-source' && !faultApplied) {
                  if (!alternateNativePath || !alternateNativeBytes)
                    throw new Error('A distinct native PNG is required for the source-path fault');
                  expect(alternateNativeBytes.equals(originalBytes)).toBe(false);
                  delegated = { path: alternateNativePath, contentType: 'image/png' };
                  thisFault = faultApplied = true;
                }
              }
              const attachmentIndex = target.attachments.length;
              await target.attach(name, delegated);
              expect(target.attachments.length).toBe(attachmentIndex + 1);
              const attachment = target.attachments[attachmentIndex]!;
              let copiedMatchedOriginalBeforeFault: boolean | null = null;
              if (mode === 'wrong-copy' && !faultApplied && options?.path && attachment.path) {
                if (!alternateNativeBytes)
                  throw new Error('A distinct native PNG is required for the copied-path fault');
                const copiedBefore = readFileSync(attachment.path);
                copiedMatchedOriginalBeforeFault = copiedBefore.equals(originalBytes);
                expect(copiedMatchedOriginalBeforeFault).toBe(true);
                expect(alternateNativeBytes.equals(originalBytes)).toBe(false);
                writeFileSync(attachment.path, alternateNativeBytes);
                thisFault = faultApplied = true;
              }
              const copiedBytes = attachment.path ? readFileSync(attachment.path) : null;
              attachments.push({
                name,
                nativeOriginalPath,
                delegatedPath: delegated?.path ?? null,
                copiedPath: attachment.path ?? null,
                bodyRetained: attachment.body !== undefined,
                originalHash: digest(originalBytes),
                copiedHash: copiedBytes ? digest(copiedBytes) : null,
                originalDimensions,
                copiedDimensions: copiedBytes ? publicCapturePngDimensions(copiedBytes) : null,
                copiedMatchedOriginalBeforeFault,
                copiedMatchesOriginal: copiedBytes ? copiedBytes.equals(originalBytes) : null,
                faultApplied: thisFault,
              });
              return;
            }
            await target.attach(...args);
            if (name === 'feature-mockup.json') {
              const body = options?.body;
              if (!body) throw new Error('The collector must attach its raw JSON report');
              reports.push(JSON.parse(body.toString()) as Record<string, unknown>);
            }
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    let collectorReturned = false;
    let collectorError: unknown;
    try {
      await measurePublicFeatureMockup(
        browser,
        baseURL,
        collectorInfo,
        scene,
        320,
        'light',
        async (page, evidence) => {
          if (mode !== 'positive') {
            alternateNativePath = testInfo.outputPath('different-native-viewport.png');
            await page.screenshot({
              path: alternateNativePath,
              type: 'png',
              fullPage: false,
              scale: 'css',
              animations: 'allow',
              caret: 'initial',
            });
            alternateNativeBytes = readFileSync(alternateNativePath);
            const dimensions = publicCapturePngDimensions(alternateNativeBytes);
            expect(dimensions).toEqual(page.viewportSize());
            evidence['alternateNativePng'] = {
              path: alternateNativePath,
              dimensions,
              hash: digest(alternateNativeBytes),
            };
          }
          const observations: unknown[] = [];
          evidence['attachmentControlFigure'] = observations;
          const assertRetained = async (phase: string) => {
            const frame = page.getByRole('main').getByRole('figure', {
              name: scene.figure,
              exact: true,
              includeHidden: true,
            });
            await expect(frame).toHaveCount(1);
            const state = await frame.evaluate((root) => ({
              connected: root.isConnected,
              label: root.getAttribute('aria-label'),
            }));
            observations.push({ phase, ...state });
            expect(state).toEqual({ connected: true, label: scene.figure });
          };
          await assertRetained('prepared');
          return { scope: scene, preserveScroll: false, assertRetained };
        },
      );
      collectorReturned = true;
    } catch (error) {
      collectorError = error;
    }
    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report['contextClosed']).toBe(true);
    expect(report['sourceUnchanged']).toBe(true);
    await testInfo.attach(`native-${mode}-attachment-control.json`, {
      body: Buffer.from(
        JSON.stringify(
          {
            mode,
            collectorReturned,
            collectorError:
              collectorError instanceof Error ? collectorError.message : String(collectorError),
            collectorStatus: report['status'],
            faultApplied,
            attachments,
            limits:
              'All PNGs come from native screenshot files and actual testInfo.attach normalization. The source draft establishes no before/after outcome, memory size, OOM cause or product acceptance.',
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    expect(attachments.length, 'Actual collector PNG attachments are required').toBeGreaterThan(0);
    if (mode === 'positive') {
      expect(collectorReturned).toBe(true);
      expect(collectorError).toBeUndefined();
      expect(report['status']).toBe('passed');
      expect(faultApplied).toBe(false);
      for (const attachment of attachments) {
        expect(attachment.bodyRetained).toBe(false);
        expect(attachment.delegatedPath).toBe(attachment.nativeOriginalPath);
        expect(attachment.copiedPath).not.toBeNull();
        expect(attachment.copiedPath).not.toBe(attachment.nativeOriginalPath);
        expect(attachment.copiedMatchesOriginal).toBe(true);
        expect(attachment.copiedHash).toBe(attachment.originalHash);
        expect(attachment.copiedDimensions).toEqual(attachment.originalDimensions);
      }
      expect(report['viewportCapture']).toEqual(
        expect.objectContaining({ restored: true, failures: [] }),
      );
    } else {
      expect(
        faultApplied,
        'The actual delegated path and native copied-file fault must be exercised',
      ).toBe(true);
      expect(collectorReturned).toBe(false);
      expect(collectorError).toBeInstanceOf(Error);
      expect((collectorError as Error).message).toBe(
        'Viewport strip copied attachment differs from the original PNG',
      );
      expect(report['status']).toBe('failed');
      const fault = attachments.find((attachment) => attachment.faultApplied)!;
      expect(fault.bodyRetained).toBe(false);
      expect(fault.copiedMatchesOriginal).toBe(false);
      expect(fault.copiedHash).not.toBe(fault.originalHash);
      if (mode === 'wrong-copy') expect(fault.copiedMatchedOriginalBeforeFault).toBe(true);
    }
  });
}

for (const mode of [
  'prepare-false',
  'prepare-undefined',
  'primary-and-attachment',
  'attachment-only',
] as const) {
  test(`the actual collector preserves the ${mode} native failure`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    if (!baseURL) throw new Error('The failure control requires the running public site');
    const scene = researchCollectorControlScene(`research-native-failure-${mode}`);
    const primary = new Error(`Native preparation primary for ${mode}`);
    const secondary = new Error(`Native delegated JSON attachment secondary for ${mode}`);
    const rejectsPreparation = mode !== 'attachment-only';
    const rejectedValue =
      mode === 'prepare-false' ? false : mode === 'prepare-undefined' ? undefined : primary;
    const rejectsAttachment = mode === 'primary-and-attachment' || mode === 'attachment-only';
    const reports: Record<string, unknown>[] = [];
    const jsonDelegations: {
      attachmentIndex: number;
      name: string;
      contentType: string;
      retainedBodyMatches: boolean;
      secondaryThrown: boolean;
    }[] = [];
    let liveEvidence: Record<string, unknown> | undefined;
    let nativeContext: import('@playwright/test').BrowserContext | undefined;
    let nativeCloseObserved = false;
    let prepareReached = false;
    let rejectionIssued = false;
    let attachmentFaultApplied = false;
    const originalContexts = browser.contexts();
    const collectorInfo = new Proxy(testInfo, {
      get(target, property) {
        if (property === 'attach') {
          return async (...args: Parameters<typeof testInfo.attach>) => {
            const attachmentIndex = target.attachments.length;
            await target.attach(...args);
            if (args[0] !== 'feature-mockup.json') return;
            const body = args[1]?.body;
            if (!body) throw new Error('The actual collector must attach its raw JSON report');
            expect(target.attachments.length).toBe(attachmentIndex + 1);
            const attachment = target.attachments[attachmentIndex]!;
            const supplied = Buffer.isBuffer(body) ? body : Buffer.from(body);
            const retainedBodyMatches = attachment.body?.equals(supplied) === true;
            reports.push(JSON.parse(supplied.toString()) as Record<string, unknown>);
            const delegation = {
              attachmentIndex,
              name: attachment.name,
              contentType: attachment.contentType,
              retainedBodyMatches,
              secondaryThrown: false,
            };
            jsonDelegations.push(delegation);
            expect(attachment.name).toBe('feature-mockup.json');
            expect(attachment.contentType).toBe('application/json');
            expect(retainedBodyMatches).toBe(true);
            if (rejectsAttachment) {
              delegation.secondaryThrown = true;
              attachmentFaultApplied = true;
              throw secondary;
            }
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    let collectorReturned = false;
    let collectorCaught = false;
    let collectorError: unknown;
    try {
      await measurePublicFeatureMockup(
        browser,
        baseURL,
        collectorInfo,
        scene,
        320,
        'light',
        async (page, evidence) => {
          liveEvidence = evidence;
          prepareReached = true;
          nativeContext = page.context();
          nativeContext.once('close', () => {
            nativeCloseObserved = true;
          });
          const located = await locatePublicFeatureMockup(page, scene);
          try {
            const nativeFigure = await located.frame.evaluate((root) => {
              const rect = root.getBoundingClientRect();
              return {
                connected: root.isConnected,
                label: root.getAttribute('aria-label'),
                width: rect.width,
                height: rect.height,
              };
            });
            evidence['nativeFailureFigure'] = nativeFigure;
            expect(nativeFigure.connected).toBe(true);
            expect(nativeFigure.label).toBe(scene.figure);
            expect(nativeFigure.width).toBeGreaterThan(0);
            expect(nativeFigure.height).toBeGreaterThan(0);
          } finally {
            await located.frameHandle.dispose();
          }
          evidence['prepareFailureControl'] = {
            mode,
            rejectionIssued: rejectsPreparation,
            rejectedType: rejectsPreparation ? typeof rejectedValue : null,
            rejectedString: rejectsPreparation ? String(rejectedValue) : null,
            rejectedIsError: rejectsPreparation && rejectedValue instanceof Error,
          };
          if (rejectsPreparation) {
            rejectionIssued = true;
            return Promise.reject(rejectedValue);
          }
          const observations: unknown[] = [];
          evidence['failureControlFigureRetained'] = observations;
          const assertRetained = async (phase: string) => {
            const located = await locatePublicFeatureMockup(page, scene);
            try {
              const state = await located.frame.evaluate((root) => ({
                connected: root.isConnected,
                label: root.getAttribute('aria-label'),
              }));
              observations.push({ phase, ...state });
              expect(state).toEqual({ connected: true, label: scene.figure });
            } finally {
              await located.frameHandle.dispose();
            }
          };
          await assertRetained('prepared');
          return { scope: scene, preserveScroll: false, assertRetained };
        },
      );
      collectorReturned = true;
    } catch (error) {
      collectorCaught = true;
      collectorError = error;
    }
    const report = reports[0];
    await testInfo.attach(`native-${mode}-failure-control.json`, {
      body: Buffer.from(
        JSON.stringify(
          {
            mode,
            prepareReached,
            rejectionIssued,
            rejectedType: rejectsPreparation ? typeof rejectedValue : null,
            rejectedString: rejectsPreparation ? String(rejectedValue) : null,
            collectorReturned,
            collectorCaught,
            caught: {
              type: typeof collectorError,
              isError: collectorError instanceof Error,
              stringValue: String(collectorError),
              message: collectorError instanceof Error ? collectorError.message : null,
              samePrimary: collectorError === primary,
              sameSecondary: collectorError === secondary,
            },
            attachmentFaultApplied,
            jsonDelegations,
            rawReportStatusBeforeAttachmentReturn: report?.['status'] ?? null,
            rawReportErrorBeforeAttachmentReturn: report?.['error'] ?? null,
            finalCollectorEvidence: liveEvidence && {
              status: liveEvidence['status'],
              error: liveEvidence['error'],
              reportAttachError: liveEvidence['reportAttachError'] ?? null,
              contextClosed: liveEvidence['contextClosed'],
              sourceUnchanged: liveEvidence['sourceUnchanged'],
            },
            nativeCloseObserved,
            nativeContextStillListed: nativeContext
              ? browser.contexts().includes(nativeContext)
              : null,
            originalContextsRetained: originalContexts.every((context) =>
              browser.contexts().includes(context),
            ),
            limits:
              'The actual collector owns all readiness, source and measurement logic. JSON is genuinely delegated before the controlled secondary throw. Its already-attached snapshot precedes attachment completion and is not final passing acceptance for attachment-only failure. Direct prepare rejection does not exercise collector-owned frame-handle disposal. No native before/after outcome is established by this source draft.',
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    expect(prepareReached).toBe(true);
    expect(rejectionIssued).toBe(rejectsPreparation);
    expect(reports).toHaveLength(1);
    expect(jsonDelegations).toHaveLength(1);
    expect(attachmentFaultApplied).toBe(rejectsAttachment);
    expect(nativeContext).toBeDefined();
    expect(nativeCloseObserved).toBe(true);
    expect(browser.contexts()).not.toContain(nativeContext);
    for (const context of originalContexts) expect(browser.contexts()).toContain(context);
    expect(report?.['contextClosed']).toBe(true);
    expect(report?.['sourceUnchanged']).toBe(true);
    expect(report?.['sourceEnd']).toEqual(report?.['sourceStart']);
    expect(liveEvidence?.['contextClosed']).toBe(true);
    expect(liveEvidence?.['sourceUnchanged']).toBe(true);
    expect(collectorReturned).toBe(false);
    expect(collectorCaught).toBe(true);
    expect(collectorError).toBeInstanceOf(Error);
    expect(liveEvidence?.['status']).toBe('failed');
    const expectedMessage =
      mode === 'prepare-false'
        ? 'false'
        : mode === 'prepare-undefined'
          ? 'undefined'
          : mode === 'primary-and-attachment'
            ? primary.message
            : secondary.message;
    expect((collectorError as Error).message).toBe(expectedMessage);
    expect(liveEvidence?.['error']).toBe(expectedMessage);
    if (rejectsPreparation) {
      expect(report?.['status']).toBe('failed');
      expect(report?.['error']).toBe(expectedMessage);
      expect(report?.['reading']).toBeUndefined();
    } else {
      expect(collectorError).toBe(secondary);
      expect(report?.['error']).toBeUndefined();
      expect(report?.['reading']).toBeDefined();
      expect(report?.['viewportCapture']).toEqual(
        expect.objectContaining({ restored: true, failures: [] }),
      );
      expect(report?.['bodyWords']).toEqual(
        expect.objectContaining({ findings: [], unmeasured: [] }),
      );
    }
    if (mode === 'primary-and-attachment') expect(collectorError).toBe(primary);
    if (rejectsAttachment) expect(liveEvidence?.['reportAttachError']).toBe(String(secondary));
    else expect(liveEvidence?.['reportAttachError']).toBeUndefined();
  });
}

const fadeSamples = [
  { text: 'Opaque', paintUnmeasured: [] as string[] },
  { text: 'Faded', paintUnmeasured: ['mask-fade'] },
  { text: 'Filtered', paintUnmeasured: ['filter'] },
];
const figureFade = 'linear-gradient(rgb(28, 21, 11) 58%, rgba(0, 0, 0, 0) 100%)';
const bentoFade = 'linear-gradient(rgb(245, 240, 230) 50%, rgba(0, 0, 0, 0) 96%)';

for (const mask of [figureFade, bentoFade]) {
  test(`contrast scope excludes only faded text under the approved figure fade ${mask}`, () => {
    expect(
      scopePublicFadedText(fadeSamples, [{ selector: 'figure.agi-dev', mask, frame: true }]),
    ).toEqual({
      opaque: [fadeSamples[0], fadeSamples[2]],
      faded: [fadeSamples[1]],
      unapprovedMasks: [],
      unexplainedFaded: [],
    });
  });
}

for (const rejected of [
  {
    name: 'a fade with unapproved stops on the figure',
    masks: [
      {
        selector: 'figure.agi-dev',
        mask: 'linear-gradient(rgb(28, 21, 11) 10%, rgba(0, 0, 0, 0) 20%)',
        frame: true,
      },
    ],
    unexplained: false,
  },
  {
    name: 'a non-gradient mask on the figure',
    masks: [
      {
        selector: 'figure.agi-dev',
        mask: 'radial-gradient(rgb(28, 21, 11) 58%, rgba(0, 0, 0, 0) 100%)',
        frame: true,
      },
    ],
    unexplained: false,
  },
  {
    name: 'the approved fade on a descendant',
    masks: [{ selector: 'div.agi-dev-body', mask: figureFade, frame: false }],
    unexplained: true,
  },
  {
    name: 'the approved fade on the figure with a second mask inside it',
    masks: [
      { selector: 'figure.agi-dev', mask: figureFade, frame: true },
      { selector: 'div.agi-mk-thread', mask: figureFade, frame: false },
    ],
    unexplained: false,
  },
]) {
  test(`contrast scope rejects ${rejected.name}`, () => {
    const scope = scopePublicFadedText(fadeSamples, rejected.masks);
    expect(scope.unapprovedMasks).toEqual([rejected.masks.at(-1)]);
    expect(scope.unexplainedFaded).toEqual(rejected.unexplained ? [fadeSamples[1]] : []);
    expect(scope.faded).toEqual([fadeSamples[1]]);
  });
}

test('contrast scope rejects faded text when nothing masks the figure', () => {
  const scope = scopePublicFadedText(fadeSamples, []);
  expect(scope.unapprovedMasks).toEqual([]);
  expect(scope.unexplainedFaded).toEqual([fadeSamples[1]]);
});
