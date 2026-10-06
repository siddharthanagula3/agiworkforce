import { expect, test, type Page } from '@playwright/test';
import { scanPublicTypography, type PublicTypographyOptions } from './lib/public-typography';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';

const STYLE = `
  :root { --font-geist-sans: Arial; --font-geist-mono: "Courier New"; color-scheme: light; }
  body { margin: 24px; font-family: var(--font-geist-sans); font-size: 16px; color: rgb(32,32,32); background: white; }
  p { margin: 0; font-size: 18px; line-height: 1.65; }
  h1 { margin: 0; font-size: 40px; line-height: 1.2; font-weight: 600; }
  h2 { margin: 0; font-size: 28px; line-height: 1.2; }
  code,pre { font-family: var(--font-geist-mono); font-size: 15px; }
`;

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

async function scan(
  page: Page,
  markup: string,
  css = '',
  options: PublicTypographyOptions = { pageType: 'marketing', pathname: '/fixture' },
) {
  await page.setContent(
    `<html lang="en"><head><style>${STYLE}${css}</style></head><body>${markup}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(scanPublicTypography, options);
}

test('keeps passing text and reports each declared-size failure until corrected', async ({
  page,
}) => {
  let result = await scan(
    page,
    '<span id="small">Visible label</span>',
    '#small { font-size: 12px; }',
  );
  expect(result.findings.map((item) => item.kind)).toContain('declared-size-floor');
  result = await scan(page, '<span id="small">Visible label</span>', '#small { font-size: 14px; }');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  expect(result.coverage.textSamples).toBe(1);
});

test('rejects an arbitrary size and accepts the body fluid range', async ({ page }) => {
  let result = await scan(page, '<p id="body">Short body copy.</p>', '#body { font-size: 19px; }');
  expect(result.findings.map((item) => item.kind)).toContain('size-outside-scale');
  result = await scan(
    page,
    '<p id="body">Short body copy.</p>',
    '#body { font-size: clamp(17px,1.2vw,18px); }',
  );
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

for (const transform of [
  '#outer { transform: scale(.5); }',
  '#outer { transform: scale(.75); } #label { transform: scale(.5); display: inline-block; }',
  '#outer { scale: .5; }',
  '#outer { zoom: .5; }',
]) {
  test(`measures rendered compression: ${transform}`, async ({ page }) => {
    let result = await scan(
      page,
      '<div id="outer"><span id="label">Scaled label</span></div>',
      transform,
    );
    expect(result.samples[0]?.declaredSize).toBe(16);
    expect(result.findings.map((item) => item.kind)).toContain('rendered-size-floor');
    result = await scan(page, '<div id="outer"><span id="label">Scaled label</span></div>');
    expect(result.findings).toEqual([]);
    expect(result.unmeasured).toEqual([]);
  });
}

test('translation and rotation do not inflate or shrink the declared em', async ({ page }) => {
  const result = await scan(
    page,
    '<span id="label">Rotated label</span>',
    '#label { display:inline-block; transform:translate(50px,20px) rotate(35deg); }',
  );
  expect(result.samples[0]?.renderedSize).toBeCloseTo(16, 2);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('container-scaled mockups fail below the floor and pass after their font is corrected', async ({
  page,
}) => {
  const markup = '<div id="device"><span id="label" aria-hidden="true">Mockup receipt</span></div>';
  let result = await scan(
    page,
    markup,
    '#device { container-type:inline-size; width:200px; } #label { font-size:5cqw; }',
  );
  expect(result.samples[0]?.declaredSize).toBe(10);
  expect(result.findings.map((item) => item.kind)).toContain('declared-size-floor');
  result = await scan(
    page,
    markup,
    '#device { container-type:inline-size; width:200px; } #label { font-size:8cqw; }',
  );
  expect(result.samples[0]?.declaredSize).toBe(16);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('excludes actual legacy and modern hidden text, not visible accessibility classes', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<span id="legacy">Hidden legacy text</span><span id="modern">Hidden modern text</span><span id="visible" class="sr-only" aria-hidden="true">Visible mockup text</span>',
    `
    #legacy { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
    #modern { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  `,
  );
  expect(result.samples.map((item) => item.selector)).toEqual(['#visible']);
  expect(result.excluded.map((item) => item.reason)).toContain('zero-clip');
  expect(result.excluded.map((item) => item.reason)).toContain('zero-clip-path');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('hidden text and low-opacity visible text remain distinct', async ({ page }) => {
  const result = await scan(
    page,
    '<div id="outer"><span id="faint">Faint visible text</span></div><span id="gone">Invisible text</span>',
    '#outer { opacity:.5; } #faint { opacity:.5; } #gone { opacity:0; }',
  );
  expect(result.samples.map((item) => item.selector)).toEqual(['#faint']);
  expect(result.samples[0]?.cumulativeOpacity).toBeCloseTo(0.25);
  expect(result.findings.map((item) => item.kind)).toContain('text-opacity');
  expect(
    result.excluded.some((item) => item.selector === '#gone' && item.reason === 'opacity-zero'),
  ).toBe(true);
});

test('reports text clipped inside a fitting frame until the frame is corrected', async ({
  page,
}) => {
  const markup = '<div id="frame"><p id="copy">Readable text in a small frame.</p></div>';
  let result = await scan(page, markup, '#frame { width:200px; height:10px; overflow:hidden; }');
  expect(result.findings.map((item) => item.kind)).toContain('text-clipped');
  result = await scan(page, markup, '#frame { width:400px; min-height:80px; overflow:visible; }');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('scrollable mockup text stays readable and requires every scroll state to be observed', async ({
  page,
}) => {
  const markup =
    '<div id="frame"><div id="scroller"><div id="wide"><span id="first">First receipt</span><span id="last">Last receipt</span></div></div></div>';
  const css =
    '#frame { width:240px; overflow:hidden; } #scroller { width:240px; overflow-x:auto; } #wide { width:720px; display:flex; justify-content:space-between; } span { white-space:nowrap; font-family:var(--font-geist-mono); font-size:15px; }';
  const start = await scan(page, markup, css);
  expect(start.findings).toEqual([]);
  expect(start.unmeasured.map((item) => item.kind)).toContain('unobserved-scroll-state');
  expect(start.scrollContainers).toHaveLength(1);
  const container = start.scrollContainers[0]!;
  expect(container.maxX).toBe(480);
  expect(start.samples.find((sample) => sample.selector === '#last')?.renderedSize).toBe(15);
  const last = start.scrollCoverage.find((item) => item.sourceText === 'Last receipt')!;
  expect(last.visibleRanges).toEqual([]);
  expect(last.requiredRanges.length).toBeGreaterThan(0);
  await page.evaluate(
    ({ elementIndex, x }) => document.querySelectorAll('*')[elementIndex]!.scrollTo(x, 0),
    { elementIndex: container.elementIndex, x: container.maxX },
  );
  const end = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    pathname: '/fixture',
  } satisfies PublicTypographyOptions);
  expect(end.findings).toEqual([]);
  expect(end.unmeasured.map((item) => item.kind)).toContain('unobserved-scroll-state');
  const lastAtEnd = end.scrollCoverage.find((item) => item.sourceKey === last.sourceKey)!;
  expect(lastAtEnd.visibleRanges).toEqual(lastAtEnd.requiredRanges);
  for (const required of start.scrollCoverage) {
    const observations = [...start.scrollCoverage, ...end.scrollCoverage].filter(
      (item) => item.sourceKey === required.sourceKey,
    );
    expect(
      required.requiredRanges.every(([low, high]) =>
        observations.some((item) =>
          item.visibleRanges.some(([start, end]) => start <= low && end >= high),
        ),
      ),
    ).toBe(true);
  }
});

test('overflow:hidden mockup cropping remains a permanent failure', async ({ page }) => {
  const result = await scan(
    page,
    '<div id="frame"><div id="wide"><span id="last">Cropped receipt</span></div></div>',
    '#frame { width:240px; overflow:hidden; } #wide { width:720px; text-align:right; } #last { font-family:var(--font-geist-mono); font-size:15px; white-space:nowrap; }',
  );
  expect(result.findings.map((item) => item.kind)).toContain('text-clipped');
  expect(result.scrollContainers).toEqual([]);
  expect(result.unmeasured.map((item) => item.kind)).not.toContain('unobserved-scroll-state');
});

test('RTL scrollports expose negative horizontal positions for the state sweep', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<div id="frame"><div id="wide"><span>First receipt</span><span>Last receipt</span></div></div>',
    '#frame { width:240px; overflow:auto; direction:rtl; } #wide { display:flex; justify-content:space-between; width:720px; } span { white-space:nowrap; font-family:var(--font-geist-mono); font-size:15px; }',
  );
  const container = result.scrollContainers[0]!;
  expect(container.minX).toBe(-480);
  expect(container.maxX).toBe(0);
  await page.evaluate(
    ({ elementIndex, x }) => document.querySelectorAll('*')[elementIndex]!.scrollTo(x, 0),
    { elementIndex: container.elementIndex, x: container.minX },
  );
  const end = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    pathname: '/fixture',
  } satisfies PublicTypographyOptions);
  expect(end.scrollContainers[0]?.x).toBe(-480);
  expect(end.findings).toEqual([]);
  expect(end.unmeasured.map((item) => item.kind)).toContain('unobserved-scroll-state');
});

