import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  capturePublicPageCoherence,
  comparePublicPageCoherence,
} from './lib/public-page-coherence';

const FIXTURE_URL = 'http://localhost:3000/coherence-fixture';
const VALID_FONT = readFileSync(
  resolve(__dirname, '../public/fonts/opendyslexic/OpenDyslexic-Regular.woff2'),
);

async function installFixture(
  page: Page,
  content = '<main><h1>Stable page</h1><p>Stable content</p></main>',
  css = '',
) {
  await page.route(FIXTURE_URL, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body:
        '<html class="light" data-theme="light"><style>html{color-scheme:light}body{font-family:Arial;background:white;color:black;min-height:2000px}' +
        css +
        '</style><body>' +
        content +
        '</body></html>',
    }),
  );
  await page.goto(FIXTURE_URL);
}

async function registerFont(
  page: Page,
  family: string,
  url: string,
  descriptors: FontFaceDescriptors = {},
) {
  await page.evaluate(
    ({ family, url, descriptors }) => {
      document.fonts.add(
        new FontFace(family, 'url("' + url + '")', { display: 'swap', ...descriptors }),
      );
    },
    { family, url, descriptors },
  );
}

async function startFont(
  page: Page,
  family: string,
  weight = 'normal',
  style = 'normal',
  unicodeRange?: string,
) {
  await page.evaluate(
    ({ family, weight, style, unicodeRange }) => {
      const face = Array.from(document.fonts).find(
        (candidate) =>
          candidate.family === family &&
          candidate.weight === weight &&
          candidate.style === style &&
          (unicodeRange === undefined || candidate.unicodeRange === unicodeRange),
      );
      if (!face) throw new Error('Missing controlled fixture face');
      void face.load();
    },
    { family, weight, style, unicodeRange },
  );
}

async function faceState(
  page: Page,
  family: string,
  weight = 'normal',
  style = 'normal',
  unicodeRange?: string,
) {
  return page.evaluate(
    ({ family, weight, style, unicodeRange }) => {
      const face = Array.from(document.fonts).find(
        (candidate) =>
          candidate.family === family &&
          candidate.weight === weight &&
          candidate.style === style &&
          (unicodeRange === undefined || candidate.unicodeRange === unicodeRange),
      );
      if (!face) throw new Error('Missing controlled fixture face');
      return face.status;
    },
    { family, weight, style, unicodeRange },
  );
}

async function finishFont(
  page: Page,
  family: string,
  weight = 'normal',
  style = 'normal',
  unicodeRange?: string,
  waitAll = true,
) {
  return page.evaluate(
    async ({ family, weight, style, unicodeRange, waitAll }) => {
      const face = Array.from(document.fonts).find(
        (candidate) =>
          candidate.family === family &&
          candidate.weight === weight &&
          candidate.style === style &&
          (unicodeRange === undefined || candidate.unicodeRange === unicodeRange),
      );
      if (!face) throw new Error('Missing controlled fixture face');
      await face.loaded;
      if (waitAll) await document.fonts.ready;
      return face.status;
    },
    { family, weight, style, unicodeRange, waitAll },
  );
}

async function gatedFont(page: Page, url: string) {
  let release: () => void = () => {
    throw new Error('Missing fixture gate');
  };
  let arrived: () => void = () => {
    throw new Error('Missing fixture request signal');
  };
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const requested = new Promise<void>((resolveRequest) => {
    arrived = resolveRequest;
  });
  await page.route(url, async (route) => {
    arrived();
    await gate;
    await route.fulfill({ contentType: 'font/woff2', body: VALID_FONT });
  });
  return { requested, release };
}

test('coherence ignores window scroll and focus while retaining the same page and content', async ({
  page,
}) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.evaluate(() => {
    const title = document.querySelector('h1');
    if (!title) throw new Error('Missing fixture title');
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
    scrollTo(0, 100);
  });
  expect(await page.evaluate(() => scrollY)).toBe(100);
  expect(await page.evaluate(() => document.activeElement === document.querySelector('h1'))).toBe(
    true,
  );
  const after = await capturePublicPageCoherence(page, 'after');
  expect(before.paint.count).toBeGreaterThan(0);
  expect(after.diagnostics.scroll.y).toBe(100);
  expect(comparePublicPageCoherence(before, after)).toEqual([]);
});

