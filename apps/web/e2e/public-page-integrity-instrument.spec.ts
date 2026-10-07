import { expect, test, type Page } from '@playwright/test';

import {
  measurePublicKeyboardFocus,
  measurePublicPageIntegrity,
  measurePublicReducedMotion,
  type IntegrityFinding,
  type PublicIntegrityReport,
} from './lib/public-page-integrity';

const expected = {
  expectedCanonical: 'https://fixture.example/page',
  expectedTitle: 'Fixture page',
  expectedDescription: 'A complete measurement fixture.',
  expectedShareImage: 'https://fixture.example/share.webp',
};

const metadata = `
  <title>${expected.expectedTitle}</title>
  <meta name="description" content="${expected.expectedDescription}">
  <link rel="canonical" href="${expected.expectedCanonical}">
  <meta property="og:image" content="${expected.expectedShareImage}">
  <meta name="twitter:image" content="${expected.expectedShareImage}">
  <meta property="og:url" content="${expected.expectedCanonical}">
`;

const styles = `
  body { margin: 16px; }
  main { padding-bottom: 4px; }
  button { width: 48px; height: 48px; padding: 0; border: 1px solid black; outline: none; }
  button:focus-visible { outline: 3px solid rgb(0, 0, 180); outline-offset: 2px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
`;

const skipLinkBody = `
  <div id="reveal-wrap" class="sr-only">
    <nav aria-label="Skip links"><ul><li>
      <a id="skip" href="#main-content">Skip to main content</a>
    </li></ul></nav>
  </div>
  <header><nav aria-label="Primary">Fixture navigation</nav></header>
  <main id="main-content"><h1>Fixture page</h1><button id="action">Action</button></main>
  <footer>Fixture footer</footer>
`;

const skipLinkStyles = `
  #reveal-wrap nav { position:fixed; top:0; left:0; z-index:10; padding:8px; }
  #reveal-wrap ul { margin:0; padding:0; list-style:none; }
  #skip { display:inline-block; box-sizing:border-box; padding:12px 16px;
    font:16px/20px sans-serif; background:white; color:black; }
  #skip:focus-visible { outline:3px solid blue; outline-offset:2px; }
  #reveal-wrap:focus-within { position:static; width:auto; height:auto;
    overflow:visible; clip:auto; clip-path:none; }
`;

function measuredTarget(report: PublicIntegrityReport, id: string) {
  const target = report.targets.find((candidate) =>
    candidate.subject.split(' ')[0]?.endsWith('#' + id),
  );
  expect(target).toBeDefined();
  if (!target) throw new Error(`Fixture target ${id} was not measured`);
  return target;
}

async function fixture(
  page: Page,
  options: { head?: string; body?: string; css?: string; script?: string } = {},
) {
  await page.setContent(`<!doctype html><html lang="en"><head>
    ${options.head ?? metadata}<style>${styles}${options.css ?? ''}</style>
    </head><body>${
      options.body ??
      `
      <header><nav aria-label="Primary">Fixture navigation</nav></header>
      <main><h1>Fixture page</h1><h2>Details</h2><p>Readable fixture content.</p>
        <button id="action" type="button">Action</button></main>
      <footer>Fixture footer</footer>`
    }
      ${options.script ? `<script>${options.script}</script>` : ''}
    </body></html>`);
}

