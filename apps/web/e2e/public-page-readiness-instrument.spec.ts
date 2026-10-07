import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import {
  measurePublicFontProof,
  PublicReadinessFontError,
  settlePublicPage,
} from './lib/public-page-readiness';

test.use({ screenshot: 'off', video: 'off', trace: 'off' });
const route = {
  path: 'http://public-fixture.invalid/fixture',
  expectedHttpStatuses: [200],
  expectedFinalPath: '/fixture',
  expectedOrigin: 'http://public-fixture.invalid',
  expectedQuery: '',
};
const budgets = { navigationTimeout: 1500, readinessTimeout: 1000, intervalMs: 20, samples: 5 };

async function documentFixture(page: Page, html: string, status = 200) {
  await page.route('http://public-fixture.invalid/**', async (request) => {
    await request.fulfill({ status, contentType: 'text/html; charset=utf-8', body: html });
  });
}

test('readiness accepts a settled page and retains its response and geometry', async ({ page }) => {
  await documentFixture(page, '<main>Painted public content</main>');
  const report = await settlePublicPage(page, route, budgets);
  expect(report.httpStatus).toBe(200);
  expect(report.finalPath).toBe('/fixture');
  expect(report.pendingControls).toEqual([]);
  expect(report.fonts).toBe('loaded');
  expect(report.width).toBeGreaterThan(0);
});

test('HTTP failure cannot masquerade as measured public content', async ({ page }) => {
  await documentFixture(page, '<main>Painted error</main>', 500);
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow();
});

test('a redirect cannot count as proof of the requested page', async ({ page }) => {
  await page.route('http://public-fixture.invalid/**', async (request) => {
    if (new URL(request.request().url()).pathname === '/fixture') {
      await request.fulfill({ status: 302, headers: { location: '/elsewhere' } });
    } else {
      await request.fulfill({
        contentType: 'text/html',
        body: '<main>Different public content</main>',
      });
    }
  });
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow();
});

test('an empty or whitespace-only main cannot pass readiness', async ({ page }) => {
  await documentFixture(page, '<main> \n </main>');
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow();
});

test('a visible busy state remains an explicit measurement failure', async ({ page }) => {
  await documentFixture(page, '<main aria-busy="true">Loading public content</main>');
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow('Visible loading state');
});

test('incomplete stability cannot produce a green readiness report', async ({ page }) => {
  await documentFixture(
    page,
    '<main>First public content</main><script>setInterval(() => document.querySelector("main").textContent = String(performance.now()), 5)</script>',
  );
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow(
    'Text, font and paint geometry',
  );
});

test('invalid readiness budgets fail before reading the page', async ({ page }) => {
  await expect(settlePublicPage(page, route, { ...budgets, samples: 1 })).rejects.toThrow(
    'budgets',
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, intervalMs: Number.NaN }),
  ).rejects.toThrow('budgets');
});

for (const field of [
  'expectedHttpStatuses',
  'expectedFinalPath',
  'expectedOrigin',
  'expectedQuery',
] as const) {
  test(`unknown ${field} cannot default to successful navigation proof`, async ({ page }) => {
    await expect(settlePublicPage(page, { ...route, [field]: null }, budgets)).rejects.toThrow(
      `Unmeasured transport expectation: ${field}`,
    );
    expect(page.url()).toBe('about:blank');
  });
}

test('same-path cross-origin redirects remain explicit failures', async ({ page }) => {
  const listen = async (server: Server) => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Redirect fixture has no loopback address');
    return `http://127.0.0.1:${address.port}`;
  };
  const target = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<main>Different origin content</main>');
  });
  let targetOrigin = '';
  const source = createServer((_request, response) => {
    response.writeHead(302, { location: `${targetOrigin}/fixture` });
    response.end();
  });
  try {
    targetOrigin = await listen(target);
    const sourceOrigin = await listen(source);
    await expect(
      settlePublicPage(
        page,
        { ...route, path: `${sourceOrigin}/fixture`, expectedOrigin: sourceOrigin },
        budgets,
      ),
    ).rejects.toThrow('Unmeasured navigation origin');
    expect(new URL(page.url()).origin).toBe(targetOrigin);
    expect(new URL(page.url()).pathname).toBe('/fixture');
    await expect(page.getByRole('main')).toHaveText('Different origin content');
  } finally {
    await Promise.all(
      [source, target].map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  }
});

test('query changes cannot masquerade as the requested transport state', async ({ page }) => {
  await documentFixture(page, '<main>Painted content</main>');
  await expect(
    settlePublicPage(page, { ...route, path: `${route.path}?changed=yes` }, budgets),
  ).rejects.toThrow('Public page query');
});

for (const style of [
  'opacity:0',
  'color:transparent',
  'width:1px;height:1px;overflow:hidden;clip-path:inset(50%);position:absolute',
]) {
  test(`nonpainted main text remains unknown: ${style}`, async ({ page }) => {
    await documentFixture(page, `<main><span style="${style}">Hidden public content</span></main>`);
    await expect(settlePublicPage(page, route, budgets)).rejects.toThrow('unpainted main');
  });
}