test('restored internal scrolling and focus preserve fixed and sticky text geometry', async ({
  page,
}) => {
  await installFixture(
    page,
    '<header><a href="#bottom">Sticky navigation</a></header><aside>Fixed control</aside><main><h1>Stable page</h1><div id="port"><p>Long scrollable content inside a bounded mockup frame</p></div><button id="button">Focus control</button><div id="bottom">Bottom content</div></main>',
    'header{position:sticky;top:0}aside{position:fixed;right:0;top:30px}#port{width:160px;overflow:auto}#port p{width:700px;white-space:nowrap}#bottom{margin-top:1000px}button:focus{outline:2px solid blue}',
  );
  const before = await capturePublicPageCoherence(page, 'before');
  await page.evaluate(() => {
    const port = document.querySelector<HTMLElement>('#port');
    const button = document.querySelector<HTMLButtonElement>('#button');
    if (!port || !button) throw new Error('Missing fixture controls');
    port.scrollLeft = 150;
    button.focus({ preventScroll: true });
    scrollTo(0, 200);
  });
  expect(await page.locator('#port').evaluate((port) => port.scrollLeft)).toBe(150);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('button');
  const scrolled = await capturePublicPageCoherence(page, 'scrolled');
  expect(
    scrolled.diagnostics.sources.some((source) => source.geometrySpace === 'fixed-local'),
  ).toBe(true);
  expect(
    scrolled.diagnostics.sources.some((source) => source.geometrySpace === 'sticky-local'),
  ).toBe(true);
  await page.evaluate(() => {
    const port = document.querySelector<HTMLElement>('#port');
    const active = document.activeElement;
    if (!port) throw new Error('Missing fixture port');
    port.scrollLeft = 0;
    if (active instanceof HTMLElement) active.blur();
    scrollTo(0, 0);
  });
  expect(await page.locator('#port').evaluate((port) => port.scrollLeft)).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const after = await capturePublicPageCoherence(page, 'restored');
  expect(comparePublicPageCoherence(before, after)).toEqual([]);
});

test('coherence rejects hidden main content with unchanged semantic text', async ({ page }) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.locator('main').evaluate((main) => {
    main.style.opacity = '0';
  });
  expect(await page.locator('main').evaluate((main) => getComputedStyle(main).opacity)).toBe('0');
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.main).toEqual(before.main);
  expect(after.paint.count).toBe(0);
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
    'paint',
  );
});

test('coherence rejects a paragraph font change while body and title remain unchanged', async ({
  page,
}) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.locator('p').evaluate((paragraph) => {
    paragraph.style.fontFamily = 'serif';
  });
  expect(
    await page.locator('p').evaluate((paragraph) => getComputedStyle(paragraph).fontFamily),
  ).toBe('serif');
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.fonts.body).toBe(before.fonts.body);
  expect(after.fonts.heading).toBe(before.fonts.heading);
  expect(after.main).toEqual(before.main);
  expect(after.fonts.assignmentsDigest).not.toBe(before.fonts.assignmentsDigest);
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
    'fonts',
  );
});

test('coherence excludes newly registered faces unrelated to painted text', async ({ page }) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  const count = await page.evaluate(() => document.fonts.size);
  await registerFont(page, 'UnusedFixtureFace', '/unused-fixture-font.woff2');
  expect(await page.evaluate(() => document.fonts.size)).toBe(count + 1);
  expect(await faceState(page, 'UnusedFixtureFace')).toBe('unloaded');
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.diagnostics.registeredFaces.length).toBe(
    before.diagnostics.registeredFaces.length + 1,
  );
  expect(comparePublicPageCoherence(before, after)).toEqual([]);
});