function hasFinding(findings: IntegrityFinding[], code: string, subject?: string) {
  return findings.some(
    (finding) => finding.code === code && (subject === undefined || finding.subject === subject),
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('accepts complete metadata, accessible structure and touch targets', async ({ page }) => {
  await fixture(page);
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.findings).toEqual([]);
  expect(report.targetMinimumPx).toBe(44);
  expect(report.targets).toHaveLength(1);
  expect(report.headings).toEqual([
    { level: 1, text: 'Fixture page' },
    { level: 2, text: 'Details' },
  ]);
});

test('reports missing and empty metadata without treating absent evidence as valid', async ({
  page,
}) => {
  await fixture(page, { head: '<meta name="description" content="   ">' });
  const report = await measurePublicPageIntegrity(page, expected);
  for (const field of ['title', 'canonical', 'og:image']) {
    expect(hasFinding(report.findings, 'metadata-missing', field)).toBe(true);
  }
  expect(hasFinding(report.findings, 'metadata-empty', 'description')).toBe(true);
  expect(hasFinding(report.findings, 'metadata-unexpected', 'title')).toBe(true);
});

test('reports duplicate identical and conflicting declarations, including streamed body metadata', async ({
  page,
}) => {
  await fixture(page, {
    head: `${metadata}<title>Another title</title>
      <meta name="description" content="${expected.expectedDescription}">
      <link rel="canonical" href="https://fixture.example/other">
      <meta property="og:image" content="https://fixture.example/other.webp">`,
    body: `<header></header><main><h1>Fixture page</h1><button>Action</button></main>
      <footer></footer><meta name="description" content="A conflicting description.">`,
  });
  const report = await measurePublicPageIntegrity(page, expected);
  for (const field of ['title', 'description', 'canonical', 'og:image']) {
    expect(hasFinding(report.findings, 'metadata-duplicate', field)).toBe(true);
    expect(hasFinding(report.findings, 'metadata-conflicting', field)).toBe(true);
  }
  expect(report.metadata['description']).toHaveLength(3);
  await fixture(page);
  expect((await measurePublicPageIntegrity(page, expected)).findings).toEqual([]);
});

test('rejects unsafe, relative and wrong canonical or share-image URLs', async ({ page }) => {
  await fixture(page, {
    head: metadata
      .replace(expected.expectedCanonical, '/page#section')
      .replace(expected.expectedShareImage, 'data:image/png;base64,AA==')
      .replace(
        `content="${expected.expectedShareImage}"`,
        'content="https://user:password@fixture.example/share.webp"',
      ),
  });
  const report = await measurePublicPageIntegrity(page, expected);
  for (const field of ['canonical', 'og:image', 'twitter:image']) {
    expect(hasFinding(report.findings, 'metadata-url-invalid', field)).toBe(true);
  }
  expect(hasFinding(report.findings, 'canonical-fragment')).toBe(true);
  expect(hasFinding(report.findings, 'metadata-conflicting', 'og:url')).toBe(true);
  expect(hasFinding(report.findings, 'metadata-conflicting', 'twitter:image')).toBe(true);
  expect(hasFinding(report.findings, 'metadata-unexpected', 'og:image')).toBe(true);
  await expect(
    measurePublicPageIntegrity(page, { expectedCanonical: '/relative' }),
  ).rejects.toThrow();
  await expect(
    measurePublicPageIntegrity(page, { expectedCanonical: 'https://fixture.example/#section' }),
  ).rejects.toThrow('fragment');
});

test('rejects duplicate headings, skipped levels and missing or unlabelled landmarks', async ({
  page,
}) => {
  await fixture(page, {
    body: `<nav>First</nav><nav>Second</nav><section><h1>First</h1><h1>Second</h1>
      <h3>Skipped</h3><h4></h4><div role="heading" aria-level="7">Invalid</div>
      <button>Action</button></section>`,
  });
  const report = await measurePublicPageIntegrity(page, expected);
  for (const code of [
    'h1-count',
    'heading-level-skipped',
    'heading-empty',
    'heading-level-invalid',
    'navigation-unlabelled',
  ]) {
    expect(hasFinding(report.findings, code)).toBe(true);
  }
  for (const role of ['main', 'banner', 'contentinfo']) {
    expect(hasFinding(report.findings, 'landmark-count', role)).toBe(true);
  }
});

test('includes screen-reader page headings but excludes hidden headings and section headers', async ({
  page,
}) => {
  await fixture(page, {
    body: `<header></header><main><h1 class="sr-only">Fixture page</h1>
      <h1 hidden>Hidden</h1><div aria-hidden="true"><h1>Decorative</h1></div>
      <section><header><h2>Details</h2></header></section><button>Action</button></main><footer></footer>`,
  });
  expect((await measurePublicPageIntegrity(page, expected)).findings).toEqual([]);
  await fixture(page, {
    body: `<header><h1>Outside</h1></header><main aria-labelledby="absent"><button>Action</button></main><footer></footer>`,
  });
  const report = await measurePublicPageIntegrity(page, expected);
  expect(hasFinding(report.findings, 'h1-outside-main')).toBe(true);
  expect(hasFinding(report.findings, 'landmark-label-missing')).toBe(true);
});

test('enforces touch and desktop target floors separately', async ({ page }) => {
  await fixture(page, { css: 'button { width: 40px; height: 40px; }' });
  const touch = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(hasFinding(touch.findings, 'target-too-small')).toBe(true);
  const desktop = await measurePublicPageIntegrity(page, { ...expected, touch: false });
  expect(desktop.targetMinimumPx).toBe(24);
  expect(desktop.findings).toEqual([]);
  await fixture(page, { css: 'button { width: 23px; height: 24px; }' });
  expect(
    hasFinding(
      (await measurePublicPageIntegrity(page, { ...expected, touch: false })).findings,
      'target-too-small',
    ),
  ).toBe(true);
});

test('does not accept native headings whose accessible roles or levels were replaced', async ({
  page,
}) => {
  await fixture(page, {
    body: '<header></header><main><h1 role="presentation">Decorative title</h1><button>Action</button></main><footer></footer>',
  });
  expect(
    hasFinding(
      (await measurePublicPageIntegrity(page, expected)).findings,
      'heading-role-overridden',
    ),
  ).toBe(true);
  await fixture(page, {
    body: '<header></header><main><h1 aria-level="2">Wrong level</h1><button>Action</button></main><footer></footer>',
  });
  expect(hasFinding((await measurePublicPageIntegrity(page, expected)).findings, 'h1-count')).toBe(
    true,
  );
});

test('counts an associated label hit region and rejects an undersized inline target', async ({
  page,
}) => {
  await fixture(page, {
    body: `<header></header><main><h1>Fixture page</h1>
      <label for="check" style="display:flex;align-items:center;width:120px;height:48px;margin-bottom:4px">
        <input id="check" type="checkbox" style="width:16px;height:16px">Confirm</label>
      <button disabled>Disabled</button><button hidden>Hidden</button>
      </main><footer></footer>`,
  });
  const labelled = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(labelled.findings).toEqual([]);
  expect(labelled.targets).toHaveLength(1);
  await fixture(page, {
    body: `<header></header><main><h1>Fixture page</h1>
      <a href="#action" style="font:12px/12px sans-serif">Small link</a></main><footer></footer>`,
  });
  expect(
    hasFinding(
      (await measurePublicPageIntegrity(page, { ...expected, touch: true })).findings,
      'target-too-small',
    ),
  ).toBe(true);
});

test('reports zero target coverage explicitly', async ({ page }) => {
  await fixture(page, {
    body: '<header></header><main><h1>Fixture page</h1><button disabled>Disabled</button></main><footer></footer>',
  });
  const report = await measurePublicPageIntegrity(page, expected);
  expect(report.targets).toEqual([]);
  expect(hasFinding(report.findings, 'target-samples-missing')).toBe(true);
});

test('measures clickable before and after pseudo-element expansions on both axes', async ({
  page,
}) => {
  for (const pseudo of ['::before', '::after']) {
    await fixture(page, {
      body: '<header></header><main><h1>Fixture page</h1><button id="action" aria-label="Action"></button></main><footer></footer>',
      css: `
      button { position:relative; width:20px; height:20px; border:0; }
      button${pseudo} { content:""; position:absolute; left:-12px; top:-12px; width:44px; height:44px; }
    `,
    });
    const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
    expect(report.findings).toEqual([]);
    expect(
      report.targets[0]?.hitRegions.some(
        (region) =>
          region.source === 'element' + pseudo &&
          region.verified &&
          region.hitWidth >= 43.9 &&
          region.hitHeight >= 43.9 &&
          region.ownedSamples > 0,
      ),
    ).toBe(true);
  }
});

test('rejects tall narrow hit areas independently of their height', async ({ page }) => {
  await fixture(page, { css: 'button { width:18px; height:96px; }' });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(hasFinding(report.findings, 'target-too-small')).toBe(true);
  expect(report.targets[0]?.hitRegions[0]?.hitWidth).toBeLessThanOrEqual(18.1);
  expect(report.targets[0]?.hitRegions[0]?.hitHeight).toBeGreaterThan(95);
  expect(report.targets[0]?.hitRegions[0]?.verified).toBe(false);
});

test('does not treat non-clickable pseudo-element geometry as expanded hit area', async ({
  page,
}) => {
  await fixture(page, {
    body: '<header></header><main><h1>Fixture page</h1><button id="action" aria-label="Action"></button></main><footer></footer>',
    css: `
    button { position:relative; width:20px; height:20px; border:0; }
    button::before { content:""; position:absolute; left:-12px; top:-12px; width:44px; height:44px; pointer-events:none; }
  `,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(hasFinding(report.findings, 'target-too-small')).toBe(true);
  expect(
    report.targets[0]?.rectangles.some((region) => region.width === 44 && region.height === 44),
  ).toBe(true);
  expect(report.targets[0]?.hitRegions.every((region) => !region.verified)).toBe(true);
  const nativeWidth = await page.evaluate(() => {
    const button = document.querySelector('button');
    if (!button) throw new Error('Native hit fixture lost its button');
    const box = button.getBoundingClientRect();
    const points = Array.from({ length: 881 }, (_, index) => box.left - 12 + index * 0.05);
    const hits = points.filter(
      (x) => document.elementFromPoint(x, box.top + box.height / 2) === button,
    );
    if (!hits.length) throw new Error('Native hit fixture has no owned sample');
    return (hits.at(-1) ?? 0) - (hits[0] ?? 0) + 0.05;
  });
  expect(nativeWidth).toBeLessThan(24);
  const expanded = report.targets[0]?.hitRegions.find(
    (region) => region.source === 'element::before',
  );
  expect(expanded).toBeDefined();
  expect(Math.abs((expanded?.hitWidth ?? 0) - nativeWidth)).toBeLessThan(0.1);
});

test('reports fully blocked and partly overlapping hit areas despite adequate DOM rectangles', async ({
  page,
}) => {
  for (const cover of [
    '<div style="position:fixed;inset:0;z-index:10"></div>',
    '<div style="position:absolute;left:24px;top:0;width:24px;height:48px;z-index:10"></div>',
  ]) {
    await fixture(page, {
      body: `<header></header><main><h1>Fixture page</h1>
        <div style="position:relative"><button id="action">Action</button>${cover}</div>
        </main><footer></footer>`,
    });
    const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
    expect(hasFinding(report.findings, 'target-occluded')).toBe(true);
    expect(hasFinding(report.findings, 'target-too-small')).toBe(true);
    expect(report.targets[0]?.rectangles[0]).toEqual({ width: 48, height: 48 });
    expect(report.targets[0]?.hitRegions[0]?.blockedSamples).toBeGreaterThan(0);
  }
});

test('detects overlapping controls without counting the neighbouring control as ownership', async ({
  page,
}) => {
  await fixture(page, {
    body: `<header></header><main><h1>Fixture page</h1><div style="position:relative;height:100px">
      <button id="first" style="position:absolute;left:0;top:0">First</button>
      <button id="second" style="position:absolute;left:24px;top:0">Second</button>
      </div></main><footer></footer>`,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.targets).toHaveLength(2);
  expect(
    report.findings.some(
      (finding) => finding.code === 'target-occluded' && finding.subject.includes('#first'),
    ),
  ).toBe(true);
  expect(
    report.targets
      .find((target) => target.subject.includes('#second'))
      ?.hitRegions.some((region) => region.verified),
  ).toBe(true);
});

test('measures visible proxy labels for clipped and hidden native controls', async ({ page }) => {
  for (const inputStyle of ['class="sr-only"', 'style="display:none"']) {
    await fixture(page, {
      body: `<header></header><main><h1>Fixture page</h1>
        <label for="check" style="display:flex;align-items:center;width:80px;height:48px">
          <input id="check" type="checkbox" ${inputStyle}>Confirm</label>
        </main><footer></footer>`,
    });
    const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
    expect(report.findings).toEqual([]);
    expect(report.targets).toHaveLength(1);
    expect(
      report.targets[0]?.hitRegions.some((region) => region.source === 'label' && region.verified),
    ).toBe(true);
    await page.getByText('Confirm', { exact: true }).click();
    expect(await page.getByLabel('Confirm').isChecked()).toBe(true);
  }
});

test('rejects a large proxy label that cannot receive pointer hits', async ({ page }) => {
  await fixture(page, {
    body: `<header></header><main><h1>Fixture page</h1>
      <input id="check" type="checkbox" style="display:none">
      <label for="check" style="display:block;width:80px;height:48px;pointer-events:none">Confirm</label>
      </main><footer></footer>`,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(hasFinding(report.findings, 'target-too-small')).toBe(true);
  expect(report.targets[0]?.hitRegions[0]?.ownedSamples).toBe(0);
});

test('accepts a circular target by its actual axis runs without calling empty corners occlusion', async ({
  page,
}) => {
  await fixture(page, { css: 'button { width:44px; height:44px; border-radius:50%; }' });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.findings).toEqual([]);
  expect(report.targets[0]?.hitRegions[0]?.verified).toBe(true);
  expect(report.targets[0]?.hitRegions[0]?.blockedSamples).toBe(0);
});

test('detects native interception at a flush fractional boundary independently of DOM overlap', async ({
  page,
}) => {
  await fixture(page, { css: 'main { padding-bottom:0; }' });
  const witness = await page.evaluate(() => {
    const button = document.querySelector('button');
    const footer = document.querySelector('footer');
    if (!button || !footer) throw new Error('Boundary fixture lost its elements');
    const box = button.getBoundingClientRect();
    const footerBox = footer.getBoundingClientRect();
    const point = { x: box.left + box.width / 2, y: box.bottom - 0.01 };
    footer.addEventListener('click', () => footer.setAttribute('data-clicked', 'true'));
    return {
      point,
      geometricOverlap: box.bottom > footerBox.top,
      topHit: document.elementFromPoint(point.x, point.y)?.tagName,
    };
  });
  expect(witness.geometricOverlap).toBe(false);
  expect(witness.topHit).toBe('FOOTER');
  await page.mouse.click(witness.point.x, witness.point.y);
  await expect(page.locator('footer')).toHaveAttribute('data-clicked', 'true');
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(hasFinding(report.findings, 'target-occluded')).toBe(true);
  expect(
    report.targets[0]?.hitRegions[0]?.blockedPoints.some((point) => point.topHit === 'footer'),
  ).toBe(true);
});

test('measures a clipped hit area inside the viewport rather than trusting its DOM box', async ({
  page,
}) => {
  await fixture(page, { css: 'button { width:48px; height:48px; clip-path:inset(12px); }' });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(hasFinding(report.findings, 'target-too-small')).toBe(true);
  expect(report.targets[0]?.hitRegions[0]?.hitWidth).toBeLessThan(24.1);
  expect(report.targets[0]?.hitRegions[0]?.hitHeight).toBeLessThan(24.1);
  expect(report.targets[0]?.hitRegions[0]?.sampledBounds.width).toBe(48);
  expect(report.targets[0]?.hitRegions[0]?.maximumSampleGapPx).toBeGreaterThan(0);
  expect(report.targets[0]?.hitRegions[0]?.verified).toBe(false);
});

for (const clip of ['clip-path:inset(50%)', 'clip-path:none;clip:rect(0px,0px,0px,0px)']) {
  test(`measures a native keyboard-revealed skip link after empty ancestor clipping (${clip})`, async ({
    page,
  }) => {
    await fixture(page, {
      body: skipLinkBody,
      css: `${skipLinkStyles} #reveal-wrap { ${clip}; }`,
    });
    const before = await page.evaluate(() => {
      const skip = document.getElementById('skip');
      const wrapper = document.getElementById('reveal-wrap');
      if (!skip || !wrapper) throw new Error('Skip-link fixture lost its elements');
      const rect = skip.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        focus: document.activeElement?.tagName,
        width: wrapper.getBoundingClientRect().width,
        ownsPoint: hit === skip || Boolean(hit && skip.contains(hit)),
        clip: getComputedStyle(wrapper).clip,
        clipPath: getComputedStyle(wrapper).clipPath,
      };
    });
    expect(before.width).toBe(1);
    expect(before.ownsPoint).toBe(false);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
      expect(report.findings).toEqual([]);
      expect(report.restoration.verified).toBe(true);
      const target = measuredTarget(report, 'skip');
      expect(target.focusReveal).toMatchObject({ focused: true, painted: true, restored: true });
      expect(
        target.focusReveal?.reasons.some((reason) => reason.includes('empty clip geometry')),
      ).toBe(true);
      expect(hasFinding(target.focusReveal?.initialFindings ?? [], 'target-too-small')).toBe(true);
      expect(
        target.hitRegions
          .filter((region) => region.state === 'initial')
          .every((region) => region.ownedSamples === 0 && !region.verified),
      ).toBe(true);
      expect(
        target.hitRegions.some(
          (region) =>
            region.state === 'focus-revealed' &&
            region.verified &&
            region.hitWidth >= 43.9 &&
            region.hitHeight >= 43.9,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(() => {
          const wrapper = document.getElementById('reveal-wrap');
          if (!wrapper) throw new Error('Skip-link wrapper was not restored');
          return {
            focus: document.activeElement?.tagName,
            width: wrapper.getBoundingClientRect().width,
            clip: getComputedStyle(wrapper).clip,
            clipPath: getComputedStyle(wrapper).clipPath,
          };
        }),
      ).toEqual({
        focus: before.focus,
        width: before.width,
        clip: before.clip,
        clipPath: before.clipPath,
      });
    }
    const keyboard = await measurePublicKeyboardFocus(page);
    expect(keyboard.findings).toEqual([]);
    expect(
      keyboard.samples.find((sample) => sample.subject.split(' ')[0]?.endsWith('#skip')),
    ).toMatchObject({ visible: true, focusVisible: true });
  });
}

test('measures exact ancestor opacity zero in its focus-revealed state', async ({ page }) => {
  await fixture(page, {
    body: skipLinkBody.replace(' class="sr-only"', ''),
    css: `${skipLinkStyles}
      #reveal-wrap { opacity:0; pointer-events:none; }
      #reveal-wrap:focus-within { opacity:1; pointer-events:auto; }`,
  });
  expect(
    await page.locator('#reveal-wrap').evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('0');
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.findings).toEqual([]);
  const target = measuredTarget(report, 'skip');
  expect(target.focusReveal).toMatchObject({ focused: true, painted: true, restored: true });
  expect(
    target.focusReveal?.reasons.some(
      (reason) => reason.startsWith('div#reveal-wrap ') && reason.endsWith(': opacity 0'),
    ),
  ).toBe(true);
  expect(
    target.hitRegions
      .filter((region) => region.state === 'initial')
      .every((region) => region.ownedSamples === 0),
  ).toBe(true);
  expect(
    target.hitRegions.some((region) => region.state === 'focus-revealed' && region.verified),
  ).toBe(true);
  expect(
    await page.locator('#reveal-wrap').evaluate((element) => getComputedStyle(element).opacity),
  ).toBe('0');
});

test('rejects hidden keyboard targets that stay transparent despite native pointer ownership', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody.replace(' class="sr-only"', ''),
    css: `${skipLinkStyles} #reveal-wrap { opacity:0; }`,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(target.hitRegions.some((region) => region.state === 'initial' && region.verified)).toBe(
    true,
  );
  expect(target.focusReveal).toMatchObject({ focused: true, painted: false, restored: true });
  expect(hasFinding(report.findings, 'target-focus-not-revealed', target.subject)).toBe(true);
});

for (const dimensions of [
  { touch: true, width: 43, height: 44 },
  { touch: false, width: 23, height: 24 },
]) {
  test(`retains failure when a revealed target is below the ${dimensions.touch ? 'touch' : 'desktop'} floor`, async ({
    page,
  }) => {
    await fixture(page, {
      body: skipLinkBody,
      css: `${skipLinkStyles} #skip { padding:0; width:${dimensions.width}px; height:${dimensions.height}px; overflow:hidden; }`,
    });
    const report = await measurePublicPageIntegrity(page, { ...expected, touch: dimensions.touch });
    const target = measuredTarget(report, 'skip');
    expect(target.focusReveal).toMatchObject({ focused: true, painted: true, restored: true });
    expect(hasFinding(target.focusReveal?.initialFindings ?? [], 'target-too-small')).toBe(true);
    expect(
      target.hitRegions
        .filter((region) => region.state === 'focus-revealed')
        .every((region) => !region.verified),
    ).toBe(true);
    expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
  });
}

test('does not substitute a focused enlarged region for an initially visible small control', async ({
  page,
}) => {
  await fixture(page, {
    css: '#action { width:23px; height:24px; } #action:focus { width:48px; height:48px; }',
  });
  const premise = await page.locator('#action').evaluate((element) => {
    const initial = element.getBoundingClientRect().width;
    (element as HTMLElement).focus({ preventScroll: true });
    const focused = element.getBoundingClientRect().width;
    (element as HTMLElement).blur();
    return {
      initial,
      focused,
      restored: element.getBoundingClientRect().width,
      opacity: getComputedStyle(element).opacity,
    };
  });
  expect(premise).toEqual({ initial: 23, focused: 48, restored: 23, opacity: '1' });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: false });
  const target = measuredTarget(report, 'action');
  expect(target.focusReveal).toBeNull();
  expect(target.hitRegions.every((region) => region.state === 'initial')).toBe(true);
  expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
});

test('does not focus away an obstruction over an initially painted control', async ({ page }) => {
  await fixture(page, {
    body: `<header></header><main><h1>Fixture page</h1>
      <div id="covered" style="position:relative"><button id="action">Action</button>
        <div id="cover" style="position:absolute;left:0;top:0;width:48px;height:48px;z-index:10"></div>
      </div></main><footer></footer>`,
    css: '#covered:focus-within #cover { display:none; }',
  });
  const premise = await page.locator('#action').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = () =>
      document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.id;
    const initial = hit();
    (element as HTMLElement).focus({ preventScroll: true });
    const focused = hit();
    (element as HTMLElement).blur();
    return { initial, focused, restored: hit(), opacity: getComputedStyle(element).opacity };
  });
  expect(premise).toEqual({ initial: 'cover', focused: 'action', restored: 'cover', opacity: '1' });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'action');
  expect(target.focusReveal).toBeNull();
  expect(hasFinding(report.findings, 'target-occluded', target.subject)).toBe(true);
  expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
  expect(
    await page.locator('#cover').evaluate((element) => getComputedStyle(element).display),
  ).not.toBe('none');
});