test('translation out of a hidden frame fails while a scrollable translation is pending', async ({
  page,
}) => {
  const markup = '<div id="frame"><div id="translated"><span>Translated receipt</span></div></div>';
  let result = await scan(
    page,
    markup,
    '#frame { width:240px; overflow:hidden; } #translated { transform:translateX(400px); }',
  );
  expect(result.findings.map((item) => item.kind)).toContain('text-clipped');
  result = await scan(
    page,
    markup,
    '#frame { width:240px; overflow:auto; } #translated { transform:translateX(400px); }',
  );
  expect(result.findings.map((item) => item.kind)).not.toContain('text-clipped');
  expect(result.unmeasured.map((item) => item.kind)).toContain('unobserved-scroll-state');
  expect(result.scrollContainers[0]?.maxX).toBeGreaterThan(0);
});

test('rotated clipping and scrollports cannot pass using rectangular bounds', async ({ page }) => {
  const markup = '<div id="outer"><div id="frame"><span>Rotated receipt</span></div></div>';
  let result = await scan(
    page,
    markup,
    '#outer { transform:rotate(20deg); width:240px; } #frame { overflow:hidden; height:10px; }',
  );
  expect(result.unmeasured.map((item) => item.kind)).toContain('rotated-clipping');
  result = await scan(
    page,
    markup,
    '#outer { transform:rotate(20deg); width:240px; } #frame { overflow:auto; width:100px; } #frame span { white-space:nowrap; }',
  );
  expect(result.unmeasured.map((item) => item.kind)).toContain('rotated-scrollport');
});

