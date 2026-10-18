import { createHash } from 'node:crypto';
import type { E2BExecutor } from '@/lib/e2b/types';
import { verifyManagedOfficePackage } from './managed-office-preservation';
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

  it('creates an XLSX workbook with named sheets, evaluated formula receipts and a chart part', async () => {
    const execution = recalculationFixture();
    const result = await generateManagedOfficeFile(
      {
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
      },
      { executor: async () => execution.executor },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('quarterly.xlsx');
    expect(result.verification).toMatchObject({ recalculation: 'passed', render: 'not_run' });
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const archive = await JSZip.loadAsync(result.data);
    const workbook = (await archive.file('xl/workbook.xml')?.async('string')) ?? '';
    expect(workbook).toContain('name="Sales"');
    expect(workbook).toContain('name="Regions"');

    const sales = (await archive.file('xl/worksheets/sheet1.xml')?.async('string')) ?? '';
    expect(sales).toContain('<f>B2*C2</f><v>1500</v>');
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

function recalculationFixture(cached = true) {
  let staged = Buffer.alloc(0);
  let commands = 0;
  const executor: E2BExecutor = {
    createFolder: async () => ({ ok: true, output: '' }),
    writeFile: async ({ content }) => {
      staged = Buffer.from(content, 'base64');
      return { ok: true, output: '' };
    },
    runCommand: async () => {
      commands += 1;
      return { ok: true, output: '', stdout: '', stderr: '', exitCode: 0 };
    },
    listFiles: async (directory) => [
      {
        path: `${directory}/input.xlsx`,
        name: 'input.xlsx',
        isDir: false,
        byteSize: staged.length,
      },
    ],
    readFileBytes: async () => {
      const zip = await JSZip.loadAsync(staged);
      const entry = zip.file('xl/worksheets/sheet1.xml')!;
      let xml = await entry.async('string');
      if (cached)
        xml = xml
          .replace('<f>B2*C2</f>', '<f>B2*C2</f><v>1500</v>')
          .replace('<f>B3*C3</f>', '<f>B3*C3</f><v>1750</v>')
          .replace('<f>SUM(D2:D3)</f>', '<f>SUM(D2:D3)</f><v>3250</v>');
      zip.file(entry.name, xml);
      return zip.generateAsync({ type: 'uint8array' });
    },
    runCode: async () => ({ ok: false, output: '', error: 'not used' }),
    dispose: async () => undefined,
  };
  return { executor, commands: () => commands };
}

describe('attached Office source offers', () => {
  it('offers the scoped input digest without exposing bytes or a filesystem location', () => {
    const bytes = Buffer.from('owned synthetic document bytes');
    const definition = createManagedOfficeFileToolDefinition('docx', [
      {
        filename: 'owned.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: bytes.toString('base64'),
      },
    ]);
    const description = definition.function.parameters.properties.source.description;
    expect(description).toContain('owned.docx');
    expect(description).toContain(createHash('sha256').update(bytes).digest('hex'));
    expect(description).not.toContain(bytes.toString('base64'));
  });
});

describe('bounded existing Word document editing', () => {
  async function source(content = 'Replace this exact phrase.') {
    const file = await generateManagedOfficeFile({
      format: 'docx',
      filename: 'original.docx',
      title: 'Original',
      content,
    });
    if (!file.ok) throw new Error(file.message);
    const zip = await JSZip.loadAsync(file.data);
    zip.file('customXml/preserved.xml', '<preserved>original bytes</preserved>');
    const data = await zip.generateAsync({ type: 'nodebuffer' });
    return {
      data,
      zip,
      sha256: createHash('sha256').update(data).digest('hex'),
      filename: 'original.docx',
      mimeType: file.mimeType,
      base64: data.toString('base64'),
    };
  }

  it('preserves every unrelated package part and original input bytes', async () => {
    const input = await source();
    const before = Buffer.from(input.data);
    const result = await generateManagedOfficeFile(
      {
        format: 'docx',
        filename: 'edited.docx',
        title: 'Edited',
        source: {
          filename: input.filename,
          sha256: input.sha256,
          replacements: [
            {
              find: 'Replace this exact phrase.',
              replace: 'Updated & safely escaped.',
              expectedMatches: 1,
            },
          ],
        },
      },
      { attachments: [input] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = await JSZip.loadAsync(result.data);
    expect(await after.file('word/document.xml')!.async('string')).toContain(
      'Updated &amp; safely escaped.',
    );
    for (const entry of Object.values(input.zip.files).filter(
      (entry) => !entry.dir && entry.name !== 'word/document.xml',
    )) {
      expect(await after.file(entry.name)!.async('uint8array')).toEqual(
        await entry.async('uint8array'),
      );
    }
    expect(input.data.equals(before)).toBe(true);
    expect(result.verification).toMatchObject({
      inputSha256: input.sha256,
      preservation: { changedParts: ['word/document.xml'] },
      render: 'not_run',
    });
  });

  it.each(['digest', 'count', 'missing', 'ambiguous', 'xml'])(
    'refuses an unsafe or unsupported edit: %s',
    async (problem) => {
      const input = await source();
      const result = await generateManagedOfficeFile(
        {
          format: 'docx',
          filename: 'edited.docx',
          title: 'Edited',
          source: {
            filename: input.filename,
            sha256: problem === 'digest' ? '0'.repeat(64) : input.sha256,
            replacements: [
              {
                find: 'Replace this exact phrase.',
                replace: problem === 'xml' ? '\u0000' : 'changed',
                expectedMatches: problem === 'count' ? 2 : 1,
              },
            ],
          },
        },
        {
          attachments:
            problem === 'missing' ? [] : problem === 'ambiguous' ? [input, input] : [input],
        },
      );
      expect(result.ok).toBe(false);
    },
  );

  it('refuses excessive edit expansion before constructing an oversized document', async () => {
    const markers = [...'λμνξοπρστυφχψ'];
    const input = await source(markers[0]!.repeat(1000));
    const result = await generateManagedOfficeFile(
      {
        format: 'docx',
        filename: 'edited.docx',
        title: 'Edited',
        source: {
          filename: input.filename,
          sha256: input.sha256,
          replacements: markers.slice(0, -1).map((find, index) => ({
            find,
            replace: markers[index + 1]! + 'Z'.repeat(1999),
            expectedMatches: 1000,
          })),
        },
      },
      { attachments: [input] },
    );
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/package size limit/),
    });
  });

  it('rejects existing-input operations on formats that do not support them', async () => {
    const result = await generateManagedOfficeFile({
      format: 'xlsx',
      filename: 'edited.xlsx',
      title: 'Edited',
      sheets: [{ name: 'Sheet1', rows: [[1]] }],
      source: { filename: 'original.xlsx', sha256: '0'.repeat(64) },
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid_office_file_request' });
  });

  it('refuses tracked-revision documents without silently accepting or discarding revisions', async () => {
    const input = await source();
    const zip = await JSZip.loadAsync(input.data);
    const xml = await zip.file('word/document.xml')!.async('string');
    zip.file(
      'word/document.xml',
      xml.replace(
        '</w:body>',
        '<w:ins w:id="1"><w:p><w:r><w:t>Tracked</w:t></w:r></w:p></w:ins></w:body>',
      ),
    );
    const data = await zip.generateAsync({ type: 'nodebuffer' });
    const sha256 = createHash('sha256').update(data).digest('hex');
    const result = await generateManagedOfficeFile(
      {
        format: 'docx',
        filename: 'edited.docx',
        title: 'Edited',
        source: {
          filename: input.filename,
          sha256,
          replacements: [
            { find: 'Replace this exact phrase.', replace: 'New', expectedMatches: 1 },
          ],
        },
      },
      { attachments: [{ ...input, base64: data.toString('base64') }] },
    );
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/tracked revisions/),
    });
  });

  it('refuses formulas without an evaluator instead of returning unevaluated success', async () => {
    const result = await generateManagedOfficeFile({
      format: 'xlsx',
      filename: 'formula.xlsx',
      title: 'Formula',
      sheets: [{ name: 'Sheet1', rows: [[1, '=A1+1']] }],
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/recalculation/i) });
  });

  it('rejects missing calculation caches in returned execution bytes', async () => {
    const execution = recalculationFixture(false);
    const result = await generateManagedOfficeFile(
      {
        format: 'xlsx',
        filename: 'formula.xlsx',
        title: 'Formula',
        sheets: [{ name: 'Sheet1', rows: [[1, '=A1+1']] }],
      },
      { executor: async () => execution.executor },
    );
    expect(result.ok).toBe(false);
    expect(execution.commands()).toBe(2);
  });

  it('refuses active workbook functions before staging or execution', async () => {
    const execution = recalculationFixture();
    const result = await generateManagedOfficeFile(
      {
        format: 'xlsx',
        filename: 'formula.xlsx',
        title: 'Formula',
        sheets: [{ name: 'Sheet1', rows: [['=WEBSERVICE("https://example.test")']] }],
      },
      { executor: async () => execution.executor },
    );
    expect(result.ok).toBe(false);
    expect(execution.commands()).toBe(0);
  });

  it('does not call successful formula errors a verified workbook', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('_rels/.rels', '<Relationships/>');
    zip.file('xl/workbook.xml', '<workbook/>');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row><c r="A1" t="e"><f>1/0</f><v>#DIV/0!</v></c></row></sheetData></worksheet>',
    );
    await expect(
      verifyManagedOfficePackage(await zip.generateAsync({ type: 'nodebuffer' }), 'xlsx'),
    ).rejects.toThrow(/calculation error/i);
  });
});