test('rejects a focus-revealed target that is covered in its revealed state', async ({ page }) => {
  await fixture(page, {
    body: `${skipLinkBody}<div id="cover" style="position:fixed;inset:0;z-index:20"></div>`,
    css: skipLinkStyles,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(target.focusReveal).toMatchObject({ focused: true, painted: true, restored: true });
  expect(
    target.hitRegions
      .filter((region) => region.state === 'focus-revealed')
      .every((region) => !region.verified && region.blockedSamples > 0),
  ).toBe(true);
  expect(hasFinding(report.findings, 'target-occluded', target.subject)).toBe(true);
  expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
});

test('does not reveal a hidden target excluded from sequential keyboard navigation', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody.replace('id="skip" href=', 'id="skip" tabindex="-1" href='),
    css: skipLinkStyles,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(target.keyboard).toBe(false);
  expect(target.focusReveal).toBeNull();
  expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
});

test('does not clear hidden target failures when the revealed paint geometry is unsupported', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody.replace(' class="sr-only"', ''),
    css: `${skipLinkStyles} #reveal-wrap { opacity:0; pointer-events:none; }
      #reveal-wrap:focus-within { opacity:1; pointer-events:auto; clip-path:polygon(0 0,100% 0,100% 100%,0 100%); }`,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(target.focusReveal).toMatchObject({ focused: true, painted: false, restored: true });
  expect(hasFinding(report.findings, 'target-focus-reveal-unmeasured', target.subject)).toBe(true);
  expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
});