test('ancestor opacity cannot produce painted main evidence', async ({ page }) => {
  await documentFixture(page, '<div style="opacity:0"><main>Hidden public content</main></div>');
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow('unpainted main');
});

test('a marked busy state may become ready within the bounded deadline', async ({ page }) => {
  await documentFixture(
    page,
    '<main aria-busy="true">Waiting</main><script>setTimeout(() => { const main=document.querySelector("main"); main.removeAttribute("aria-busy"); main.textContent="Ready public content"; },120)</script>',
  );
  const report = await settlePublicPage(page, route, budgets);
  expect(report.pendingControls).toEqual([]);
  expect(report.paintedMainTextNodes).toBeGreaterThan(0);
});

test('hidden busy ancestors do not block visible completed content', async ({ page }) => {
  await documentFixture(
    page,
    '<main>Painted public content<div hidden><div aria-busy="true">Hidden loading</div></div></main>',
  );
  expect((await settlePublicPage(page, route, budgets)).pendingControls).toEqual([]);
});

test('the entire bounded window is observed even after early text stability', async ({ page }) => {
  await documentFixture(
    page,
    '<main style="height:100px">Painted public content</main><script>setTimeout(() => document.querySelector("main").style.fontSize="24px",150)</script>',
  );
  const report = await settlePublicPage(page, route, { ...budgets, intervalMs: 30, samples: 12 });
  expect(report.samples).toHaveLength(12);
  expect(report.samples.at(-1)?.elapsedMs).toBeGreaterThanOrEqual(360);
  expect(await page.locator('main').evaluate((main) => getComputedStyle(main).fontSize)).toBe(
    '24px',
  );
});

test('late style changes cannot pass solely because text and page height stayed stable', async ({
  page,
}) => {
  await documentFixture(
    page,
    '<main style="height:100px">Fixed text and geometry</main><script>setTimeout(() => setInterval(() => document.querySelector("main").style.color="rgb("+(Math.floor(performance.now())%255)+",0,0)",15),200)</script>',
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, intervalMs: 30, samples: 12 }),
  ).rejects.toThrow('Text, font and paint geometry');
});

test('late font-size drops are detected inside fixed-height content', async ({ page }) => {
  await documentFixture(
    page,
    '<main style="height:100px;font-size:24px;line-height:30px">Fixed text and outer geometry</main><script>setTimeout(() => setInterval(() => document.querySelector("main").style.fontSize=(10+performance.now()/1000)+"px",17),200)</script>',
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, intervalMs: 30, samples: 12 }),
  ).rejects.toThrow('Text, font and paint geometry');
});

async function fontFixture(page: Page, body: string, css = '', faceCss = '') {
  await documentFixture(
    page,
    `<style id="fixture-font-face">@font-face{font-family:FixtureFont;src:url('/fixture-font.woff2');${faceCss}}</style><style>:root{--fixture-font:FixtureFont} main{font-family:var(--fixture-font)}${css}</style>${body}`,
  );
  await page.route('http://public-fixture.invalid/fixture-font.woff2', (request) =>
    request.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(
        resolve(__dirname, '../public/fonts/opendyslexic/OpenDyslexic-Regular.woff2'),
      ),
    }),
  );
}