test('unrelated valid font loading remains diagnostic while painted requests stay available', async ({
  page,
}) => {
  await installFixture(page);
  const family = 'UnrelatedPendingFixture';
  const gate = await gatedFont(page, 'http://localhost:3000/unrelated-pending.woff2');
  await registerFont(page, family, '/unrelated-pending.woff2');
  expect(await faceState(page, family)).toBe('unloaded');
  const before = await capturePublicPageCoherence(page, 'before');
  try {
    await startFont(page, family);
    await gate.requested;
    expect(await faceState(page, family)).toBe('loading');
    const pending = await capturePublicPageCoherence(page, 'pending');
    expect(pending.fonts.status).toBe('loading');
    expect(pending.diagnostics.fontRequests.every((request) => request.available)).toBe(true);
    expect(pending.diagnostics.registeredFaces.some((face) => face.status === 'loading')).toBe(
      true,
    );
    expect(comparePublicPageCoherence(before, pending)).toEqual([]);
    gate.release();
    expect(await finishFont(page, family)).toBe('loaded');
    const after = await capturePublicPageCoherence(page, 'loaded');
    expect(after.fonts.status).toBe('loaded');
    expect(after.diagnostics.registeredFaces.some((face) => face.status === 'loaded')).toBe(true);
    expect(comparePublicPageCoherence(before, after)).toEqual([]);
  } finally {
    gate.release();
  }
});

for (const unused of [
  { name: 'weight', weight: '900', style: 'normal' },
  { name: 'style', weight: '400', style: 'italic' },
]) {
  test(
    'an unused ' +
      unused.name +
      ' loads within an already painted family without changing coherence',
    async ({ page }) => {
      await installFixture(
        page,
        undefined,
        'main{font-family:CoherenceFace}h1,p{font-weight:400;font-style:normal}',
      );
      await page.route('http://localhost:3000/used-face.woff2', (route) =>
        route.fulfill({ contentType: 'font/woff2', body: VALID_FONT }),
      );
      await registerFont(page, 'CoherenceFace', '/used-face.woff2', { weight: '400' });
      await startFont(page, 'CoherenceFace', '400');
      expect(await finishFont(page, 'CoherenceFace', '400')).toBe('loaded');
      const gate = await gatedFont(page, 'http://localhost:3000/unused-' + unused.name + '.woff2');
      await registerFont(page, 'CoherenceFace', '/unused-' + unused.name + '.woff2', {
        weight: unused.weight,
        style: unused.style,
      });
      expect(await faceState(page, 'CoherenceFace', unused.weight, unused.style)).toBe('unloaded');
      expect(
        await page.locator('p').evaluate((paragraph) => {
          const css = getComputedStyle(paragraph);
          return [css.fontFamily, css.fontWeight, css.fontStyle];
        }),
      ).toEqual(['CoherenceFace', '400', 'normal']);
      const before = await capturePublicPageCoherence(page, 'before');
      expect(before.diagnostics.fontRequests.every((request) => request.available)).toBe(true);
      try {
        await startFont(page, 'CoherenceFace', unused.weight, unused.style);
        await gate.requested;
        expect(await faceState(page, 'CoherenceFace', unused.weight, unused.style)).toBe('loading');
        const pending = await capturePublicPageCoherence(page, 'pending');
        expect(pending.fonts.status).toBe('loading');
        expect(pending.fonts.registered).toEqual(before.fonts.registered);
        expect(pending.diagnostics.fontRequests).toEqual(before.diagnostics.fontRequests);
        expect(comparePublicPageCoherence(before, pending)).toEqual([]);
        gate.release();
        expect(await finishFont(page, 'CoherenceFace', unused.weight, unused.style)).toBe('loaded');
        const after = await capturePublicPageCoherence(page, 'loaded');
        expect(after.diagnostics.fontRequests).toEqual(before.diagnostics.fontRequests);
        expect(comparePublicPageCoherence(before, after)).toEqual([]);
      } finally {
        gate.release();
      }
    },
  );
}