test('does not certify paint from native ownership when an ancestor filter keeps the revealed target transparent', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody.replace(' class="sr-only"', ''),
    css: `${skipLinkStyles} #reveal-wrap { filter:opacity(0); }
      #skip { opacity:0; } #skip:focus { opacity:1; }`,
  });
  const premise = await page.locator('#skip').evaluate((element) => {
    const target = element as HTMLElement;
    target.focus({ preventScroll: true });
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const result = {
      focused: document.activeElement === target,
      opacity: getComputedStyle(target).opacity,
      ancestorFilter: getComputedStyle(document.getElementById('reveal-wrap')!).filter,
      ownsPoint: hit === target || Boolean(hit && target.contains(hit)),
    };
    target.blur();
    return { ...result, restoredOpacity: getComputedStyle(target).opacity };
  });
  expect(premise).toEqual({
    focused: true,
    opacity: '1',
    ancestorFilter: 'opacity(0)',
    ownsPoint: true,
    restoredOpacity: '0',
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(
    target.hitRegions.some((region) => region.state === 'focus-revealed' && region.verified),
  ).toBe(true);
  expect(target.focusReveal).toMatchObject({ focused: true, painted: false, restored: true });
  expect(hasFinding(report.findings, 'target-focus-reveal-unmeasured', target.subject)).toBe(true);
  expect(
    report.findings.some(
      (finding) =>
        finding.code === 'target-focus-reveal-unmeasured' &&
        finding.message.includes('filter effects'),
    ),
  ).toBe(true);
});