test('an expected font becomes painted after a bounded delayed entrance', async ({
  page,
}, testInfo) => {
  await fontFixture(
    page,
    '<main style="font-family:sans-serif">Painted system content<span id="delayed-font">ABC</span></main>',
    '#delayed-font{font-family:FixtureFont;animation:fixture-entrance 1ms 500ms both}@keyframes fixture-entrance{from{opacity:0}to{opacity:1}}',
  );
  try {
    const report = await settlePublicPage(page, route, {
      ...budgets,
      expectedFonts: [{ cssVariable: '--fixture-font' }],
    });
    expect(report.expectedFontProof).toContainEqual({
      family: 'fixturefont',
      usedTextNodes: 1,
      requests: 1,
      matchedRequests: 1,
    });
    expect(report.fontCoverageGaps).toEqual([]);
    expect(report.fontPaintDiagnostic?.initial.expectedFontSamples).toContainEqual(
      expect.objectContaining({ family: 'fixturefont', usedTextNodes: 0 }),
    );
    expect(report.fontPaintDiagnostic?.initial.fontPaintCandidates).toContainEqual(
      expect.objectContaining({
        family: 'fixturefont',
        text: 'ABC',
        paintedBoxes: 0,
        ancestors: expect.arrayContaining([
          expect.objectContaining({ opacity: '0', animationDelay: '0.5s' }),
        ]),
      }),
    );
    expect(report.fontPaintDiagnostic?.final.expectedFontSamples).toContainEqual(
      expect.objectContaining({ family: 'fixturefont', usedTextNodes: 1 }),
    );
    expect(
      await page.locator('#delayed-font').evaluate((element) => getComputedStyle(element).opacity),
    ).toBe('1');
  } finally {
    await testInfo.attach('delayed-font-paint-state.json', {
      body: JSON.stringify(
        await page.evaluate(() => {
          const element = document.querySelector('#delayed-font');
          if (!element) throw new Error('Missing delayed font witness');
          const css = getComputedStyle(element);
          return {
            fontFamily: css.fontFamily,
            opacity: css.opacity,
            animationName: css.animationName,
            animationDelay: css.animationDelay,
            animationDuration: css.animationDuration,
            fontFaces: [...document.fonts].map((face) => ({
              family: face.family,
              status: face.status,
            })),
          };
        }),
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }
});

test('a permanently hidden expected font remains a failed bounded paint witness', async ({
  page,
}) => {
  await fontFixture(
    page,
    '<main style="font-family:sans-serif">Painted system content<span id="hidden-font">ABC</span></main>',
    '#hidden-font{font-family:FixtureFont;opacity:0}',
  );
  const failure: unknown = await settlePublicPage(page, route, {
    ...budgets,
    expectedFonts: [{ cssVariable: '--fixture-font' }],
  }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(PublicReadinessFontError);
  if (!(failure instanceof PublicReadinessFontError))
    throw new Error('Missing bounded font failure');
  expect(failure.message).toContain('unused by painted text');
  expect(failure.diagnostic.observations.length).toBeGreaterThan(1);
  expect(
    failure.diagnostic.observations.every((observation) =>
      observation.expectedFonts.every((font) => font.usedTextNodes === 0),
    ),
  ).toBe(true);
  expect(failure.diagnostic.final.fontPaintCandidates).toContainEqual(
    expect.objectContaining({ family: 'fixturefont', text: 'ABC', paintedBoxes: 0 }),
  );
});

for (const paint of [
  {
    name: 'zero-opacity filter',
    css: 'filter:opacity(0)',
    property: 'filter',
    computed: 'opacity(0)',
  },
  {
    name: 'zero-alpha mask',
    css: 'mask-image:linear-gradient(transparent,transparent)',
    property: 'mask-image',
    computed: 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0))',
  },
  {
    name: 'transparent text fill',
    css: '-webkit-text-fill-color:transparent',
    property: '-webkit-text-fill-color',
    computed: 'rgba(0, 0, 0, 0)',
  },
]) {
  test(`an expected font hidden by ${paint.name} cannot prove painted use`, async ({
    page,
  }, testInfo) => {
    await fontFixture(
      page,
      '<main style="font-family:sans-serif">Painted system content<span id="hidden-paint">ABC</span><span id="blank-paint"></span></main>',
      `#hidden-paint,#blank-paint{display:block;width:240px;height:36px;line-height:36px;font-family:FixtureFont;color:black;background:white}#hidden-paint{${paint.css}}`,
    );
    try {
      await expect(
        settlePublicPage(page, route, {
          ...budgets,
          expectedFonts: [{ cssVariable: '--fixture-font' }],
        }),
      ).rejects.toThrow();
    } finally {
      const hidden = page.locator('#hidden-paint');
      expect(
        await hidden.evaluate(
          (element, property) => getComputedStyle(element).getPropertyValue(property),
          paint.property,
        ),
      ).toBe(paint.computed);
      const hiddenPng = await hidden.screenshot({ type: 'png' });
      const blankPng = await page.locator('#blank-paint').screenshot({ type: 'png' });
      expect(
        hiddenPng.equals(blankPng),
        'Hidden glyphs must independently match the native blank-span PNG',
      ).toBe(true);
      await testInfo.attach(`${paint.name}-hidden.png`, {
        body: hiddenPng,
        contentType: 'image/png',
      });
      await testInfo.attach(`${paint.name}-blank.png`, {
        body: blankPng,
        contentType: 'image/png',
      });
      await testInfo.attach('hidden-paint-style.json', {
        body: JSON.stringify(
          await hidden.evaluate((element) => {
            const css = getComputedStyle(element);
            return {
              filter: css.filter,
              maskImage: css.maskImage,
              textFillColor: css.getPropertyValue('-webkit-text-fill-color'),
              opacity: css.opacity,
              color: css.color,
              fontFamily: css.fontFamily,
              registeredFaces: [...document.fonts].map((face) => ({
                family: face.family,
                status: face.status,
              })),
            };
          }),
          null,
          2,
        ),
        contentType: 'application/json',
      });
    }
  });
}

type MaskedGeometry = {
  owner: { top: number; bottom: number; height: number };
  text: { left: number; top: number; right: number; bottom: number };
};
const maskedFont = { expectedFonts: [{ cssVariable: '--fixture-font' }] };
const maskedFontProof = {
  family: 'fixturefont',
  usedTextNodes: 1,
  requests: 1,
  matchedRequests: 1,
};

async function maskedFontFixture(
  page: Page,
  ownerCss: string,
  wrap: readonly [string, string] = ['', ''],
  ownerTag = 'div',
  textCss = '',
) {
  await fontFixture(
    page,
    `<main style="font-family:sans-serif">Painted system content${wrap[0]}<${ownerTag} id="mask-owner"><span id="masked-font">ABC</span></${ownerTag}>${wrap[1]}</main>`,
    `#mask-owner{position:relative;display:block;width:240px;height:400px;color:black;background:white;${ownerCss}}#masked-font{position:absolute;left:8px;top:100px;font-family:FixtureFont}#mask-owner #masked-font{${textCss}}`,
  );
}

async function maskedGeometry(
  page: Page,
  wrap: readonly [string, string] = ['', ''],
): Promise<MaskedGeometry> {
  await maskedFontFixture(page, '', wrap);
  await page.goto(route.path);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const owner = document.querySelector('#mask-owner')?.getBoundingClientRect();
    const node = document.querySelector('#masked-font')?.firstChild;
    if (!owner || !node) throw new Error('Missing mask fixture owner or text');
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    if (rects.length !== 1) throw new Error('Mask fixture text needs exactly one box');
    const text = rects[0]!;
    return {
      owner: { top: owner.top, bottom: owner.bottom, height: owner.height },
      text: { left: text.left, top: text.top, right: text.right, bottom: text.bottom },
    };
  });
}