test('uses the longest rendered line even with normal line height and a short final line', async ({
  page,
}) => {
  const long = 'M'.repeat(90);
  let result = await scan(
    page,
    `<p id="copy">${long}\nshort</p>`,
    '#copy { white-space:pre-line; line-height:normal; width:1400px; overflow-wrap:normal; }',
  );
  expect(result.lines.find((item) => item.selector === '#copy')?.longest).toBe(90);
  expect(result.findings.map((item) => item.kind)).toContain('running-line-length');
  result = await scan(
    page,
    '<p id="copy">Readable text\nshort</p>',
    '#copy { white-space:pre-line; line-height:normal; }',
  );
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('joins inline descendants and counts combining characters as graphemes', async ({ page }) => {
  const result = await scan(
    page,
    '<p id="copy">One <em>useful</em> <a href="#copy">linked</a> é example.</p>',
  );
  const measured = result.lines.find((item) => item.selector === '#copy');
  expect(measured?.lines).toEqual(['One useful linked é example.']);
  expect(measured?.longest).toBe(28);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('keeps a superscript on its surrounding rendered line', async ({ page }) => {
  const result = await scan(
    page,
    '<p id="copy">One useful<sup>1</sup> example.</p>',
    'sup { font-size:14px; vertical-align:super; }',
  );
  expect(result.lines.find((item) => item.selector === '#copy')?.lines).toEqual([
    'One useful1 example.',
  ]);
});

test('reports heading orphans and lexical word splits until wrapping is corrected', async ({
  page,
}) => {
  let result = await scan(page, '<h1 id="title">A useful heading<br>now</h1>');
  expect(result.findings.map((item) => item.kind)).toContain('heading-orphan');
  result = await scan(page, '<h1 id="title">A useful heading now</h1>');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  result = await scan(
    page,
    '<h1 id="title">Uninterruptible</h1>',
    '#title { width:100px; word-break:break-all; }',
  );
  expect(result.findings.map((item) => item.kind)).toContain('heading-word-split');
  result = await scan(
    page,
    '<h1 id="title">Uninterruptible</h1>',
    '#title { width:700px; word-break:normal; }',
  );
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('block heading phrases and hidden text do not create false lexical splits', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<h1 id="title"><span>First phrase</span><span>Second phrase</span><span id="hidden">unpainted text</span></h1>',
    '#title>span { display:block; } #title>#hidden { display:none; }',
  );
  expect(
    await page.evaluate(() => getComputedStyle(document.getElementById('hidden')!).display),
  ).toBe('none');
  expect(result.lines.find((item) => item.selector === '#title')?.lines).toEqual([
    'First phrase',
    'Second phrase',
  ]);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('enforces three desktop title lines and two wide-desktop title lines', async ({ page }) => {
  let result = await scan(
    page,
    '<h1 id="title">First phrase<br>Second phrase<br>Third phrase<br>Fourth phrase</h1>',
  );
  expect(result.findings.map((item) => item.kind)).toContain('title-line-count');
  await page.setViewportSize({ width: 1920, height: 1080 });
  result = await scan(page, '<h1 id="title">First phrase<br>Second phrase<br>Third phrase</h1>');
  expect(result.findings.map((item) => item.kind)).toContain('title-line-count');
  result = await scan(page, '<h1 id="title">First phrase<br>Second phrase</h1>');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('permits only the actual AGI wordmark serif exception', async ({ page }) => {
  let result = await scan(
    page,
    '<span class="agi-mark-word" id="wordmark">AGI</span><h1 id="title">Product title</h1>',
    '#wordmark,#title { font-family:Georgia; }',
  );
  expect(
    result.findings.some((item) => item.kind === 'font-family' && item.selector === '#wordmark'),
  ).toBe(false);
  expect(
    result.findings.some((item) => item.kind === 'font-family' && item.selector === '#title'),
  ).toBe(true);
  result = await scan(
    page,
    '<span class="agi-mark-word" id="wordmark">AGI</span><h1 id="title">Product title</h1>',
    '#wordmark { font-family:Georgia; }',
  );
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  result = await scan(
    page,
    '<span class="agi-mark-word" id="fake">Other words</span>',
    '#fake { font-family:Georgia; }',
  );
  expect(result.findings.map((item) => item.kind)).toContain('font-family');
});

test('allows the actual shared header and footer wordmarks beside a text-free icon', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<header><a class="agi-ds-wordmark"><svg width="24" height="24"><path d="M0 0h24v24H0z"/></svg> AGI </a></header><footer><span class="agi-ds-footer-wordmark">\n AGI \n</span></footer>',
    '.agi-ds-wordmark,.agi-ds-footer-wordmark { font-family:Georgia; font-size:24px; }',
  );
  expect(result.samples.filter((sample) => sample.role === 'wordmark')).toHaveLength(2);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('navigation headings use UI sizes while content headings and the small-text contrast floor remain strict', async ({
  page,
}) => {
  const markup =
    '<main><header><h1 id="title">Page title</h1></header><h2 id="section">Main section</h2></main><footer><h2 id="footer">Resources</h2></footer>';
  let result = await scan(
    page,
    markup,
    ':root { color-scheme:dark; } body { background:black; color:#aaa; } #footer { font-size:14px; color:#888; }',
  );
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  expect(result.samples.find((sample) => sample.selector === '#footer')?.role).toBe('ui');
  expect(result.samples.find((sample) => sample.selector === '#title')?.role).toBe('page-title');
  const dim = evaluatePublicTextContrast(result.samples, result.canvasColor!);
  expect(dim.unmeasured).toEqual([]);
  expect(dim.findings).toHaveLength(1);
  expect(dim.findings[0]?.selector).toBe('#footer');
  expect(dim.findings[0]?.minimum).toBe(7);
  result = await scan(
    page,
    markup,
    ':root { color-scheme:dark; } body { background:black; color:#aaa; } #footer { font-size:14px; }',
  );
  expect(result.findings).toEqual([]);
  const readable = evaluatePublicTextContrast(result.samples, result.canvasColor!);
  expect(readable.findings).toEqual([]);
  expect(readable.unmeasured).toEqual([]);
  result = await scan(page, markup, '#footer { font-size:16px; }');
  expect(result.samples.find((sample) => sample.selector === '#footer')?.role).toBe('ui');
  expect(result.samples.find((sample) => sample.selector === '#footer')?.renderedSize).toBe(16);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  result = await scan(
    page,
    markup,
    '#footer { font-size:15px; font-family:var(--font-geist-mono); } #section { font-size:14px; }',
  );
  expect(
    result.findings.some((item) => item.selector === '#footer' && item.kind === 'font-family'),
  ).toBe(true);
  expect(
    result.findings.some(
      (item) => item.selector === '#section' && item.kind === 'size-outside-scale',
    ),
  ).toBe(true);
});

test('checks the canonical mono font and its higher floor', async ({ page }) => {
  let result = await scan(
    page,
    '<code id="code">print(value)</code>',
    '#code { font-family:Georgia; font-size:14px; }',
  );
  expect(result.findings.map((item) => item.kind)).toContain('font-family');
  expect(result.findings.map((item) => item.kind)).toContain('declared-size-floor');
  result = await scan(page, '<code id="code">print(value)</code>');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

for (const pageType of ['docs', 'legal'] as const) {
  test(`${pageType} uses the reading floor and line-height range`, async ({ page }) => {
    let result = await scan(
      page,
      '<p id="copy">Readable policy or documentation text.</p>',
      '#copy { font-size:16px; line-height:1.65; }',
      { pageType },
    );
    expect(result.findings).toEqual([]);
    expect(result.unmeasured).toEqual([]);
    result = await scan(
      page,
      '<p id="copy">Readable policy or documentation text.</p>',
      '#copy { font-size:16px; line-height:1.3; }',
      { pageType },
    );
    expect(result.findings.map((item) => item.kind)).toContain('reading-line-height');
    result = await scan(
      page,
      '<p id="copy">Readable policy or documentation text.</p>',
      '#copy { font-size:15px; line-height:1.65; }',
      { pageType },
    );
    expect(result.findings.map((item) => item.kind)).toContain('declared-size-floor');
  });
}

test('includes placeholders and literal generated labels with failure and correction', async ({
  page,
}) => {
  const markup =
    '<input id="input" placeholder="Visible placeholder"><button id="button"></button>';
  let result = await scan(
    page,
    markup,
    '#input { font-family:Arial; font-size:12px; } #button { font-family:Arial; font-size:12px; } #button::before { content:"Generated label"; }',
  );
  expect(result.samples.map((item) => item.kind)).toContain('placeholder');
  expect(result.samples.map((item) => item.kind)).toContain('pseudo-before');
  expect(result.findings.filter((item) => item.kind === 'declared-size-floor')).toHaveLength(2);
  result = await scan(
    page,
    markup,
    '#input,#button { font-family:Arial; font-size:16px; } #button::before { content:"Generated label"; }',
  );
  expect(result.findings).toEqual([]);
  expect(result.unmeasured.map((item) => item.kind)).toEqual(['generated-text-geometry']);
});

test('includes painted select labels, omits non-text input values and masks passwords', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<select id="select"><option value="internal-value">Visible choice</option></select><input id="check" type="checkbox" value="not-painted"><input id="password" type="password" value="private-text">',
    'select,input { font-family:Arial; font-size:16px; }',
  );
  expect(result.samples.find((sample) => sample.selector === '#select')?.text).toBe(
    'Visible choice',
  );
  expect(result.samples.some((sample) => sample.selector === '#check')).toBe(false);
  expect(result.samples.find((sample) => sample.selector === '#password')?.text).toBe(
    '•'.repeat(12),
  );
  expect(JSON.stringify(result)).not.toContain('private-text');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('native picker and default button text remain explicitly unmeasured', async ({ page }) => {
  const result = await scan(page, '<input type="date"><input type="submit">');
  expect(result.unmeasured.map((item) => item.kind)).toContain('native-control-text');
  expect(result.unmeasured.map((item) => item.kind)).toContain('native-input-label');
});

test('generated prose geometry and unsupported perspective cannot produce a clean report', async ({
  page,
}) => {
  let result = await scan(
    page,
    '<p id="copy">Real text.</p>',
    '#copy::before { content:"Generated prose "; }',
  );
  expect(result.unmeasured.map((item) => item.kind)).toContain('generated-prose-line-geometry');
  result = await scan(
    page,
    '<div id="stage"><span id="label">Perspective text</span></div>',
    '#stage { perspective:600px; } #label { display:inline-block; transform:rotateY(20deg); }',
  );
  expect(result.unmeasured.map((item) => item.kind)).toContain('unsupported-text-transform');
  expect(result.samples[0]?.renderedSize).toBeNull();
  result = await scan(page, '<span id="label">Flat text</span>');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('retains all findings and captures complete paint layers', async ({ page }) => {
  const markup = Array.from(
    { length: 100 },
    (_, index) => `<span id="label-${index}">Bad label ${index}</span>`,
  ).join('');
  const result = await scan(
    page,
    `<div id="outer">${markup}</div>`,
    '#outer { opacity:.5; background:linear-gradient(red,blue); filter:brightness(.9); } span { font-size:12px; }',
  );
  expect(result.findings.filter((item) => item.kind === 'declared-size-floor')).toHaveLength(100);
  expect(result.samples).toHaveLength(100);
  const sample = result.samples[0]!;
  expect(sample.backgroundLayers.map((layer) => layer.selector)).toContain('body');
  expect(sample.backgroundLayers.map((layer) => layer.selector)).toContain('html');
  expect(sample.backgroundLayers.find((layer) => layer.selector === '#outer')?.image).toContain(
    'linear-gradient',
  );
  expect(sample.paintUnmeasured).not.toContain('background-image');
  expect(sample.paintUnmeasured).toContain('filter');
  expect(sample.foreground).toEqual({ r: 32, g: 32, b: 32, a: 1 });
  expect(sample.cumulativeOpacity).toBeCloseTo(0.5);
});

test('returns the browser-resolved canvas color in both color schemes', async ({ page }) => {
  const light = await scan(page, '<span>Canvas label</span>');
  const dark = await scan(page, '<span>Canvas label</span>', ':root { color-scheme:dark; }');
  expect(light.canvasColor?.a).toBe(1);
  expect(dark.canvasColor?.a).toBe(1);
  expect(dark.canvasColor).not.toEqual(light.canvasColor);
  expect(
    await page.evaluate(
      () =>
        [...document.documentElement.children].filter((element) => element.localName === 'div')
          .length,
    ),
  ).toBe(0);
});

test('retains a visible descendant under a hidden background ancestor', async ({ page }) => {
  const result = await scan(
    page,
    '<div id="outer"><span id="label">Visible child</span></div>',
    '#outer { visibility:hidden; background:blue; } #label { visibility:visible; }',
  );
  expect(result.samples).toHaveLength(1);
  expect(
    result.samples[0]?.backgroundLayers.find((layer) => layer.selector === '#outer')?.visibility,
  ).toBe('hidden');
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
});

test('empty pages and missing canonical fonts fail measurement', async ({ page }) => {
  let result = await scan(page, '');
  expect(result.unmeasured.map((item) => item.kind)).toContain('no-painted-text');
  result = await scan(page, '<span>Readable text</span>', ':root { --font-geist-sans:initial; }');
  expect(result.unmeasured.map((item) => item.kind)).toContain('missing-canonical-font');
});

test('scoped measurement preserves default reports and global text indexes', async ({ page }) => {
  const options = { pageType: 'marketing', pathname: '/fixture' } as const;
  const whole = await scan(
    page,
    '<span class="label">Same label</span><figure id="frame"><span class="label">Same label</span></figure>',
    '.label { font-size:12px; } #frame .label { font-size:14px; }',
    options,
  );
  const scoped = await page.evaluate(scanPublicTypography, { ...options, scopeSelector: '#frame' });
  expect(scoped.scope).toMatchObject({ selector: '#frame', tag: 'figure', label: null });
  expect(scoped.coverage.textNodes).toBe(1);
  expect(scoped.samples).toHaveLength(1);
  expect(scoped.samples[0]?.sourceKey).toBe(whole.samples[1]?.sourceKey);
  expect(scoped.findings).toEqual([]);
  expect(scoped.unmeasured).toEqual([]);
  expect(whole.findings.map((item) => item.kind)).toContain('declared-size-floor');
  expect(await page.evaluate(scanPublicTypography, options)).toEqual(whole);
  await page.addStyleTag({ content: '#frame .label { font-size:12px; }' });
  const changed = await page.evaluate(scanPublicTypography, {
    ...options,
    scopeSelector: '#frame',
  });
  expect(changed.findings.filter((item) => item.kind === 'declared-size-floor')).toHaveLength(1);
});

test('scoped whole-block findings survive split text nodes until corrected', async ({ page }) => {
  const options = { pageType: 'marketing', scopeSelector: '#frame' } as const;
  const result = await scan(
    page,
    `<section id="frame"><h2 id="title"><span>A useful heading</span><br><span>now</span></h2><p id="copy"><span>${'a'.repeat(100)}</span></p></section>`,
    '#copy { white-space:nowrap; }',
    options,
  );
  expect(
    result.findings.some((item) => item.kind === 'heading-orphan' && item.selector === '#title'),
  ).toBe(true);
  expect(
    result.findings.some(
      (item) => item.kind === 'running-line-length' && item.selector === '#copy',
    ),
  ).toBe(true);
  expect(result.findings.every((item) => item.sourceKey === undefined)).toBe(true);
  const corrected = await scan(
    page,
    '<section id="frame"><h2>A useful heading now</h2><p>Readable body copy.</p></section>',
    '',
    options,
  );
  expect(corrected.findings).toEqual([]);
  expect(corrected.unmeasured).toEqual([]);
});

test('scoped control samples retain global indexes and include the scope root', async ({
  page,
}) => {
  const whole = await scan(
    page,
    '<input id="outside" placeholder="Outside"><input id="frame" placeholder="Scoped placeholder"><select id="choice"><option>Scoped choice</option></select>',
    'input,select { font-family:Arial; font-size:16px; }',
  );
  const scoped = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#frame',
  });
  expect(scoped.samples).toHaveLength(1);
  expect(scoped.samples[0]?.kind).toBe('placeholder');
  expect(scoped.samples[0]?.sourceKey).toBe(
    whole.samples.find((item) => item.selector === '#frame')?.sourceKey,
  );
  expect(scoped.findings).toEqual([]);
  expect(scoped.unmeasured).toEqual([]);
  const selected = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#choice',
  });
  expect(selected.samples.map((item) => [item.kind, item.text])).toEqual([
    ['value', 'Scoped choice'],
  ]);
  expect(selected.findings).toEqual([]);
  expect(selected.unmeasured).toEqual([]);
  await page.locator('#frame').fill('Scoped value');
  const filled = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#frame',
  });
  expect(filled.samples.map((item) => [item.kind, item.text])).toEqual([['value', 'Scoped value']]);
  await page.addStyleTag({ content: '#frame { font-size:12px; }' });
  const small = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#frame',
  });
  expect(small.findings.map((item) => item.kind)).toContain('declared-size-floor');
});

test('scoped generated text includes root pseudos and retains unknown geometry', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<span id="outside">Outside label</span><span id="frame">Scoped label</span>',
    '#outside::before { content:"Outside generated"; font-size:12px; } #frame::before { content:"Scoped generated"; font-size:12px; }',
    { pageType: 'marketing', scopeSelector: '#frame' },
  );
  expect(result.samples.map((item) => [item.kind, item.text])).toEqual([
    ['text', 'Scoped label'],
    ['pseudo-before', 'Scoped generated'],
  ]);
  expect(
    result.findings.some(
      (item) => item.kind === 'declared-size-floor' && item.text === 'Scoped generated',
    ),
  ).toBe(true);
  expect(result.unmeasured.map((item) => item.kind)).toContain('generated-text-geometry');
  expect(JSON.stringify(result)).not.toContain('Outside generated');
  await page.addStyleTag({ content: '#frame::before { content:none; }' });
  const corrected = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#frame',
  });
  expect(corrected.findings).toEqual([]);
  expect(corrected.unmeasured).toEqual([]);
});