test('restores prior keyboard focus and nested and document scrolling after a hidden-target reveal', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody.replace(
      '<main id="main-content">',
      '<main id="main-content" style="min-height:1800px"><div id="port" style="height:100px;overflow:auto"><div style="height:600px"></div></div>',
    ),
    css: skipLinkStyles,
  });
  const snapshot = () =>
    page.evaluate(() => ({
      focus: document.activeElement?.id,
      window: [scrollX, scrollY],
      port: [
        document.getElementById('port')?.scrollLeft,
        document.getElementById('port')?.scrollTop,
      ],
      bodyTabindex: document.body.getAttribute('tabindex'),
      wrapperWidth: document.getElementById('reveal-wrap')?.getBoundingClientRect().width,
    }));
  await page.evaluate(() => {
    document.getElementById('action')?.focus({ preventScroll: true });
    document.getElementById('port')?.scrollTo(0, 50);
    window.scrollTo(0, 250);
  });
  const before = await snapshot();
  expect(before).toMatchObject({
    focus: 'action',
    window: [0, 250],
    port: [0, 50],
    wrapperWidth: 1,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.findings).toEqual([]);
  expect(report.restoration.verified).toBe(true);
  expect(measuredTarget(report, 'skip').focusReveal).toMatchObject({
    focused: true,
    painted: true,
    restored: true,
  });
  expect(await snapshot()).toEqual(before);
});

test('reports a target whose focus side effect permanently removes the original hidden state', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody,
    css: skipLinkStyles,
    script: `document.getElementById('skip').addEventListener('focus', () => document.getElementById('reveal-wrap').classList.remove('sr-only'), { once:true });`,
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(target.focusReveal).toMatchObject({ focused: true, painted: true, restored: false });
  expect(
    hasFinding(report.findings, 'target-focus-reveal-restoration-mismatch', target.subject),
  ).toBe(true);
  expect(hasFinding(report.findings, 'target-too-small', target.subject)).toBe(true);
  expect(
    await page.locator('#reveal-wrap').evaluate((element) => element.classList.contains('sr-only')),
  ).toBe(false);
});

test('does not verify restoration when a revealed target removes itself on blur', async ({
  page,
}) => {
  await fixture(page, {
    body: skipLinkBody.replace(' class="sr-only"', ''),
    css: `${skipLinkStyles} #skip { opacity:0; } #skip:focus { opacity:1; }`,
    script: `const target = document.getElementById('skip'); window.removedTarget = target;
      target.addEventListener('blur', () => target.remove(), { once:true });`,
  });
  expect(
    await page.locator('#skip').evaluate((element) => ({
      connected: element.isConnected,
      opacity: getComputedStyle(element).opacity,
    })),
  ).toEqual({ connected: true, opacity: '0' });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  const target = measuredTarget(report, 'skip');
  expect(
    target.hitRegions.some((region) => region.state === 'focus-revealed' && region.verified),
  ).toBe(true);
  expect(target.focusReveal).toMatchObject({ focused: true, painted: true, restored: false });
  expect(
    hasFinding(report.findings, 'target-focus-reveal-restoration-mismatch', target.subject),
  ).toBe(true);
  expect(
    await page.evaluate(() => {
      const removed = (window as Window & { removedTarget?: HTMLElement }).removedTarget;
      if (!removed) throw new Error('Blur-removal fixture lost its retained native target');
      return {
        connected: removed.isConnected,
        rootIsDocument: removed.getRootNode() === document,
        opacity: getComputedStyle(removed).opacity,
        focus: document.activeElement?.tagName,
      };
    }),
  ).toEqual({ connected: false, rootIsDocument: false, opacity: '', focus: 'BODY' });
});