const maskPercent = (geometry: MaskedGeometry, y: number) =>
  `${((y - geometry.owner.top) / geometry.owner.height) * 100}%`;

async function maskedState(page: Page) {
  return page.locator('#mask-owner').evaluate((owner) => {
    const css = getComputedStyle(owner);
    return {
      image: css.maskImage,
      size: css.maskSize,
      position: css.maskPosition,
      repeat: css.maskRepeat,
      origin: css.maskOrigin,
      clip: css.maskClip,
      composite: css.maskComposite,
      mode: css.maskMode,
      border: css.getPropertyValue('-webkit-mask-box-image-source'),
    };
  });
}

async function maskedTextPixels(page: Page, geometry: MaskedGeometry) {
  const clip = {
    x: Math.floor(geometry.text.left),
    y: Math.floor(geometry.text.top),
    width: Math.ceil(geometry.text.right) - Math.floor(geometry.text.left),
    height: Math.ceil(geometry.text.bottom) - Math.floor(geometry.text.top),
  };
  const masked = await page.screenshot({ type: 'png', clip });
  await page.locator('#mask-owner').evaluate((owner) => {
    (owner as HTMLElement).style.setProperty(
      'mask-image',
      'linear-gradient(currentColor, currentColor)',
    );
  });
  const plain = await page.screenshot({ type: 'png', clip });
  await page.locator('#masked-font').evaluate((text) => {
    (text as HTMLElement).style.setProperty('visibility', 'hidden');
  });
  const blank = await page.screenshot({ type: 'png', clip });
  return { masked, plain, blank };
}

for (const fade of [
  { name: 'the public 58% fade', end: '100%' },
  { name: 'the bento 50% to 96% fade', end: '96%' },
  { name: 'a fade with an implicit final stop', end: '' },
]) {
  test(`text inside the fully opaque band of ${fade.name} proves painted font use`, async ({
    page,
  }, testInfo) => {
    const geometry = await maskedGeometry(page);
    const stop = maskPercent(geometry, Math.ceil(geometry.text.bottom));
    await maskedFontFixture(
      page,
      `mask-image:linear-gradient(to bottom, currentColor ${stop}, transparent ${fade.end})`,
    );
    const report = await settlePublicPage(page, route, { ...budgets, ...maskedFont });
    expect(report.expectedFontProof).toContainEqual(maskedFontProof);
    expect((await maskedState(page)).image).toMatch(
      /^linear-gradient\(rgb\(0, 0, 0\) [\d.]+%, rgba\(0, 0, 0, 0\)(?: [\d.]+%)?\)$/,
    );
    expect(report.limits.join(' ')).toContain('where mask alpha is exactly 1');
    const pixels = await maskedTextPixels(page, geometry);
    expect(
      pixels.masked.equals(pixels.plain),
      'Glyphs inside the claimed opaque band must match their unmasked pixels',
    ).toBe(true);
    expect(pixels.plain.equals(pixels.blank), 'The pixel witness must contain glyphs').toBe(false);
    await testInfo.attach('opaque-band-masked.png', {
      body: pixels.masked,
      contentType: 'image/png',
    });
  });
}

