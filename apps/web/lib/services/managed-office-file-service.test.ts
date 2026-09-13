import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  createManagedOfficeFileToolDefinition,
  generateManagedOfficeFile,
} from './managed-office-file-service';

describe('managed Office file service', () => {
  it('offers one path-free DOCX/PPTX tool definition', () => {
    const definition = createManagedOfficeFileToolDefinition();
    const serialized = JSON.stringify(definition);

    expect(definition.function.name).toBe('create_office_file');
    expect(serialized).toContain('docx');
    expect(serialized).toContain('pptx');
    expect(serialized).toContain('xlsx');
    expect(serialized).toContain('csv');
    expect(serialized).not.toMatch(/file[_ ]?path|directory|host path/i);
  });

  it('rejects host paths and oversized document content', async () => {
    await expect(
      generateManagedOfficeFile({
        format: 'docx',
        filename: '/tmp/report.docx',
        title: 'Quarterly report',
        content: 'Safe content',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'invalid_office_file_request',
      message: 'The Office file request is invalid.',
    });

    await expect(
      generateManagedOfficeFile({
        format: 'docx',
        filename: 'report.docx',
        title: 'Quarterly report',
        content: 'x'.repeat(100_001),
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'invalid_office_file_request',
      message: 'The Office file request is invalid.',
    });
  });

  it('creates a real DOCX package with the requested content', async () => {
    const result = await generateManagedOfficeFile({
      format: 'docx',
      filename: 'launch-brief',
      title: 'Launch brief',
      content: '# Priorities\n\n- Website\n- Mobile\n\nShip the real behavior.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('launch-brief.docx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.data.subarray(0, 2).toString()).toBe('PK');

    const archive = await JSZip.loadAsync(result.data);
    const documentXml = await archive.file('word/document.xml')?.async('string');
    const stylesXml = await archive.file('word/styles.xml')?.async('string');
    const numberingXml = await archive.file('word/numbering.xml')?.async('string');
    expect(documentXml).toContain('Launch brief');
    expect(documentXml).toContain('Website');
    expect(documentXml).toContain('Ship the real behavior.');
    expect(documentXml).toMatch(/<w:pgSz[^>]*w:w="12240"[^>]*w:h="15840"/);
    expect(documentXml).toMatch(
      /<w:pgMar[^>]*w:top="1440"[^>]*w:right="1440"[^>]*w:bottom="1440"[^>]*w:left="1440"[^>]*w:header="708"[^>]*w:footer="708"/,
    );
    expect(stylesXml).toMatch(/<w:style[^>]*w:styleId="Heading1"[\s\S]*?<w:sz w:val="32"/);
    expect(stylesXml).toMatch(/<w:style[^>]*w:styleId="Heading1"[\s\S]*?<w:color w:val="2E74B5"/);
    expect(numberingXml).toMatch(/<w:numFmt w:val="bullet"/);
    expect(numberingXml).toMatch(/<w:ind w:left="720" w:hanging="360"/);
    expect(numberingXml).toMatch(/<w:spacing w:after="160" w:line="280"/);
  });

  it('turns a pipe table in DOCX content into a real Word table', async () => {
    const result = await generateManagedOfficeFile({
      format: 'docx',
      filename: 'cost-report',
      title: 'Cost report',
      content: [
        '# Vendors',
        '',
        '| Vendor | Region | Annual cost |',
        '| --- | --- | --- |',
        '| Halcyon Supply | EMEA | 88400 |',
        '| Ridgeway Labs | APAC | 13975 |',
        '',
        'Totals exclude tax.',
      ].join('\n'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const archive = await JSZip.loadAsync(result.data);
    const documentXml = (await archive.file('word/document.xml')?.async('string')) ?? '';
    const table = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(documentXml)?.[0] ?? '';

    expect(table).not.toBe('');
    expect(table.match(/<w:tr\b/g)).toHaveLength(3);
    expect(table).toContain('Annual cost');
    expect(table).toContain('Ridgeway Labs');
    expect(table).not.toContain('---');
    expect(documentXml).toContain('Totals exclude tax.');
  });

  it('creates an XLSX workbook with named sheets, real formulas and a chart part', async () => {
    const result = await generateManagedOfficeFile({
      format: 'xlsx',
      filename: 'quarterly',
      title: 'Quarterly numbers',
      sheets: [
        {
          name: 'Sales',
          rows: [
            ['Month', 'Units', 'Price', 'Total'],
            ['Jan', 120, 12.5, '=B2*C2'],
            ['Feb', 140, 12.5, '=B3*C3'],
            ['Grand total', '', '', '=SUM(D2:D3)'],
          ],
        },
        {
          name: 'Regions',
          rows: [
            ['Region', 'Revenue'],
            ['North', 4100],
            ['South', 5200],
          ],
          chart: {
            type: 'bar',
            title: 'Revenue by region',
            category_column: 'A',
            value_column: 'B',
            first_row: 2,
            last_row: 3,
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('quarterly.xlsx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const archive = await JSZip.loadAsync(result.data);
    const workbook = (await archive.file('xl/workbook.xml')?.async('string')) ?? '';
    expect(workbook).toContain('name="Sales"');
    expect(workbook).toContain('name="Regions"');

    const sales = (await archive.file('xl/worksheets/sheet1.xml')?.async('string')) ?? '';
    expect(sales).toContain('<f>B2*C2</f>');
    expect(sales).toContain('<f>SUM(D2:D3)</f>');
    expect(sales).toContain('<t xml:space="preserve">Month</t>');

    const chart = (await archive.file('xl/charts/chart1.xml')?.async('string')) ?? null;
    expect(chart).toBeNull();
    const regionsChart = (await archive.file('xl/charts/chart2.xml')?.async('string')) ?? '';
    expect(regionsChart).toContain('<c:barChart>');
    expect(regionsChart).toContain('Revenue by region');
    expect(regionsChart).toContain('&apos;Regions&apos;!$A$2:$A$3');
    expect(await archive.file('xl/drawings/drawing2.xml')?.async('string')).toContain(
      'graphicFrame',
    );
    const regions = (await archive.file('xl/worksheets/sheet2.xml')?.async('string')) ?? '';
    expect(regions).toContain('<drawing r:id="rId1"/>');
  });

  it('creates a real PDF and a real CSV', async () => {
    const pdf = await generateManagedOfficeFile({
      format: 'pdf',
      filename: 'summary',
      title: 'Q3 summary',
      content: '# Results\n\nRevenue grew.\n\n- Retention held\n',
    });

    expect(pdf.ok).toBe(true);
    if (!pdf.ok) return;
    expect(pdf.filename).toBe('summary.pdf');
    expect(pdf.mimeType).toBe('application/pdf');
    expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');

    const csv = await generateManagedOfficeFile({
      format: 'csv',
      filename: 'regions',
      title: 'Regions',
      rows: [
        ['region', 'revenue'],
        ['north, upper', 4100],
      ],
    });

    expect(csv.ok).toBe(true);
    if (!csv.ok) return;
    expect(csv.filename).toBe('regions.csv');
    expect(csv.mimeType).toBe('text/csv');
    expect(csv.data.toString('utf8')).toBe('region,revenue\r\n"north, upper",4100\r\n');
  });

  it('creates a real PPTX package with editable slide text', async () => {
    const result = await generateManagedOfficeFile({
      format: 'pptx',
      filename: 'release-plan.pptx',
      title: 'Release plan',
      slides: [
        {
          title: 'Release order',
          bullets: ['Website first', 'Mobile second', 'Desktop third'],
          speaker_notes: 'Keep lower-priority surfaces out of this release.',
        },
        {
          title: 'Definition of done',
          bullets: ['Real behavior', 'Focused tests', 'Verified build'],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('release-plan.pptx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(result.data.subarray(0, 2).toString()).toBe('PK');

    const archive = await JSZip.loadAsync(result.data);
    expect(archive.file('ppt/presentation.xml')).not.toBeNull();
    const firstSlideXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
    expect(firstSlideXml).toContain('Release order');
    expect(firstSlideXml).toContain('Website first');
    expect(firstSlideXml).toContain('Desktop third');
    expect(firstSlideXml?.indexOf('Release order')).toBeLessThan(
      firstSlideXml?.indexOf('>AGI<') ?? -1,
    );
  });
});

describe('pptxgenjs never receives an image', () => {
  /**
   * `pptxgenjs` pulls in `image-size`, which has two unpatched CVSS-7.5
   * denial-of-service advisories (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq):
   * a crafted ICNS, JXL, or HEIF buffer spins its parser in an infinite loop
   * and permanently blocks the Node event loop. There is no fixed release.
   *
   * The advisories do not reach us because `image-size` is only invoked when
   * an image is added to a slide, and this generator only ever adds shapes and
   * text. That is a property of THIS FILE, not of the dependency, so it needs a
   * test: the moment someone adds a picture to a generated deck, an unpatched
   * remote DoS becomes reachable from whatever supplies that image.
   *
   * If this fails, do not delete it. Either keep images out of the generator,
   * or validate the buffer before it reaches pptxgenjs and re-assess the
   * dismissed Dependabot alerts.
   */
  it('adds no image to a generated deck', () => {
    // Resolved by marker, not process.cwd(): vitest runs from both the repo
    // root and apps/web, and import.meta.url throws under this transform.
    const root = existsSync(join(process.cwd(), 'db/neon'))
      ? process.cwd()
      : join(process.cwd(), 'apps/web');
    const source = readFileSync(join(root, 'lib/services/managed-office-file-service.ts'), 'utf8');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/\.addImage\s*\(/);
    expect(withoutComments).not.toMatch(/\.addMedia\s*\(/);
  });
});