test('restores document and nested scrolling after hit measurements', async ({ page }) => {
  await fixture(page, {
    body: `<header></header><main style="min-height:1600px"><h1>Fixture page</h1>
      <div id="scroller" style="height:200px;overflow:auto"><div style="height:500px"></div>
        <button id="action">Action</button><div style="height:500px"></div></div></main><footer></footer>`,
  });
  await page.evaluate(() => {
    document.getElementById('scroller')?.scrollTo(0, 20);
    window.scrollTo(0, 200);
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.findings).toEqual([]);
  expect(
    await page.evaluate(() => ({
      document: scrollY,
      nested: document.getElementById('scroller')?.scrollTop,
    })),
  ).toEqual({ document: 200, nested: 20 });
});

test('verifies both axes, nested scroll ports and original focus after pointer and keyboard scans', async ({
  page,
}) => {
  await fixture(page, {
    body: `<header></header><main style="min-height:2200px"><h1>Fixture page</h1>
      <div id="outer" style="width:280px;height:220px;overflow:auto">
        <div style="width:1100px;height:1400px;padding:400px 0 0 300px;box-sizing:border-box">
          <div id="inner" style="width:240px;height:180px;overflow:auto">
            <div style="position:relative;width:900px;height:1000px">
              <button id="action" style="position:absolute;left:600px;top:700px">Action</button>
            </div>
          </div>
        </div>
      </div></main><footer></footer>`,
  });
  const before = await page.evaluate(() => {
    document.getElementById('outer')?.scrollTo(200, 300);
    document.getElementById('inner')?.scrollTo(100, 80);
    document.getElementById('action')?.focus({ preventScroll: true });
    window.scrollTo(0, 180);
    return {
      outer: [
        document.getElementById('outer')?.scrollLeft,
        document.getElementById('outer')?.scrollTop,
      ],
      inner: [
        document.getElementById('inner')?.scrollLeft,
        document.getElementById('inner')?.scrollTop,
      ],
      window: [scrollX, scrollY],
      focus: document.activeElement?.id,
    };
  });
  for (const measure of [
    () => measurePublicPageIntegrity(page, { ...expected, touch: true }),
    () => measurePublicKeyboardFocus(page),
  ]) {
    const report = await measure();
    expect(report.findings).toEqual([]);
    expect(report.restoration.verified).toBe(true);
    expect(report.restoration.frames).toBe(12);
    expect(report.restoration.focus).toMatchObject({
      expected: 'button#action',
      actual: 'button#action',
      verified: true,
    });
    for (const id of ['outer', 'inner']) {
      expect(
        report.restoration.scrollPorts.find((port) => port.subject === 'div#' + id),
      ).toMatchObject({ connected: true, sameRoot: true, verified: true });
    }
    expect(
      await page.evaluate(() => ({
        outer: [
          document.getElementById('outer')?.scrollLeft,
          document.getElementById('outer')?.scrollTop,
        ],
        inner: [
          document.getElementById('inner')?.scrollLeft,
          document.getElementById('inner')?.scrollTop,
        ],
        window: [scrollX, scrollY],
        focus: document.activeElement?.id,
      })),
    ).toEqual(before);
  }
});

test('reports a scroll-handler side effect that prevents restoring a nested position', async ({
  page,
}) => {
  await fixture(page, {
    body: `<header></header><main style="min-height:1600px"><h1>Fixture page</h1>
      <div id="scroller" style="height:200px;overflow:auto"><div style="height:500px"></div>
        <button id="action">Action</button><div style="height:500px"></div></div></main><footer></footer>`,
  });
  await page.evaluate(() => {
    const scroller = document.getElementById('scroller');
    if (!scroller) throw new Error('Fixture scroll port is missing');
    scroller.scrollTop = 20;
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const scroller = document.getElementById('scroller');
    if (!scroller) throw new Error('Fixture scroll port is missing');
    let changed = false;
    scroller.addEventListener('scroll', () => {
      if (scroller.scrollTop > 100) changed = true;
      if (changed && scroller.scrollTop === 20) {
        scroller.dataset['restorationBlocked'] = 'true';
        scroller.scrollTop = 0;
      }
    });
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.restoration.verified).toBe(false);
  expect(
    hasFinding(report.findings, 'interaction-restoration-scroll-mismatch', 'div#scroller'),
  ).toBe(true);
  expect(hasFinding(report.findings, 'interaction-restoration-unstable')).toBe(true);
  expect(
    report.restoration.scrollPorts.find((port) => port.subject === 'div#scroller'),
  ).toMatchObject({ expected: { x: 0, y: 20 }, actual: { x: 0, y: 0 }, verified: false });
  await expect(page.locator('#scroller')).toHaveAttribute('data-restoration-blocked', 'true');
  expect(await page.locator('#scroller').evaluate((element) => element.scrollTop)).toBe(0);
});

test('reports focus stolen during restoration instead of claiming the original focus returned', async ({
  page,
}) => {
  await fixture(page, {
    body: '<header></header><main><h1>Fixture page</h1><button id="action">Action</button><button id="other">Other</button></main><footer></footer>',
  });
  await page.evaluate(() => {
    const action = document.getElementById('action');
    const other = document.getElementById('other');
    if (!action || !other) throw new Error('Fixture focus targets are missing');
    action.focus();
    action.addEventListener('focus', () => {
      action.dataset['focusIntercepted'] = 'true';
      other.focus({ preventScroll: true });
    });
  });
  const report = await measurePublicKeyboardFocus(page);
  expect(report.restoration.verified).toBe(false);
  expect(
    hasFinding(report.findings, 'interaction-restoration-focus-mismatch', 'button#action'),
  ).toBe(true);
  expect(report.restoration.focus).toMatchObject({
    expected: 'button#action',
    actual: 'button#other',
    connected: true,
    rootAccessible: true,
    verified: false,
  });
  await expect(page.locator('#action')).toHaveAttribute('data-focus-intercepted', 'true');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('other');
});

test('reports disconnected original focus and scroll ports with no fabricated position samples', async ({
  page,
}) => {
  await fixture(page, {
    body: `<header></header><main style="min-height:1600px"><h1>Fixture page</h1>
      <div id="scroller" style="height:200px;overflow:auto"><div style="height:500px"></div>
        <button id="action">Action</button><div style="height:500px"></div></div></main><footer></footer>`,
  });
  await page.evaluate(() => {
    document.getElementById('action')?.focus({ preventScroll: true });
    const scroller = document.getElementById('scroller');
    if (!scroller) throw new Error('Fixture scroll port is missing');
    scroller.addEventListener('scroll', () => scroller.remove(), { once: true });
  });
  const report = await measurePublicPageIntegrity(page, { ...expected, touch: true });
  expect(report.restoration.verified).toBe(false);
  expect(
    hasFinding(report.findings, 'interaction-restoration-scroll-port-lost', 'div#scroller'),
  ).toBe(true);
  expect(hasFinding(report.findings, 'interaction-restoration-focus-lost', 'button#action')).toBe(
    true,
  );
  expect(
    report.restoration.scrollPorts.find((port) => port.subject === 'div#scroller'),
  ).toMatchObject({ connected: false, actual: null, verified: false });
  expect(await page.locator('#scroller').count()).toBe(0);
});

test('restores observable open shadow scroll and focus without claiming embedded or closed coverage', async ({
  page,
}) => {
  await fixture(page, { css: 'main { min-height:1600px; }' });
  await page.evaluate(() => {
    const host = document.createElement('fixture-open');
    document.querySelector('main')?.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<div id="shadow-port" style="height:80px;width:100px;overflow:auto"><div style="height:500px;width:300px"><button id="shadow-focus">Focus</button></div></div>';
    const port = root.getElementById('shadow-port');
    const focus = root.getElementById('shadow-focus');
    if (!(port instanceof HTMLElement) || !(focus instanceof HTMLElement))
      throw new Error('Fixture shadow state is missing');
    port.scrollTo(50, 30);
    focus.focus({ preventScroll: true });
    document.getElementById('action')?.addEventListener('focus', () => port.scrollTo(120, 200));
  });
  const report = await measurePublicKeyboardFocus(page);
  expect(report.restoration.verified).toBe(true);
  expect(report.restoration.scope).toBe('document-and-open-shadow-roots');
  expect(report.restoration.openShadowRoots).toBe(1);
  expect(report.restoration.focus).toMatchObject({
    expected: 'button#shadow-focus',
    actual: 'button#shadow-focus',
    verified: true,
  });
  expect(
    report.restoration.scrollPorts.find((port) => port.subject === 'div#shadow-port'),
  ).toMatchObject({ expected: { x: 50, y: 30 }, actual: { x: 50, y: 30 }, verified: true });
  expect(
    await page.evaluate(() => {
      const root = document.querySelector('fixture-open')?.shadowRoot;
      const port = root?.getElementById('shadow-port');
      return { focus: root?.activeElement?.id, x: port?.scrollLeft, y: port?.scrollTop };
    }),
  ).toEqual({ focus: 'shadow-focus', x: 50, y: 30 });
  expect(report.limits.some((limit) => limit.includes('Closed shadow roots'))).toBe(true);
});

test('marks focused opaque custom roots as unmeasured', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const host = document.createElement('fixture-closed');
    document.querySelector('main')?.append(host);
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<button id="closed-focus">Focus</button>';
    root.querySelector('button')?.focus();
  });
  const report = await measurePublicKeyboardFocus(page);
  expect(report.restoration.verified).toBe(false);
  expect(report.restoration.openShadowRoots).toBe(0);
  expect(report.restoration.focus.rootAccessible).toBe(false);
  expect(
    hasFinding(report.findings, 'interaction-restoration-focus-unmeasured', 'fixture-closed'),
  ).toBe(true);
});