test('scope keeps ancestor clipping and fully clipped text until corrected', async ({ page }) => {
  const markup =
    '<div id="clip"><figure id="frame"><span id="label">Readable label</span><span id="later">Later label</span></figure></div>';
  const result = await scan(
    page,
    markup,
    '#clip { position:relative; width:200px; height:5px; overflow:hidden; } #frame { margin:0; } #later { position:absolute; top:60px; }',
    { pageType: 'marketing', scopeSelector: '#frame' },
  );
  expect(result.coverage.textNodes).toBe(2);
  expect(result.findings.map((item) => item.kind)).toContain('text-clipped');
  expect(
    result.excluded.some((item) => item.selector === '#later' && item.reason === 'fully-clipped'),
  ).toBe(true);
  const corrected = await scan(page, markup, '#clip { width:400px; } #frame { margin:0; }', {
    pageType: 'marketing',
    scopeSelector: '#frame',
  });
  expect(corrected.samples).toHaveLength(2);
  expect(corrected.findings).toEqual([]);
  expect(corrected.unmeasured).toEqual([]);
  expect(corrected.excluded).toEqual([]);
});

test('scope crossing an enclosing typography block stays explicitly unmeasured', async ({
  page,
}) => {
  const options = { pageType: 'marketing', scopeSelector: '#frame' } as const;
  const result = await scan(
    page,
    '<p id="copy">Outside words <span id="frame">Scoped words</span></p>',
    '',
    options,
  );
  expect(result.samples.map((item) => item.text)).toEqual(['Scoped words']);
  expect(result.unmeasured).toContainEqual({
    kind: 'scope-enclosing-block',
    selector: '#frame',
    text: 'Scoped words',
    expected: '#copy',
    actual: undefined,
  });
  const corrected = await page.evaluate(scanPublicTypography, {
    ...options,
    scopeSelector: '#copy',
  });
  expect(corrected.findings).toEqual([]);
  expect(corrected.unmeasured).toEqual([]);
});