describe('existing workbook preservation', () => {
  async function workbook() {
    const generated = await generateManagedOfficeFile({
      format: 'xlsx',
      filename: 'input.xlsx',
      title: 'Owned',
      sheets: [
        {
          name: 'Budget',
          rows: [
            ['Item', 'Amount'],
            ['Tools', 25],
          ],
        },
      ],
    });
    if (!generated.ok) throw new Error(generated.message);
    const zip = await JSZip.loadAsync(generated.data);
    zip.file('customXml/owned.xml', '<owned>keep exact bytes</owned>');
    const data = await zip.generateAsync({ type: 'nodebuffer' });
    return {
      filename: 'input.xlsx',
      mimeType: generated.mimeType,
      sha256: createHash('sha256').update(data).digest('hex'),
      base64: data.toString('base64'),
      data,
      zip,
    };
  }

  it('edits a guarded existing cell and preserves every unaffected part', async () => {
    const input = await workbook();
    const result = await generateManagedOfficeFile(
      {
        format: 'xlsx',
        filename: 'updated.xlsx',
        title: 'Updated',
        source: {
          filename: input.filename,
          sha256: input.sha256,
          edits: [{ sheet: 'Budget', cell: 'B2', expected: 25, value: 30 }],
        },
      },
      { attachments: [input] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = await JSZip.loadAsync(result.data);
    expect(await after.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('<v>30</v>');
    for (const part of Object.values(input.zip.files).filter(
      (entry) => !entry.dir && entry.name !== 'xl/worksheets/sheet1.xml',
    ))
      expect(await after.file(part.name)!.async('uint8array')).toEqual(
        await part.async('uint8array'),
      );
    expect(result.verification).toMatchObject({
      inputSha256: input.sha256,
      preservation: { changedParts: ['xl/worksheets/sheet1.xml'] },
    });
    expect(input.base64).toBe(input.data.toString('base64'));
  });

  it.each(['stale', 'missing-cell', 'duplicate', 'mixed'])(
    'refuses unsafe workbook edits: %s',
    async (failure) => {
      const input = await workbook();
      const edit = {
        sheet: 'Budget',
        cell: failure === 'missing-cell' ? 'Z9' : 'B2',
        expected: failure === 'stale' ? 10 : 25,
        value: 30,
      };
      const result = await generateManagedOfficeFile(
        {
          format: 'xlsx',
          filename: 'updated.xlsx',
          title: 'Updated',
          ...(failure === 'mixed' ? { sheets: [{ name: 'Budget', rows: [[1]] }] } : {}),
          source: {
            filename: input.filename,
            sha256: input.sha256,
            edits: failure === 'duplicate' ? [edit, edit] : [edit],
          },
        },
        { attachments: [input] },
      );
      expect(result.ok).toBe(false);
    },
  );

  it.each(['xml', 'relationship'])('rejects damaged package structure: %s', async (failure) => {
    const input = await workbook();
    input.zip.file(
      failure === 'xml' ? 'customXml/owned.xml' : 'xl/_rels/workbook.xml.rels',
      failure === 'xml'
        ? '<unclosed>'
        : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="../missing.xml" Type="owned"/></Relationships>',
    );
    const data = await input.zip.generateAsync({ type: 'nodebuffer' });
    await expect(verifyManagedOfficePackage(data, 'xlsx')).rejects.toThrow(
      /malformed XML|broken relationships/,
    );
  });

  it('requires a real rendering executor when rendering was requested', async () => {
    const result = await generateManagedOfficeFile({
      format: 'docx',
      filename: 'render.docx',
      title: 'Render',
      content: 'Owned fixture',
      verify_render: true,
    });
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Rendering verification requires/),
    });
  });
});