test('reports inaccessible embedded focus without claiming the child document was restored', async ({
  page,
}) => {
  await fixture(page, {
    body: '<header></header><main><h1>Fixture page</h1><button id="action">Action</button><iframe id="embedded" title="Embedded fixture" srcdoc="<button id=inside>Inside</button>"></iframe></main><footer></footer>',
  });
  const witness = await page.evaluate(() => {
    const frame = document.getElementById('embedded');
    if (!(frame instanceof HTMLIFrameElement))
      throw new Error('Fixture embedded document is missing');
    const button = frame.contentDocument?.getElementById('inside');
    if (!button) throw new Error('Fixture embedded focus is missing');
    button.focus();
    return { outer: document.activeElement?.id, inner: frame.contentDocument?.activeElement?.id };
  });
  expect(witness).toEqual({ outer: 'embedded', inner: 'inside' });
  const report = await measurePublicKeyboardFocus(page);
  expect(report.restoration.verified).toBe(false);
  expect(report.restoration.embeddedDocuments).toBe(1);
  expect(report.restoration.focus).toMatchObject({
    expected: 'iframe#embedded',
    rootAccessible: false,
    verified: false,
  });
  expect(
    hasFinding(report.findings, 'interaction-restoration-focus-unmeasured', 'iframe#embedded'),
  ).toBe(true);
});

test('bounds restoration when animation-frame callbacks stop arriving', async ({ page }) => {
  await fixture(page);
  const native = await page.evaluateHandle(() => requestAnimationFrame);
  try {
    await page.evaluate(() => {
      const button = document.getElementById('action');
      if (!button) throw new Error('Fixture target is missing');
      button.addEventListener(
        'focus',
        () => {
          window.requestAnimationFrame = () => 0;
        },
        { once: true },
      );
    });
    const report = await measurePublicKeyboardFocus(page);
    expect(report.restoration.verified).toBe(false);
    expect(report.restoration.frames).toBe(0);
    expect(report.restoration.elapsedMs).toBeGreaterThanOrEqual(999);
    expect(report.restoration.elapsedMs).toBeLessThan(2000);
    expect(hasFinding(report.findings, 'interaction-restoration-timeout')).toBe(true);
    expect(hasFinding(report.findings, 'interaction-restoration-unstable')).toBe(true);
  } finally {
    await page.evaluate((original) => {
      window.requestAnimationFrame = original;
    }, native);
    await native.dispose();
  }
});

test('propagates hit-test API failures and restores scroll before a repeat measurement', async ({
  page,
}) => {
  await fixture(page, { css: 'main { min-height:1600px; }' });
  await page.evaluate(() => {
    window.scrollTo(0, 200);
    document.elementFromPoint = () => {
      throw new Error('fixture hit measurement failed');
    };
  });
  await expect(measurePublicPageIntegrity(page, { ...expected, touch: true })).rejects.toThrow(
    'fixture hit measurement failed',
  );
  expect(await page.evaluate(() => scrollY)).toBe(200);
  await page.evaluate(() => Reflect.deleteProperty(document, 'elementFromPoint'));
  expect((await measurePublicPageIntegrity(page, { ...expected, touch: true })).findings).toEqual(
    [],
  );
});

test('measures keyboard focus and restores focus, body attributes and scroll between runs', async ({
  page,
}) => {
  await fixture(page, { css: 'main { min-height: 1600px; }' });
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '5');
    document.getElementById('action')?.focus({ preventScroll: true });
    window.scrollTo(0, 200);
  });
  for (let run = 0; run < 2; run += 1) {
    const report = await measurePublicKeyboardFocus(page);
    expect(report.targetCount).toBe(1);
    expect(report.samples).toHaveLength(1);
    expect(report.samples[0]?.indicator).toContain('outline');
    expect(report.findings).toEqual([]);
    expect(
      await page.evaluate(() => ({
        focus: document.activeElement?.id,
        tabindex: document.body.getAttribute('tabindex'),
        scroll: scrollY,
      })),
    ).toEqual({ focus: 'action', tabindex: '5', scroll: 200 });
  }
});

test('does not mistake a permanent outline or absent focus style for a focus indicator', async ({
  page,
}) => {
  for (const css of [
    'button:focus-visible { outline: none; }',
    'button, button:focus-visible { outline: 3px solid blue; outline-offset: 2px; }',
  ]) {
    await fixture(page, { css });
    const report = await measurePublicKeyboardFocus(page);
    expect(hasFinding(report.findings, 'keyboard-indicator-missing')).toBe(true);
    expect(report.samples).toHaveLength(1);
  }
  await fixture(page);
  expect((await measurePublicKeyboardFocus(page)).findings).toEqual([]);
  expect(await page.evaluate(() => document.body.hasAttribute('tabindex'))).toBe(false);
});

test('reports covered and transparent focused controls', async ({ page }) => {
  for (const css of [
    'body::after { content:""; position:fixed; inset:0; background:white; z-index:10; }',
    'main { opacity: 0; }',
  ]) {
    await fixture(page, { css });
    expect(
      hasFinding((await measurePublicKeyboardFocus(page)).findings, 'keyboard-focus-not-visible'),
    ).toBe(true);
  }
});

test('reports keyboard traps and missing sequential targets instead of passing partial coverage', async ({
  page,
}) => {
  await fixture(page, {
    script:
      'document.addEventListener("keydown", event => { if (event.key === "Tab") event.preventDefault(); });',
  });
  const trapped = await measurePublicKeyboardFocus(page);
  expect(trapped.targetCount).toBe(1);
  expect(hasFinding(trapped.findings, 'keyboard-sampling-incomplete')).toBe(true);
  expect(hasFinding(trapped.findings, 'keyboard-target-unexpected')).toBe(true);
  await fixture(page, { body: '<main><h1>No controls</h1></main>' });
  const absent = await measurePublicKeyboardFocus(page);
  expect(hasFinding(absent.findings, 'keyboard-samples-missing')).toBe(true);
});

test('accepts stationary reduced-motion samples with measured timing and no leaked findings', async ({
  page,
}) => {
  await fixture(page);
  for (let run = 0; run < 2; run += 1) {
    const report = await measurePublicReducedMotion(page, { durationMs: 150, sampleCount: 4 });
    expect(report.findings).toEqual([]);
    expect(report.reducedMotion).toBe(true);
    expect(report.samples).toBe(4);
    expect(report.sampleTimesMs).toHaveLength(4);
    expect(report.observedDurationMs).toBeGreaterThanOrEqual(149);
    expect(report.elementCount).toBeGreaterThan(0);
  }
});