test('participating font availability changes are retained with identical declarations and semantic text', async ({
  page,
}) => {
  await installFixture(
    page,
    undefined,
    'main{font-family:ParticipatingFace}h1,p{font-weight:400;font-style:normal}',
  );
  const family = 'ParticipatingFace';
  const gate = await gatedFont(page, 'http://localhost:3000/participating-pending.woff2');
  await registerFont(page, family, '/participating-pending.woff2', { weight: '400' });
  try {
    await startFont(page, family, '400');
    await gate.requested;
    expect(await faceState(page, family, '400')).toBe('loading');
    const before = await capturePublicPageCoherence(page, 'pending');
    expect(before.paint.count).toBeGreaterThan(0);
    expect(
      before.diagnostics.fontRequests.some(
        (request) => request.font.includes(family) && !request.available,
      ),
    ).toBe(true);
    gate.release();
    expect(await finishFont(page, family, '400')).toBe('loaded');
    const after = await capturePublicPageCoherence(page, 'loaded');
    expect(after.fonts.registered).toEqual(before.fonts.registered);
    expect(after.fonts.assignmentsDigest).toBe(before.fonts.assignmentsDigest);
    expect(after.main).toEqual(before.main);
    expect(
      after.diagnostics.fontRequests
        .filter((request) => request.font.includes(family))
        .every((request) => request.available),
    ).toBe(true);
    expect(after.fonts.availabilityDigest).not.toBe(before.fonts.availabilityDigest);
    expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
      'fonts',
    );
  } finally {
    gate.release();
  }
});

test('one run becoming available is detected while another subset of the same request stays pending', async ({
  page,
}) => {
  await installFixture(
    page,
    '<main><h1>Stable page</h1><p>Latin text</p><p>αβ</p></main>',
    'main{font-family:SubsetFace}h1,p{font-weight:400;font-style:normal}',
  );
  const latin = await gatedFont(page, 'http://localhost:3000/subset-latin.woff2');
  const greek = await gatedFont(page, 'http://localhost:3000/subset-greek.woff2');
  await registerFont(page, 'SubsetFace', '/subset-latin.woff2', {
    weight: '400',
    unicodeRange: 'U+0-7F',
  });
  await registerFont(page, 'SubsetFace', '/subset-greek.woff2', {
    weight: '400',
    unicodeRange: 'U+370-3FF',
  });
  try {
    await startFont(page, 'SubsetFace', '400', 'normal', 'U+0-7F');
    await startFont(page, 'SubsetFace', '400', 'normal', 'U+370-3FF');
    await Promise.all([latin.requested, greek.requested]);
    expect(await faceState(page, 'SubsetFace', '400', 'normal', 'U+0-7F')).toBe('loading');
    expect(await faceState(page, 'SubsetFace', '400', 'normal', 'U+370-3FF')).toBe('loading');
    const before = await capturePublicPageCoherence(page, 'both-pending');
    const initialRuns = before.diagnostics.fontRequests.filter((request) =>
      request.font.includes('SubsetFace'),
    );
    expect(
      initialRuns
        .filter((request) => request.text.includes('α'))
        .every((request) => !request.available),
    ).toBe(true);
    expect(
      initialRuns
        .filter((request) => request.text.includes('L'))
        .every((request) => !request.available),
    ).toBe(true);
    expect(initialRuns.some((request) => request.text.includes('α'))).toBe(true);
    expect(initialRuns.some((request) => request.text.includes('L'))).toBe(true);
    latin.release();
    expect(await finishFont(page, 'SubsetFace', '400', 'normal', 'U+0-7F', false)).toBe('loaded');
    expect(await faceState(page, 'SubsetFace', '400', 'normal', 'U+370-3FF')).toBe('loading');
    const after = await capturePublicPageCoherence(page, 'latin-available');
    expect(after.fonts.status).toBe('loading');
    const runs = after.diagnostics.fontRequests.filter((request) =>
      request.font.includes('SubsetFace'),
    );
    expect(
      runs.filter((request) => request.text.includes('α')).every((request) => !request.available),
    ).toBe(true);
    expect(
      runs.filter((request) => request.text.includes('L')).every((request) => request.available),
    ).toBe(true);
    expect(after.fonts.availabilityDigest).not.toBe(before.fonts.availabilityDigest);
    expect(after.fonts.assignmentsDigest).toBe(before.fonts.assignmentsDigest);
    expect(after.main).toEqual(before.main);
    expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
      'fonts',
    );
  } finally {
    latin.release();
    greek.release();
  }
});

