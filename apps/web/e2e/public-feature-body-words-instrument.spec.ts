import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { measurePublicFeatureBodyWords } from './lib/public-feature-body-words';
import { measurePublicFontProof } from './lib/public-page-readiness';
import { scanPublicTypography } from './lib/public-typography';

const nextRoot = path.dirname(require.resolve('next/package.json'));
const sansBytes = readFileSync(
  path.join(nextRoot, 'dist/next-devtools/server/font/geist-latin.woff2'),
);
const monoBytes = readFileSync(
  path.join(nextRoot, 'dist/next-devtools/server/font/geist-mono-latin.woff2'),
);
const style = `
  @font-face { font-family:WordFixtureSans; src:url(data:font/woff2;base64,${sansBytes.toString('base64')}); }
  @font-face { font-family:WordFixtureMono; src:url(data:font/woff2;base64,${monoBytes.toString('base64')}); }
  :root { --font-geist-sans:WordFixtureSans; --font-geist-mono:WordFixtureMono; }
  body { margin:0; color:black; background:white; font-family:var(--font-geist-sans); font-size:18px; line-height:1.6; }
  figure { margin:0; inline-size:320px; }
  p,li { margin:0; overflow-wrap:anywhere; }
  code,.mono { font-family:var(--font-geist-mono); font-size:15px; }
  strong { font-weight:400; }
`;