test('reports motion when the reduced-motion premise is absent', async ({ page }) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const report = await measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 });
  expect(report.reducedMotion).toBe(false);
  expect(hasFinding(report.findings, 'reduced-motion-not-enabled')).toBe(true);
});

test('detects CSS animations, dormant transitions and animated pseudo-elements', async ({
  page,
}) => {
  await fixture(page, {
    css: `
    @keyframes drift { from { transform: translateX(0); } to { transform: translateX(20px); } }
    button { animation: drift 1s infinite alternate; transition: opacity 200ms; }
    button::before { content:""; position:absolute; width:5px; height:5px; animation: drift 1s infinite; }
  `,
  });
  const report = await measurePublicReducedMotion(page, { durationMs: 150, sampleCount: 4 });
  expect(hasFinding(report.findings, 'reduced-motion-css-animation')).toBe(true);
  expect(hasFinding(report.findings, 'reduced-motion-css-transition')).toBe(true);
  expect(
    report.findings.some(
      (finding) =>
        finding.code === 'reduced-motion-css-animation' && finding.subject.endsWith('::before'),
    ),
  ).toBe(true);
  expect(hasFinding(report.findings, 'reduced-motion-waapi-active')).toBe(true);
  expect(hasFinding(report.findings, 'reduced-motion-geometry-change')).toBe(true);
  await fixture(page);
  expect(
    (await measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 })).findings,
  ).toEqual([]);
});

test('accepts exact tiny computed scientific durations while still reporting their motion', async ({
  page,
}) => {
  await fixture(page, { css: 'button { transition: opacity 0.00001s; }' });
  expect(
    await page
      .locator('#action')
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe('1e-05s');
  const report = await measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 });
  expect(hasFinding(report.findings, 'reduced-motion-css-transition')).toBe(true);
});

test('rejects negative, nonfinite and malformed computed duration strings', async ({ page }) => {
  await fixture(page);
  const native = await page.evaluateHandle(() => window.getComputedStyle);
  try {
    for (const value of [
      'invalid',
      '-1e-05s',
      '1e999s',
      '1e-s',
      'NaNs',
      'Infinitys',
      '1.s',
      '--1s',
      '1e-05xs',
    ]) {
      await page.evaluate(
        ({ original, value }) => {
          window.getComputedStyle = (element, pseudo) => {
            const css = original(element, pseudo);
            if (element.id !== 'action' || pseudo) return css;
            return new Proxy(css, {
              get(target, key) {
                if (key === 'transitionDuration') return value;
                const result: unknown = Reflect.get(target, key, target);
                return typeof result === 'function' ? result.bind(target) : result;
              },
            });
          };
        },
        { original: native, value },
      );
      await expect(
        measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 }),
      ).rejects.toThrow('Unmeasurable CSS duration ' + value);
    }
  } finally {
    await page.evaluate((original) => {
      window.getComputedStyle = original;
    }, native);
    await native.dispose();
  }
  expect(
    (await measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 })).findings,
  ).toEqual([]);
});

test('detects Web Animations API motion independently of CSS declarations', async ({ page }) => {
  await fixture(page, {
    script: `
    document.getElementById('action').animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }],
      { duration: 1000, iterations: Infinity });
  `,
  });
  const report = await measurePublicReducedMotion(page, { durationMs: 150, sampleCount: 4 });
  expect(hasFinding(report.findings, 'reduced-motion-waapi-active')).toBe(true);
  expect(hasFinding(report.findings, 'reduced-motion-css-animation')).toBe(false);
  expect(hasFinding(report.findings, 'reduced-motion-style-change')).toBe(true);
});

test('detects JavaScript transform motion without an animation object', async ({ page }) => {
  await fixture(page, {
    script: `
    window.fixtureTimer = setInterval(() => {
      window.fixtureStep = (window.fixtureStep || 0) + 1;
      document.getElementById('action').style.transform = 'translateX(' + window.fixtureStep + 'px)';
    }, 16);
  `,
  });
  const report = await measurePublicReducedMotion(page, { durationMs: 150, sampleCount: 4 });
  await page.evaluate(() => {
    const timer: unknown = Reflect.get(window, 'fixtureTimer');
    if (typeof timer !== 'number') throw new Error('Fixture interval identifier is missing');
    clearInterval(timer);
  });
  expect(hasFinding(report.findings, 'reduced-motion-geometry-change')).toBe(true);
  expect(hasFinding(report.findings, 'reduced-motion-style-change')).toBe(true);
  expect(report.animationCount).toBe(0);
});

test('samples visible decorative and inert content under reduced motion', async ({ page }) => {
  await fixture(page, {
    body: '<div id="decorative" inert aria-hidden="true" style="width:100px;height:100px">Visible decoration</div>',
    script: `document.getElementById('decorative').animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }],
      { duration: 1000, iterations: Infinity });`,
  });
  const report = await measurePublicReducedMotion(page, { durationMs: 150, sampleCount: 4 });
  expect(hasFinding(report.findings, 'reduced-motion-waapi-active')).toBe(true);
  expect(hasFinding(report.findings, 'reduced-motion-geometry-change')).toBe(true);
});

test('reports rendered sample replacement and zero rendered samples', async ({ page }) => {
  await fixture(page, {
    script: `
    window.fixtureTimer = setInterval(() => {
      const action = document.getElementById('action');
      action.replaceWith(action.cloneNode(true));
    }, 20);
  `,
  });
  const replaced = await measurePublicReducedMotion(page, { durationMs: 150, sampleCount: 4 });
  await page.evaluate(() => {
    const timer: unknown = Reflect.get(window, 'fixtureTimer');
    if (typeof timer !== 'number') throw new Error('Fixture interval identifier is missing');
    clearInterval(timer);
  });
  expect(hasFinding(replaced.findings, 'motion-sample-lost')).toBe(true);
  expect(hasFinding(replaced.findings, 'motion-sample-added')).toBe(true);
  await fixture(page, { css: 'body { display: none; }' });
  const absent = await measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 });
  expect(absent.elementCount).toBe(0);
  expect(hasFinding(absent.findings, 'motion-samples-missing')).toBe(true);
});

test('propagates measurement API errors and rejects an inadequate sample window', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    document.getAnimations = () => {
      throw new Error('fixture animation measurement failed');
    };
  });
  await expect(
    measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 }),
  ).rejects.toThrow('fixture animation measurement failed');
  await page.evaluate(() => Reflect.deleteProperty(document, 'getAnimations'));
  expect(
    (await measurePublicReducedMotion(page, { durationMs: 100, sampleCount: 3 })).findings,
  ).toEqual([]);
  await expect(measurePublicReducedMotion(page, { durationMs: 99 })).rejects.toThrow('100ms');
  await expect(measurePublicReducedMotion(page, { sampleCount: 2 })).rejects.toThrow(
    'three samples',
  );
});