test('unpainted script and style injection does not change main semantic evidence', async ({
  page,
}) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  const rawText = await page.locator('main').textContent();
  await page.locator('main').evaluate((main) => {
    const style = document.createElement('style');
    style.textContent = 'main{--nonpainted-fixture-marker:1}';
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = '{"diagnostic":"unused"}';
    main.append(style, script);
  });
  expect(await page.locator('main').textContent()).not.toBe(rawText);
  expect(
    await page.locator('main style').evaluate((style) => getComputedStyle(style).display),
  ).toBe('none');
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.main).toEqual(before.main);
  expect(comparePublicPageCoherence(before, after)).toEqual([]);
});

test('coherence rejects transparent paragraph text while semantic content remains', async ({
  page,
}) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.locator('p').evaluate((paragraph) => {
    paragraph.style.color = 'transparent';
  });
  expect(
    await page
      .locator('p')
      .evaluate((paragraph) => getComputedStyle(paragraph).webkitTextFillColor),
  ).toBe('rgba(0, 0, 0, 0)');
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.main).toEqual(before.main);
  expect(after.paint.count).toBeLessThan(before.paint.count);
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
    'paint',
  );
});

test('coherence rejects positioned text moving offscreen with unchanged font metrics', async ({
  page,
}) => {
  await installFixture(page, undefined, 'p{position:relative;left:0}');
  const before = await capturePublicPageCoherence(page, 'before');
  const metrics = await page.locator('p').evaluate((paragraph) => {
    const css = getComputedStyle(paragraph);
    return [css.fontFamily, css.fontSize, css.lineHeight];
  });
  await page.locator('p').evaluate((paragraph) => {
    paragraph.style.left = '-10000px';
  });
  expect(
    await page.locator('p').evaluate((paragraph) => paragraph.getBoundingClientRect().right),
  ).toBeLessThan(0);
  expect(
    await page.locator('p').evaluate((paragraph) => {
      const css = getComputedStyle(paragraph);
      return [css.fontFamily, css.fontSize, css.lineHeight];
    }),
  ).toEqual(metrics);
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.main).toEqual(before.main);
  expect(after.paint.geometryDigest).not.toBe(before.paint.geometryDigest);
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
    'paint',
  );
});

test('coherence rejects overflow clipping that preserves the text run width', async ({ page }) => {
  await installFixture(
    page,
    '<main><h1>Stable page</h1><div id="crop"><p>Readable text becomes cropped without changing its font</p></div></main>',
    '#crop{width:500px;overflow:hidden}p{white-space:nowrap;margin:0}',
  );
  const textWidth = () =>
    page.locator('p').evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      return range.getBoundingClientRect().width;
    });
  const before = await capturePublicPageCoherence(page, 'before');
  const width = await textWidth();
  await page.locator('#crop').evaluate((crop) => {
    crop.style.width = '40px';
  });
  expect(await textWidth()).toBe(width);
  expect(await page.locator('#crop').evaluate((crop) => crop.clientWidth)).toBe(40);
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.main).toEqual(before.main);
  expect(after.paint.geometryDigest).not.toBe(before.paint.geometryDigest);
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
    'paint',
  );
});