for (const scopeSelector of ['', '#missing', '.duplicate', '[', 'head']) {
  test(`invalid scope cannot produce a clean report: ${JSON.stringify(scopeSelector)}`, async ({
    page,
  }) => {
    await scan(
      page,
      '<span class="duplicate">First label</span><span class="duplicate">Second label</span>',
    );
    await expect(
      page.evaluate(scanPublicTypography, { pageType: 'marketing' as const, scopeSelector }),
    ).rejects.toThrow();
  });
}

test('empty and hidden scopes cannot borrow painted text from outside', async ({ page }) => {
  let result = await scan(page, '<span>Outside label</span><figure id="frame"></figure>', '', {
    pageType: 'marketing',
    scopeSelector: '#frame',
  });
  expect(result.samples).toEqual([]);
  expect(result.unmeasured.map((item) => item.kind)).toContain('no-painted-text');
  result = await scan(
    page,
    '<span>Outside label</span><figure id="frame"><span>Hidden label</span></figure>',
    '#frame { display:none; }',
    { pageType: 'marketing', scopeSelector: '#frame' },
  );
  expect(result.coverage.textNodes).toBe(1);
  expect(result.samples).toEqual([]);
  expect(result.excluded.map((item) => item.text)).toEqual(['Hidden label']);
  expect(result.unmeasured.map((item) => item.kind)).toContain('no-painted-text');
});