test('text wholly inside the fading band cannot prove painted font use', async ({
  page,
}, testInfo) => {
  const geometry = await maskedGeometry(page);
  await maskedFontFixture(
    page,
    `mask-image:linear-gradient(to bottom, currentColor ${maskPercent(geometry, geometry.text.top - 24)}, transparent 100%)`,
  );
  const failure: unknown = await settlePublicPage(page, route, {
    ...budgets,
    ...maskedFont,
  }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(PublicReadinessFontError);
  if (!(failure instanceof PublicReadinessFontError)) throw new Error('Missing fade failure');
  expect(failure.message).toContain('unused by painted text');
  expect(failure.diagnostic.final.fontPaintCandidates).toContainEqual(
    expect.objectContaining({ family: 'fixturefont', text: 'ABC', paintedBoxes: 0 }),
  );
  const pixels = await maskedTextPixels(page, geometry);
  expect(
    pixels.masked.equals(pixels.plain),
    'Glyphs in the fading band must differ from their unmasked pixels',
  ).toBe(false);
  await testInfo.attach('fading-band-masked.png', {
    body: pixels.masked,
    contentType: 'image/png',
  });
  await testInfo.attach('fading-band-unmasked.png', {
    body: pixels.plain,
    contentType: 'image/png',
  });
});

for (const form of [
  {
    name: 'a percentage stop',
    stop: (geometry: MaskedGeometry, y: number) => maskPercent(geometry, y),
    wrap: ['', ''] as const,
  },
  {
    name: 'a calc() stop',
    stop: (geometry: MaskedGeometry, y: number) =>
      `calc(100% - ${((geometry.owner.bottom - y) * 400) / geometry.owner.height}px)`,
    wrap: ['', ''] as const,
  },
  {
    name: 'a calc() stop under an upright perspective projection',
    stop: (geometry: MaskedGeometry, y: number) =>
      `calc(100% - ${((geometry.owner.bottom - y) * 400) / geometry.owner.height}px)`,
    wrap: [
      '<div style="perspective:1400px"><div style="transform:translateZ(12px)">',
      '</div></div>',
    ] as const,
  },
]) {
  test(`the opaque band boundary of ${form.name} is the 2px paint floor`, async ({ page }) => {
    const geometry = await maskedGeometry(page, form.wrap);
    if (form.wrap[0]) expect(geometry.owner.height).toBeGreaterThan(402);
    else expect(geometry.owner.height).toBe(400);
    await maskedFontFixture(
      page,
      `mask-image:linear-gradient(to bottom, currentColor ${form.stop(geometry, geometry.text.top + 2.25)}, transparent)`,
      form.wrap,
    );
    const report = await settlePublicPage(page, route, { ...budgets, ...maskedFont });
    expect(report.expectedFontProof).toContainEqual(maskedFontProof);
    await maskedFontFixture(
      page,
      `mask-image:linear-gradient(to bottom, currentColor ${form.stop(geometry, geometry.text.top + 1.75)}, transparent)`,
      form.wrap,
    );
    await expect(settlePublicPage(page, route, { ...budgets, ...maskedFont })).rejects.toThrow(
      'unused by painted text',
    );
  });
}

const opaqueToEnd = 'linear-gradient(to bottom, black 99%, transparent 100%)';
const supportedFadeImage = /^linear-gradient\(rgb\(0, 0, 0\) 99%, rgba\(0, 0, 0, 0\) 100%\)$/;
for (const unsupported of [
  {
    name: 'an image mask',
    css: `mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='400'%3E%3Crect width='240' height='400'/%3E%3C/svg%3E")`,
    image: /^url\(/,
  },
  {
    name: 'a radial gradient',
    css: 'mask-image:radial-gradient(circle at 50% 30%, black 99%, transparent 100%)',
    image: /^radial-gradient\(/,
  },
  {
    name: 'two mask layers',
    css: `mask-image:${opaqueToEnd},${opaqueToEnd}`,
    image: /\), linear-gradient\(/,
  },
  {
    name: 'a horizontal gradient',
    css: 'mask-image:linear-gradient(to right, black 99%, transparent 100%)',
    image: /^linear-gradient\(to right, /,
  },
  {
    name: 'a bottom-to-top gradient',
    css: 'mask-image:linear-gradient(to top, black 99%, transparent 100%)',
    image: /^linear-gradient\(to top, /,
  },
  {
    name: 'an angled gradient',
    css: 'mask-image:linear-gradient(170deg, black 99%, transparent 100%)',
    image: /^linear-gradient\(170deg, /,
  },
  {
    name: 'a three-stop gradient',
    css: 'mask-image:linear-gradient(to bottom, black 10%, transparent 20%, black 99%)',
    image: /^linear-gradient\(rgb\(0, 0, 0\) 10%, rgba\(0, 0, 0, 0\) 20%, rgb\(0, 0, 0\) 99%\)$/,
  },
  {
    name: 'a translucent first stop',
    css: 'mask-image:linear-gradient(to bottom, rgba(0,0,0,0.5) 99%, transparent 100%)',
    image: /^linear-gradient\(rgba\(0, 0, 0, 0\.5\) 99%, /,
  },
  {
    name: 'a gradient with no first stop position',
    css: 'mask-image:linear-gradient(to bottom, black, transparent)',
    image: /^linear-gradient\(rgb\(0, 0, 0\), rgba\(0, 0, 0, 0\)\)$/,
  },
  {
    name: 'a gradient whose opaque band is empty',
    css: 'mask-image:linear-gradient(to bottom, black 0%, transparent 100%)',
    image: /^linear-gradient\(rgb\(0, 0, 0\) 0%, rgba\(0, 0, 0, 0\) 100%\)$/,
  },
  { name: 'a non-initial mask size', css: `mask-image:${opaqueToEnd};mask-size:100% 40px` },
  { name: 'a non-initial mask position', css: `mask-image:${opaqueToEnd};mask-position:0 300px` },
  { name: 'a non-initial mask repeat', css: `mask-image:${opaqueToEnd};mask-repeat:no-repeat` },
  {
    name: 'a non-initial mask origin',
    css: `mask-image:${opaqueToEnd};mask-origin:content-box;padding-top:300px;box-sizing:border-box`,
  },
  {
    name: 'a non-initial mask clip',
    css: `mask-image:${opaqueToEnd};mask-clip:content-box;padding-top:300px;box-sizing:border-box`,
  },
  { name: 'a non-initial mask composite', css: `mask-image:${opaqueToEnd};mask-composite:exclude` },
  { name: 'a luminance mask mode', css: `mask-image:${opaqueToEnd};mask-mode:luminance` },
  {
    name: 'a mask border image',
    css: `-webkit-mask-box-image-source:${opaqueToEnd}`,
    image: /^none$/,
  },
  { name: 'a mask owner turned upside down', css: `mask-image:${opaqueToEnd};rotate:180deg` },
  {
    name: 'a mask owner mirrored vertically',
    css: `mask-image:${opaqueToEnd};transform:scaleY(-1)`,
  },
  {
    name: 'a mask owner under a rotated ancestor',
    css: `mask-image:${opaqueToEnd}`,
    wrap: ['<div style="transform:rotate(180deg)">', '</div>'],
  },
  {
    name: 'a mask owner tilted in perspective',
    css: `mask-image:${opaqueToEnd}`,
    wrap: [
      '<div style="perspective:1400px"><div style="transform:rotateX(8deg) translateZ(12px)">',
      '</div></div>',
    ],
  },
  { name: 'a zoomed mask owner', css: `mask-image:${opaqueToEnd};zoom:1.5` },
  {
    name: 'an inline mask owner',
    css: `mask-image:${opaqueToEnd};display:inline;height:auto`,
    tag: 'span',
    textCss: 'position:static',
  },
  {
    name: 'a mask owner whose declared box is not its rendered box',
    css: `mask-image:${opaqueToEnd};display:inline`,
    tag: 'span',
    textCss: 'position:static',
  },
] as {
  name: string;
  css: string;
  image?: RegExp;
  wrap?: readonly [string, string];
  tag?: string;
  textCss?: string;
}[]) {
  test(`${unsupported.name} keeps masked text out of paint evidence`, async ({ page }) => {
    await maskedFontFixture(
      page,
      unsupported.css,
      unsupported.wrap,
      unsupported.tag,
      unsupported.textCss,
    );
    const failure: unknown = await settlePublicPage(page, route, {
      ...budgets,
      ...maskedFont,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(PublicReadinessFontError);
    if (!(failure instanceof PublicReadinessFontError))
      throw new Error('Missing unsupported mask failure');
    expect(failure.message).toContain('unused by painted text');
    expect(failure.diagnostic.final.fontPaintCandidates).toContainEqual(
      expect.objectContaining({ family: 'fixturefont', text: 'ABC', paintedBoxes: 0 }),
    );
    expect((await maskedState(page)).image).toMatch(unsupported.image ?? supportedFadeImage);
  });
}

test('registered loaded canonical font use is proved through its CSS variable', async ({
  page,
}) => {
  await fontFixture(page, '<main>Painted public content</main>');
  const report = await settlePublicPage(page, route, {
    ...budgets,
    expectedFonts: [{ cssVariable: '--fixture-font' }],
  });
  expect(report.expectedFontProof).toEqual([
    { family: 'fixturefont', usedTextNodes: 1, requests: 1, matchedRequests: 1 },
  ]);
  expect(report.fontCoverageGaps).toEqual([]);
  expect(report.usedFontFamilies).toEqual([
    expect.objectContaining({
      family: 'fixturefont',
      registeredFaces: [expect.objectContaining({ status: 'loaded' })],
    }),
  ]);
});

test('fresh scoped font proof retains supported glyphs without erasing page-wide gaps', async ({
  page,
}) => {
  await fontFixture(
    page,
    '<main><div id="font-scope">ABC</div><span>→</span></main>',
    '',
    'unicode-range:U+0041-005A;',
  );
  const readiness = await settlePublicPage(page, route, {
    ...budgets,
    expectedFonts: [{ cssVariable: '--fixture-font' }],
  });
  expect(readiness.fontCoverageGaps).toEqual([expect.objectContaining({ codepoints: ['U+2192'] })]);
  const proof = await measurePublicFontProof(
    page,
    page.locator('#font-scope'),
    [{ cssVariable: '--fixture-font' }],
    1000,
  );
  expect(proof.fontCoverageGaps).toEqual([]);
  expect(proof.expectedFontProof).toEqual([
    { family: 'fixturefont', usedTextNodes: 1, requests: 1, matchedRequests: 1 },
  ]);
  expect(readiness.fontCoverageGaps).toHaveLength(1);
});

test('fresh scoped font proof rejects an unregistered custom family added after readiness', async ({
  page,
}) => {
  await fontFixture(page, '<main><div id="font-scope">ABC</div></main>');
  await settlePublicPage(page, route, {
    ...budgets,
    expectedFonts: [{ cssVariable: '--fixture-font' }],
  });
  await page.locator('#font-scope').evaluate((element) => {
    const added = document.createElement('span');
    added.style.fontFamily = 'MissingCustom,sans-serif';
    added.textContent = 'Unverified';
    element.append(added);
  });
  expect(
    await page
      .locator('#font-scope span')
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('MissingCustom');
  await expect(
    measurePublicFontProof(
      page,
      page.locator('#font-scope'),
      [{ cssVariable: '--fixture-font' }],
      1000,
    ),
  ).rejects.toThrow('Unmeasured used custom font');
});

test('fresh scoped font proof rejects a failed face added after readiness', async ({ page }) => {
  await fontFixture(page, '<main><div id="font-scope">ABC</div></main>');
  await settlePublicPage(page, route, {
    ...budgets,
    expectedFonts: [{ cssVariable: '--fixture-font' }],
  });
  await page.route('http://public-fixture.invalid/broken.woff2', (request) =>
    request.fulfill({ status: 404, body: '' }),
  );
  const failed = await page.evaluate(async () => {
    const broken = new FontFace('BrokenFont', 'url(/broken.woff2)');
    document.fonts.add(broken);
    await broken.load().catch(() => undefined);
    await document.fonts.ready;
    return { status: broken.status, fonts: document.fonts.status };
  });
  expect(failed).toEqual({ status: 'error', fonts: 'loaded' });
  await expect(
    measurePublicFontProof(
      page,
      page.locator('#font-scope'),
      [{ cssVariable: '--fixture-font' }],
      1000,
    ),
  ).rejects.toThrow('Failed FontFace');
});

test('a missing canonical registered family remains unmeasured', async ({ page }) => {
  await documentFixture(
    page,
    '<main style="font-family:MissingFont,sans-serif">Painted fallback content</main>',
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, expectedFonts: [{ family: 'MissingFont' }] }),
  ).rejects.toThrow('Unmeasured expected font');
});

test('an unused registered face cannot stand in for an actually used canonical font', async ({
  page,
}) => {
  await fontFixture(page, '<main>Painted system content</main>', 'main{font-family:sans-serif}');
  await expect(
    settlePublicPage(page, route, { ...budgets, expectedFonts: [{ family: 'FixtureFont' }] }),
  ).rejects.toThrow('unused by painted text');
});

test('every used custom first-family needs a face even when the canonical family is loaded', async ({
  page,
}) => {
  await fontFixture(
    page,
    '<main>Canonical content<span style="font-family:MissingCustom,sans-serif">Unverified custom content</span></main>',
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, expectedFonts: [{ family: 'FixtureFont' }] }),
  ).rejects.toThrow('Unmeasured used custom font');
});

test('a failed FontFace remains a failure when document fonts reports loaded', async ({ page }) => {
  await documentFixture(
    page,
    '<main>Painted fallback content</main><script>const broken=new FontFace("BrokenFont", "url(/broken.woff2)");document.fonts.add(broken);broken.load().catch(()=>{});</script>',
  );
  await page.route('http://public-fixture.invalid/broken.woff2', (request) =>
    request.fulfill({ status: 404, body: '' }),
  );
  await expect(settlePublicPage(page, route, budgets)).rejects.toThrow();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  expect(
    await page.evaluate(() => [...document.fonts].some((face) => face.status === 'error')),
  ).toBe(true);
});

test('a canonical face removed during the observation window cannot keep a green proof', async ({
  page,
}) => {
  await fontFixture(
    page,
    '<main>Canonical text</main><script>setTimeout(() => {const before=document.fonts.size;document.querySelector("#fixture-font-face").remove();requestAnimationFrame(()=>document.documentElement.setAttribute("data-font-deletion-witness",JSON.stringify({before,after:document.fonts.size,at:performance.now()})));},200)</script>',
  );
  await expect(
    settlePublicPage(page, route, {
      ...budgets,
      intervalMs: 30,
      samples: 12,
      expectedFonts: [{ family: 'FixtureFont' }],
    }),
  ).rejects.toThrow('Unmeasured expected font');
  const witness = await page.evaluate(
    () =>
      JSON.parse(document.documentElement.getAttribute('data-font-deletion-witness') ?? 'null') as {
        before: number;
        after: number;
        at: number;
      } | null,
  );
  expect(witness).not.toBeNull();
  expect(witness?.before).toBe(1);
  expect(witness?.after).toBe(0);
  expect(witness?.at).toBeGreaterThanOrEqual(200);
  expect(witness?.at).toBeLessThan(500);
});

test('a missing expected CSS font variable is explicit unknown coverage', async ({ page }) => {
  await documentFixture(page, '<main>Painted system content</main>');
  await expect(
    settlePublicPage(page, route, {
      ...budgets,
      expectedFonts: [{ cssVariable: '--missing-family' }],
    }),
  ).rejects.toThrow('Unmeasured expected font');
});

for (const statuses of [[], [200, 200], [Number.NaN], [99], [600]]) {
  test(`invalid or ambiguous allowed transport statuses stay unmeasured: ${JSON.stringify(statuses)}`, async ({
    page,
  }) => {
    await expect(
      settlePublicPage(page, { ...route, expectedHttpStatuses: statuses }, budgets),
    ).rejects.toThrow('nonempty valid distinct HTTP statuses');
    expect(page.url()).toBe('about:blank');
  });
}

test('an explicit allowed transport set admits a verified alternative status without a default', async ({
  page,
}) => {
  await documentFixture(page, '<main>Verified alternative content</main>', 404);
  const report = await settlePublicPage(
    page,
    { ...route, expectedHttpStatuses: [200, 404] },
    budgets,
  );
  expect(report.httpStatus).toBe(404);
  expect(report.allowedHttpStatuses).toEqual([200, 404]);
});

for (const reverse of [false, true]) {
  test(`actual glyph aggregation retains unsupported coverage independent of node order: ${reverse}`, async ({
    page,
  }) => {
    const body = reverse
      ? '<main><span>→</span><span>ABC</span></main>'
      : '<main><span>ABC</span><span>→</span></main>';
    await fontFixture(page, body, '', 'unicode-range:U+0041-005A');
    const report = await settlePublicPage(page, route, {
      ...budgets,
      expectedFonts: [{ family: 'FixtureFont' }],
    });
    expect(await page.evaluate(() => document.characterSet)).toBe('UTF-8');
    await expect(page.getByRole('main')).toHaveText(reverse ? '→ABC' : 'ABC→');
    expect(report.expectedFontProof).toEqual([
      { family: 'fixturefont', usedTextNodes: 2, requests: 1, matchedRequests: 1 },
    ]);
    expect(report.fontCoverageGaps).toEqual([
      {
        reason: 'unicode-range-gap',
        family: 'fixturefont',
        font: 'normal 400 16px "fixturefont"',
        text: '→',
        codepoints: ['U+2192'],
        registeredUnicodeRanges: ['U+41-5A'],
      },
    ]);
    expect(report.fontFaces).toEqual([
      expect.objectContaining({ family: 'fixturefont', status: 'loaded', unicodeRange: 'U+41-5A' }),
    ]);
  });
}

test('a glyph-only variant stays explicitly unmeasured while supported actual text loads', async ({
  page,
}) => {
  await fontFixture(
    page,
    '<main>ABC<span style="font-size:18px">→</span></main>',
    '',
    'unicode-range:U+0041-005A',
  );
  const report = await settlePublicPage(page, route, {
    ...budgets,
    expectedFonts: [{ family: 'FixtureFont' }],
  });
  expect(report.expectedFontProof).toEqual([
    { family: 'fixturefont', usedTextNodes: 2, requests: 2, matchedRequests: 1 },
  ]);
  expect(report.fontCoverageGaps).toEqual([
    expect.objectContaining({
      font: 'normal 400 18px "fixturefont"',
      text: '→',
      codepoints: ['U+2192'],
    }),
  ]);
});

test('unsupported symbols do not mask a failed actual supported font load', async ({ page }) => {
  await fontFixture(page, '<main>ABC<span>→</span></main>', '', 'unicode-range:U+0041-005A');
  await page.route('http://public-fixture.invalid/fixture-font.woff2', (request) =>
    request.fulfill({ status: 404, body: '' }),
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, expectedFonts: [{ family: 'FixtureFont' }] }),
  ).rejects.toThrow();
  expect(
    await page.evaluate(() => [...document.fonts].some((face) => face.status === 'error')),
  ).toBe(true);
});

test('unsupported symbols do not turn a missing registered family into a coverage-only result', async ({
  page,
}) => {
  await documentFixture(
    page,
    '<main style="font-family:MissingFont,sans-serif">ABC<span>→</span></main>',
  );
  await expect(
    settlePublicPage(page, route, { ...budgets, expectedFonts: [{ family: 'MissingFont' }] }),
  ).rejects.toThrow('missing registered family');
});