for (const source of ['header', 'placeholder', 'pseudo'] as const) {
  test(
    'coherence detects ' + source + ' font changes outside ordinary main text',
    async ({ page }) => {
      await installFixture(
        page,
        '<header><a id="nav" href="#main">Header navigation</a></header><input id="entry" placeholder="Search public documentation"><div id="generated"></div><main id="main"><h1>Stable page</h1><p>Stable content</p></main>',
        'input{font-family:Arial}input::placeholder{font-family:var(--placeholder-face,Arial)}#generated::before{content:"Generated label";font-family:var(--generated-face,Arial)}',
      );
      const before = await capturePublicPageCoherence(page, 'before');
      expect(before.diagnostics.sources.some((sample) => sample.kind === 'placeholder')).toBe(true);
      expect(before.diagnostics.sources.some((sample) => sample.kind === 'pseudo-before')).toBe(
        true,
      );
      await page.evaluate((source) => {
        const target = document.querySelector<HTMLElement>(
          source === 'header' ? '#nav' : source === 'placeholder' ? '#entry' : '#generated',
        );
        if (!target) throw new Error('Missing controlled text source');
        if (source === 'header') target.style.fontFamily = 'serif';
        else
          target.style.setProperty(
            source === 'placeholder' ? '--placeholder-face' : '--generated-face',
            'serif',
          );
      }, source);
      expect(
        await page.evaluate((source) => {
          const target = document.querySelector(
            source === 'header' ? '#nav' : source === 'placeholder' ? '#entry' : '#generated',
          );
          if (!target) throw new Error('Missing controlled text source');
          return getComputedStyle(
            target,
            source === 'placeholder' ? '::placeholder' : source === 'pseudo' ? '::before' : null,
          ).fontFamily;
        }, source),
      ).toBe('serif');
      const after = await capturePublicPageCoherence(page, 'after');
      expect(after.fonts.body).toBe(before.fonts.body);
      expect(after.fonts.heading).toBe(before.fonts.heading);
      expect(after.main).toEqual(before.main);
      expect(after.fonts.assignmentsDigest).not.toBe(before.fonts.assignmentsDigest);
      expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
        'fonts',
      );
    },
  );
}

test('native control and generated glyph geometry remains explicitly unmeasured', async ({
  page,
}) => {
  await installFixture(
    page,
    '<input placeholder="Inspectable placeholder"><div id="generated"></div><main><h1>Stable page</h1></main>',
    '#generated::before{content:"Generated label"}',
  );
  const snapshot = await capturePublicPageCoherence(page, 'sampled');
  expect(snapshot.paint.unmeasured).toEqual(['control-glyph-geometry', 'pseudo-glyph-geometry']);
  expect(snapshot.diagnostics.sources.map((source) => source.kind)).toContain('placeholder');
  expect(snapshot.diagnostics.sources.map((source) => source.kind)).toContain('pseudo-before');
});

test('coherence rejects same-path origin or query changes', async ({ page }) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.evaluate(() => history.replaceState(null, '', '?changed=1'));
  const after = await capturePublicPageCoherence(page, 'after');
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toEqual([
    'url',
  ]);
  expect(
    comparePublicPageCoherence(before, {
      ...before,
      phase: 'changed-origin',
      url: before.url.replace('localhost', '127.0.0.1'),
    }).map((finding) => finding.field),
  ).toEqual(['url']);
});

test('coherence retains theme markers and actual page colours', async ({ page }) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.evaluate(() => {
    document.body.style.backgroundColor = 'black';
  });
  const after = await capturePublicPageCoherence(page, 'changed-colour');
  expect(after.theme.marker).toBe(before.theme.marker);
  expect(after.theme.bodyBackground).not.toBe(before.theme.bodyBackground);
  expect(comparePublicPageCoherence(before, after).map((finding) => finding.field)).toContain(
    'theme',
  );
});

test('coherence detects changed semantic content and font assignment between phases', async ({
  page,
}) => {
  await installFixture(page);
  const before = await capturePublicPageCoherence(page, 'before');
  await page.locator('p').evaluate((paragraph) => {
    paragraph.textContent = 'Mutated content';
  });
  await page.evaluate(() => {
    document.body.style.fontFamily = 'serif';
  });
  const after = await capturePublicPageCoherence(page, 'after');
  expect(after.main.textDigest).not.toBe(before.main.textDigest);
  expect(after.fonts.assignmentsDigest).not.toBe(before.fonts.assignmentsDigest);
  const fields = comparePublicPageCoherence(before, after).map((finding) => finding.field);
  expect(fields).toContain('fonts');
  expect(fields).toContain('main');
  expect(fields).toContain('paint');
});