async function scan(page: Page, markup: string, css = '', afterProofCss = '') {
  await page.setContent(
    `<html lang="en"><head><style>${style}${css}</style></head><body><p>Outside source index</p><p hidden>Hidden source index</p><figure id="fixture-frame" aria-label="Word fixture">${markup}<span class="mono">Registered Mono witness</span></figure></body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByRole('figure', { name: 'Word fixture', exact: true });
  const proof = await measurePublicFontProof(page, frame, [
    { cssVariable: '--font-geist-sans' },
    { cssVariable: '--font-geist-mono' },
  ]);
  if (afterProofCss) {
    await page.addStyleTag({ content: afterProofCss });
    await page.evaluate(() => document.fonts.ready);
  }
  const typography = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#fixture-frame',
  });
  const options = {
    selector: 'p,li',
    fontProofFamilies: proof.expectedFontProof,
  };
  const report = await measurePublicFeatureBodyWords(frame, typography, options);
  return { frame, proof, typography, options, report };
}

async function rawLines(page: Page) {
  return page.getByTestId('copy').evaluate((root) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    return { rects: rects.length, tops: [...new Set(rects.map((rect) => rect.top))] };
  });
}

test('ordinary documentation fails at a word split that the current canonical scanner permits', async ({
  page,
}) => {
  let result = await scan(
    page,
    '<p data-testid="copy">documentation</p>',
    '[data-testid="copy"]{inline-size:5ch}',
  );
  expect((await rawLines(page)).tops.length).toBeGreaterThan(1);
  expect(result.typography.findings).toEqual([]);
  expect(result.typography.unmeasured).toEqual([]);
  expect(result.report.findings).toContainEqual(
    expect.objectContaining({ kind: 'body-word-split', word: 'documentation' }),
  );
  expect(result.report.unmeasured).toEqual([]);
  result = await scan(
    page,
    '<p data-testid="copy">documentation</p>',
    '[data-testid="copy"]{inline-size:30ch}',
  );
  expect(result.report.coverage.ordinaryWords).toBe(1);
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
});

test('a painted Mono bar before Sans body cannot reverse the body font contract', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<div class="mono">Mono bar first</div><p data-testid="copy">documentation</p>',
    '[data-testid="copy"]{inline-size:5ch}',
  );
  expect(result.proof.expectedFontProof.map((font) => font.family)).toEqual([
    'wordfixturemono',
    'wordfixturesans',
  ]);
  expect((await rawLines(page)).tops.length).toBeGreaterThan(1);
  expect(result.report.fontBindings.bodyFamily).toBe('wordfixturesans');
  expect(result.report.fontBindings.monoFamily).toBe('wordfixturemono');
  expect(result.report.words.find((word) => word.text === 'documentation')?.classification).toBe(
    'ordinary',
  );
  expect(result.report.coverage.ordinaryWords).toBe(1);
  expect(result.report.coverage.exemptWords).toBe(0);
  expect(result.report.findings).toContainEqual(
    expect.objectContaining({ kind: 'body-word-split', word: 'documentation' }),
  );
  expect(result.report.unmeasured).toEqual([]);
});

test('pure whitespace separates individually wrapped inline words', async ({ page }) => {
  const result = await scan(
    page,
    '<p data-testid="copy"><span>Useful</span> <span>words</span></p>',
    '[data-testid="copy"]{inline-size:8ch}',
  );
  expect((await rawLines(page)).tops.length).toBeGreaterThan(1);
  expect(result.report.words.map((word) => word.text)).toEqual(['Useful', 'words']);
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
});

test('inline letter decoration keeps multiple same-line rects and catches cross-node word splits', async ({
  page,
}) => {
  const markup = '<p data-testid="copy"><span>docu</span><strong>ment</strong><u>ation</u></p>';
  let result = await scan(page, markup, '[data-testid="copy"]{inline-size:30ch}');
  expect((await rawLines(page)).rects).toBeGreaterThan(1);
  expect(result.report.words).toHaveLength(1);
  expect(result.report.words[0]?.parts).toHaveLength(3);
  expect(result.report.words[0]?.bands).toHaveLength(1);
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
  result = await scan(page, markup, '[data-testid="copy"]{inline-size:5ch}');
  expect((await rawLines(page)).tops.length).toBeGreaterThan(1);
  expect(result.report.findings).toContainEqual(
    expect.objectContaining({ kind: 'body-word-split', word: 'documentation' }),
  );
});

test('inline bidi fragments do not become false lines', async ({ page }) => {
  const result = await scan(
    page,
    '<p data-testid="copy"><span>docu</span><span dir="rtl" style="unicode-bidi:bidi-override">mentation</span></p>',
    '[data-testid="copy"]{inline-size:30ch}',
  );
  expect((await rawLines(page)).rects).toBeGreaterThan(1);
  expect(result.report.words[0]?.text).toBe('documentation');
  expect(result.report.words[0]?.bands).toHaveLength(1);
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
});

for (const text of ['😀 documentation', 'e\u0301ducation', 'straße']) {
  test(`raw UTF-16 ranges remain exact for ${text}`, async ({ page }) => {
    const transform = text === 'straße' ? 'text-transform:uppercase;' : '';
    const markup = `<p data-testid="copy">${text}</p>`;
    let result = await scan(page, markup, `[data-testid="copy"]{inline-size:4ch;${transform}}`);
    const expected = text === '😀 documentation' ? 'documentation' : text;
    const word = result.report.words.find((word) => word.text === expected)!;
    expect(word.start).toBe(text.indexOf(expected));
    expect(word.end).toBe(word.start + expected.length);
    expect(word.parts.map((part) => part.text).join('')).toBe(expected);
    expect(word.parts[0]?.nodeStart).toBe(text.indexOf(expected));
    expect((await rawLines(page)).tops.length).toBeGreaterThan(1);
    expect(result.report.findings).toContainEqual(
      expect.objectContaining({ kind: 'body-word-split', word: expected }),
    );
    result = await scan(page, markup, `[data-testid="copy"]{inline-size:30ch;${transform}}`);
    expect(result.report.findings).toEqual([]);
    expect(result.report.unmeasured).toEqual([]);
  });
}

test('collapsed whitespace keeps raw word offsets instead of normalizing the Range input', async ({
  page,
}) => {
  const text = '😀 \n\t documentation';
  const result = await scan(page, `<p>${text}</p>`);
  const word = result.report.words.find((word) => word.text === 'documentation')!;
  expect(word.start).toBe(text.indexOf('documentation'));
  expect(word.parts[0]?.nodeStart).toBe(text.indexOf('documentation'));
  expect(word.parts[0]?.text).toBe('documentation');
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
});

test('complete code, registered Mono and literal URL intervals remain explicit exemptions', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<p>Read</p><p><code>documentation</code></p><p class="mono">documentation</p><p>https://example.test/documentation</p>',
    'p{inline-size:5ch}',
  );
  expect(
    result.proof.expectedFontProof.find((font) => font.family === 'wordfixturemono')
      ?.matchedRequests,
  ).toBeGreaterThan(0);
  expect(
    result.proof.usedFontFamilies.find((font) => font.family === 'wordfixturemono')
      ?.registeredFaces,
  ).toContainEqual(expect.objectContaining({ family: 'wordfixturemono', status: 'loaded' }));
  expect(result.report.words).toContainEqual(
    expect.objectContaining({ text: 'documentation', classification: 'code' }),
  );
  expect(result.report.words).toContainEqual(
    expect.objectContaining({ text: 'documentation', classification: 'mono' }),
  );
  expect(result.report.words).toContainEqual(
    expect.objectContaining({
      text: 'documentation',
      classification: 'url',
      url: {
        text: 'https://example.test/documentation',
        start: 0,
        end: 'https://example.test/documentation'.length,
      },
    }),
  );
  for (const classification of ['code', 'mono', 'url']) {
    const word = result.report.words.find(
      (word) => word.text === 'documentation' && word.classification === classification,
    )!;
    expect(
      new Set(word.parts.flatMap((part) => part.rects.map((rect) => rect.top))).size,
    ).toBeGreaterThan(1);
  }
  expect(result.report.coverage.ordinaryWords).toBeGreaterThan(0);
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
});

test('an anchor href cannot exempt its ordinary visible label', async ({ page }) => {
  const result = await scan(
    page,
    '<p><a href="https://example.test/documentation">documentation</a></p>',
    'p{inline-size:5ch}',
  );
  expect(result.report.words[0]?.classification).toBe('ordinary');
  expect(result.report.findings).toContainEqual(
    expect.objectContaining({ kind: 'body-word-split', word: 'documentation' }),
  );
});

test('a known sans primary face cannot inherit a Mono exemption from its fallback list', async ({
  page,
}) => {
  const result = await scan(
    page,
    '<p>documentation</p>',
    'p{inline-size:5ch}',
    'p{font-family:var(--font-geist-sans),var(--font-geist-mono)}',
  );
  expect(result.typography.samples.find((sample) => sample.text === 'documentation')?.mono).toBe(
    true,
  );
  expect(result.report.words[0]?.classification).toBe('ordinary');
  expect(result.report.findings).toContainEqual(
    expect.objectContaining({ kind: 'body-word-split', word: 'documentation' }),
  );
});

for (const family of ['FakeMono', 'UnknownFace']) {
  test(`${family} cannot become a font-based exemption`, async ({ page }) => {
    const result = await scan(
      page,
      '<p>documentation</p>',
      '',
      `p{font-family:"${family}",var(--font-geist-sans)}`,
    );
    if (family === 'FakeMono')
      expect(
        result.typography.samples.find((sample) => sample.text === 'documentation')?.mono,
      ).toBe(true);
    expect(result.report.words[0]?.classification).toBe('unmeasured');
    expect(result.report.unmeasured).toContainEqual(
      expect.objectContaining({ kind: 'body-word-font-family-unknown', word: 'documentation' }),
    );
    expect(result.report.coverage.exemptWords).toBe(0);
  });
}

for (const fragment of ['<code>mentation</code>', '<span class="mono">mentation</span>']) {
  test(`partial ${fragment} cannot exempt an ordinary word`, async ({ page }) => {
    const result = await scan(page, `<p>docu${fragment}</p>`);
    expect(result.report.words[0]?.classification).toBe('unmeasured');
    expect(result.report.unmeasured).toContainEqual(
      expect.objectContaining({ kind: 'body-word-mixed-exemption', word: 'documentation' }),
    );
    expect(result.report.coverage.exemptWords).toBe(0);
  });
}

for (const css of [
  'vertical-align:super',
  'position:relative;top:1em',
  'display:inline-block;transform:translateY(28px)',
]) {
  test(`unsupported inline geometry fails closed for ${css}`, async ({ page }) => {
    const result = await scan(page, `<p>docu<span style="${css}">ment</span>ation</p>`);
    expect(result.report.findings).toEqual([]);
    expect(result.report.words[0]?.classification).toBe('unmeasured');
    expect(result.report.unmeasured).toContainEqual(
      expect.objectContaining({ kind: 'unsupported-body-word-style', word: 'documentation' }),
    );
  });
}

test('explicit br and block flow boundaries preserve separate source words', async ({ page }) => {
  const result = await scan(
    page,
    '<p>Useful<br>words</p><p><span style="display:block">Readable</span><span style="display:block">text</span></p>',
  );
  expect(result.report.words.map((word) => word.text)).toEqual([
    'Useful',
    'words',
    'Readable',
    'text',
  ]);
  expect(result.report.findings).toEqual([]);
  expect(result.report.unmeasured).toEqual([]);
});

test('zero selected owners and incomplete canonical sources cannot pass the body contract', async ({
  page,
}) => {
  const result = await scan(page, '<p>documentation</p>');
  expect(result.report.words[0]?.parts[0]?.sourceKey).toBe(
    result.typography.samples.find((sample) => sample.text === 'documentation')?.sourceKey,
  );
  const missingOwner = await measurePublicFeatureBodyWords(result.frame, result.typography, {
    ...result.options,
    selector: 'li',
  });
  expect(missingOwner.coverage.owners).toBe(0);
  expect(missingOwner.unmeasured).toContainEqual(
    expect.objectContaining({ kind: 'missing-body-word-owners' }),
  );
  const missingSource = await measurePublicFeatureBodyWords(
    result.frame,
    { ...result.typography, samples: [] },
    result.options,
  );
  expect(missingSource.unmeasured).toContainEqual(
    expect.objectContaining({ kind: 'body-word-source-not-covered' }),
  );
  expect(missingSource.coverage.ordinaryWords).toBe(0);
});

for (const columnsOn of ['owner', 'figure', 'ancestor'] as const) {
  test(`native same-height column continuation is unmeasured when columns belong to ${columnsOn}`, async ({
    page,
  }, testInfo) => {
    const selector =
      columnsOn === 'owner'
        ? '[data-testid="copy"]'
        : columnsOn === 'figure'
          ? '#fixture-frame'
          : 'body';
    const result = await scan(
      page,
      '<p data-testid="copy">documentation</p>',
      `${selector}{inline-size:12ch;block-size:1.6em;column-count:2;column-gap:16px;column-fill:auto}${columnsOn === 'ancestor' ? '#fixture-frame{inline-size:auto}' : ''}`,
    );
    const native = await page.getByTestId('copy').evaluate((root) => {
      const range = document.createRange();
      range.selectNodeContents(root);
      const rects = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }));
      const ancestors = [];
      for (let element: Element | null = root; element; element = element.parentElement) {
        const css = getComputedStyle(element);
        ancestors.push({
          tag: element.localName,
          columnCount: css.columnCount,
          columnWidth: css.columnWidth,
          height: css.height,
          columnFill: css.columnFill,
        });
      }
      return { source: root.textContent, rects, ancestors };
    });
    await testInfo.attach('native-column-word-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            columnsOn,
            native,
            fontProof: result.proof,
            typography: result.typography,
            bodyWords: result.report,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    expect(native.source).toBe('documentation');
    expect(native.rects.length).toBeGreaterThan(1);
    expect(new Set(native.rects.map((rect) => rect.left)).size).toBeGreaterThan(1);
    expect(
      Math.min(...native.rects.map((rect) => rect.bottom)) -
        Math.max(...native.rects.map((rect) => rect.top)),
    ).toBeGreaterThan(1);
    expect(native.ancestors.some((ancestor) => ancestor.columnCount === '2')).toBe(true);
    const sample = result.typography.samples.find(
      (item) => item.kind === 'text' && item.text === 'documentation',
    );
    expect(sample).toBeDefined();
    const word = result.report.words.find((item) => item.text === 'documentation');
    expect(word).toBeDefined();
    expect(word!.parts.map((part) => part.text).join('')).toBe('documentation');
    expect(word!.parts.every((part) => part.sourceKey === sample!.sourceKey)).toBe(true);
    expect(word!.parts.every((part) => part.family === result.report.fontBindings.bodyFamily)).toBe(
      true,
    );
    expect(word!.parts.every((part) => !part.semanticCode)).toBe(true);
    expect(word!.parts.reduce((units, part) => units + part.nodeEnd - part.nodeStart, 0)).toBe(
      'documentation'.length,
    );
    expect(result.report.coverage.words).toBe(1);
    expect(result.report.coverage.exemptWords).toBe(0);
    expect(word!.classification).toBe('unmeasured');
    expect(word!.parts.some((part) => part.unsupportedStyle.includes('multicolumn'))).toBe(true);
    expect(result.report.unmeasured).toContainEqual(
      expect.objectContaining({ kind: 'unsupported-body-word-style', word: 'documentation' }),
    );
    expect(result.report.coverage.ordinaryWords).toBe(0);
    expect(result.report.findings).toEqual([]);
  });
}

for (const position of ['absolute', 'fixed'] as const) {
  test(`native ${position} fragments cannot create synthetic ordinary word boundaries`, async ({
    page,
  }, testInfo) => {
    const offset = position === 'absolute' ? 'left:80px;top:24px' : 'left:96px;top:52px';
    const result = await scan(
      page,
      `<p data-testid="copy">docu<span style="position:${position};${offset}">ment</span>ation</p>`,
      '[data-testid="copy"]{position:relative}',
    );
    const native = await page.getByTestId('copy').evaluate((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const parts = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const range = document.createRange();
        range.selectNodeContents(node);
        parts.push({
          text: node.data,
          position: getComputedStyle(node.parentElement!).position,
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
        });
      }
      return { source: root.textContent, parts };
    });
    await testInfo.attach('native-out-of-flow-word-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            position,
            native,
            fontProof: result.proof,
            typography: result.typography,
            bodyWords: result.report,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    expect(native.source).toBe('documentation');
    expect(native.parts.map((part) => part.text)).toEqual(['docu', 'ment', 'ation']);
    expect(native.parts.find((part) => part.text === 'ment')?.position).toBe(position);
    expect(
      new Set(native.parts.flatMap((part) => part.rects.map((rect) => rect.top))).size,
    ).toBeGreaterThan(1);
    const canonicalParts = result.typography.samples.filter(
      (sample) => sample.kind === 'text' && ['docu', 'ment', 'ation'].includes(sample.text),
    );
    expect(canonicalParts.map((sample) => sample.text)).toEqual(['docu', 'ment', 'ation']);
    const word = result.report.words.find((item) => item.text === 'documentation');
    expect(word).toBeDefined();
    expect(word!.parts.map((part) => part.text)).toEqual(['docu', 'ment', 'ation']);
    expect(word!.parts.map((part) => part.sourceKey)).toEqual(
      canonicalParts.map((sample) => sample.sourceKey),
    );
    expect(result.report.coverage.words).toBe(1);
    expect(word!.classification).toBe('unmeasured');
    expect(word!.parts.some((part) => part.unsupportedStyle.includes('out-of-flow-fragment'))).toBe(
      true,
    );
    expect(result.report.unmeasured).toContainEqual(
      expect.objectContaining({ kind: 'unsupported-body-word-style', word: 'documentation' }),
    );
    expect(result.report.coverage.ordinaryWords).toBe(0);
    expect(result.report.coverage.exemptWords).toBe(0);
    expect(result.report.findings).toEqual([]);
  });
}

test('a native partially matched family cannot prove the standalone body font contract', async ({
  page,
}, testInfo) => {
  const latinOnlyStyle = style.replace(
    'font-family:WordFixtureSans; src:',
    'font-family:WordFixtureSans; unicode-range:U+0000-00FF; src:',
  );
  expect(latinOnlyStyle).not.toBe(style);
  await page.setContent(
    `<html lang="en"><head><style>${latinOnlyStyle}</style></head><body><figure id="fixture-frame" aria-label="Word fixture"><p data-testid="copy">documentation</p><span style="font-size:20px">😀</span><span class="mono">Registered Mono witness</span></figure></body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  const frame = page.getByRole('figure', { name: 'Word fixture', exact: true });
  const proof = await measurePublicFontProof(page, frame, [
    { cssVariable: '--font-geist-sans' },
    { cssVariable: '--font-geist-mono' },
  ]);
  const bodyProof = proof.expectedFontProof.find((font) => font.family === 'wordfixturesans');
  expect(bodyProof).toBeDefined();
  expect(bodyProof!.matchedRequests).toBeGreaterThan(0);
  expect(bodyProof!.requests).toBeGreaterThan(bodyProof!.matchedRequests);
  expect(proof.fontCoverageGaps).toContainEqual(
    expect.objectContaining({ family: 'wordfixturesans', codepoints: ['U+1F600'] }),
  );
  const typography = await page.evaluate(scanPublicTypography, {
    pageType: 'marketing' as const,
    scopeSelector: '#fixture-frame',
  });
  expect(
    typography.samples.find((sample) => sample.kind === 'text' && sample.text === 'documentation')
      ?.sourceKey,
  ).toBeDefined();
  const report = await measurePublicFeatureBodyWords(frame, typography, {
    selector: 'p,li',
    fontProofFamilies: proof.expectedFontProof,
  });
  await testInfo.attach('native-partial-font-proof-evidence', {
    body: Buffer.from(
      JSON.stringify(
        {
          proof,
          typography,
          bodyWords: report,
          scope: 'Family aggregate matching only; no glyph fallback or all-script claim.',
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
  expect(report.unmeasured).toContainEqual(
    expect.objectContaining({
      kind: 'body-word-variable-family-not-proven',
      detail: 'wordfixturesans',
    }),
  );
  expect(report.coverage.ordinaryWords).toBe(0);
});
