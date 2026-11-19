import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it, vi } from 'vitest';

import { extractOfficeDocumentText, extractSpreadsheetTable } from './office-document-text';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

async function archive(
  parts: Record<string, string>,
  compression: 'DEFLATE' | 'STORE' = 'DEFLATE',
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer', compression });
}

async function buildWorkbook(): Promise<Buffer> {
  const cell = (reference: string, value: string, type = 's') =>
    `<c r="${reference}" t="${type}"><v>${value}</v></c>`;
  return archive({
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    'xl/workbook.xml': `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Q3 &amp; Q4" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/><sheet sheetId="3" r:id="rId9"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="x" Target="sharedStrings.xml"/></Relationships>`,
    'xl/sharedStrings.xml': `${XML_HEAD}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5"><si><t>Region</t></si><si><r><rPr><b/></rPr><t xml:space="preserve">North </t></r><r><t>&amp; South &lt;East&gt; &#65;&#x42;</t></r></si><si><t>Total</t></si><si><t></t></si><si><t>Línea 3 ✓</t></si></sst>`,
    'xl/worksheets/sheet1.xml': `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E8"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="12" customWidth="1"/></cols><sheetData><row r="1" spans="1:5" x14ac:dyDescent="0.25">${cell('A1', '0')}${cell('B1', '2')}</row><row r="2" spans="1:5">${cell('A2', '1')}<c r="B2" s="3"><v>1500.5</v></c><c r="C2" s="3"><f>B2*2</f><v>3001</v></c><c r="D2"><f t="shared" si="0"/></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Inline &amp; plain</t></is></c><c r="B3" t="str"><f>CONCATENATE(A3,"x")</f><v>Inline&amp;x</v></c><c r="C3" s="9"/></row><row r="4"/><row r="5"><c r="A5" s="2"/><c r="B5"><v>7</v></c></row><row r="6" spans="1:2"></row><row r="7"><c r="E7" t="s"><v>4</v></c><c r="F7" t="s"><v>3</v></c><c r="G7" t="s"><v>99</v></c></row><row r="12" thickBot="1"><c r="A12"><f>SUM(B2:B5)</f></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`,
    'xl/worksheets/sheet2.xml': `${XML_HEAD}<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>2</v></c><c r="B1" t="b"><v>1</v></c></row></sheetData></worksheet>`,
    'xl/worksheets/sheet3.xml': `${XML_HEAD}<worksheet><sheetData/></worksheet>`,
  });
}

async function buildDeck(): Promise<Buffer> {
  const slide = (body: string) =>
    `${XML_HEAD}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
  const shape = (paragraphs: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
  return archive({
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    'ppt/slides/slide1.xml': slide(
      shape(
        '<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" dirty="0"/><a:t>Quarterly </a:t></a:r><a:r><a:rPr lang="en-US"/><a:t>results &amp; plan</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>',
      ) +
        shape(
          '<a:p><a:r><a:t>First line</a:t></a:r><a:br><a:rPr/></a:br><a:r><a:t>Second   line</a:t></a:r></a:p><a:p><a:endParaRPr lang="en-US"/></a:p><a:p><a:fld id="{1}" type="slidenum"><a:t>1</a:t></a:fld></a:p>',
        ),
    ),
    'ppt/slides/slide2.xml': slide(
      shape(
        '<a:p><a:r><a:t>&lt;tag&gt; &#169; &#x263A;</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:t>Nested bullet</a:t></a:r></a:p>',
      ),
    ),
    'ppt/slides/slide10.xml': slide('<p:pic/>'),
    'ppt/notesSlides/notesSlide1.xml': slide(
      shape(
        '<a:p><a:r><a:t>Say hello first.</a:t></a:r></a:p><a:p><a:r><a:t>Then the plan.</a:t></a:r></a:p>',
      ) + shape('<a:p><a:fld type="slidenum"><a:t>1</a:t></a:fld></a:p>'),
    ),
    'ppt/notesSlides/notesSlide2.xml': slide(shape('<a:p><a:r><a:t>2</a:t></a:r></a:p>')),
  });
}

const DOCX_HTML_CASES: Record<string, string> = {
  headings: '<h1>Title</h1><h2>Sub <em>head</em></h2><h6>Deep</h6><p>Body &amp; text</p>',
  upperCase: '<P>Shout</P><LI>Item</LI><H3>Head</H3>',
  list: '<ul><li>One</li><li>Two <strong>bold</strong></li><li><p>Wrapped</p></li></ul>',
  table:
    '<table><tr><th>Vendor</th><th>Region</th></tr><tr><td>Ridgeway <em>Labs</em></td><td>APAC</td></tr><tr><td></td><td> </td></tr></table>',
  lineBreaks: 'before<br/>middle<br />after<BR>end',
  plainText: 'No markup at all &lt;here&gt;',
  onlyBreak: 'text<br/>more text',
  unclosedBlock: '<p>kept</p><p>never closed <li>closed item</li>',
  preIsNotParagraph: '<pre>code</pre><p>after</p>',
  attributes: '<p class="a>b" id="x">attr text</p><a href="y">link</a>',
  emptyBlocks: '<p></p><p> </p><h1></h1><tr></tr>',
  entities: '<p>&lt;&gt;&quot;&apos;&#65;&#x42;&amp;amp;</p>',
};

describe('Office markup extraction keeps its output for well-formed documents', () => {
  it('reads a workbook with shared strings, inline strings, formulas and empty cells', async () => {
    const text = await extractOfficeDocumentText(await buildWorkbook(), 'plan.xlsx', 'xlsx');
    expect(text).toMatchInlineSnapshot(`
      "## Sheet: Q3 & Q4
      Row 1: A: Region | B: Total
      Row 2: A: North & South <East> AB | B: 1500.5 | C: =B2*2 (3001)
      Row 3: A: Inline & plain | B: =CONCATENATE(A3,"x") (Inline&x)
      Row 5: B: 7
      Row 7: E: Línea 3 ✓
      Row 12: A: =SUM(B2:B5)

      ## Sheet: Notes
      Row 1: A: Total | B: 1

      ## Sheet: Sheet3
      [empty sheet]"
    `);
  });

  it('builds a table from the first filled sheet', async () => {
    const table = await extractSpreadsheetTable(await buildWorkbook(), 'plan.xlsx', 100_000);
    expect(table).toMatchInlineSnapshot(`
      {
        "complete": false,
        "csv": ""Region","Total","",""
      "North & South <East> AB","1500.5","3001",""
      "Inline & plain","Inline&x","",""
      "","7","",""
      "","","","Línea 3 ✓"
      "=SUM(B2:B5)","","",""",
      }
    `);
  });

  it('reads slides in numeric order with speaker notes', async () => {
    const text = await extractOfficeDocumentText(await buildDeck(), 'deck.pptx', 'pptx');
    expect(text).toMatchInlineSnapshot(`
      "## Slide 1
      Quarterly results & plan
      First lineSecond line
      1
      Speaker notes: Say hello first. Then the plan.

      ## Slide 2
      <tag> © ☺
      Nested bullet

      ## Slide 3
      [no text on this slide]"
    `);
  });

  it('turns converted HTML into text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document/>');
    const input = await zip.generateAsync({ type: 'nodebuffer' });
    const convert = vi.spyOn(mammoth, 'convertToHtml');
    const texts: Record<string, string> = {};
    try {
      for (const [name, html] of Object.entries(DOCX_HTML_CASES)) {
        convert.mockResolvedValueOnce({ value: html, messages: [] });
        texts[name] = await extractOfficeDocumentText(input, 'doc.docx', 'docx');
      }
    } finally {
      convert.mockRestore();
    }
    expect(texts).toMatchInlineSnapshot(`
      {
        "attributes": "b" id="x">attr text",
        "emptyBlocks": "",
        "entities": "<>"'AB&amp;",
        "headings": "# Title
      ## Sub head
      ###### Deep
      Body & text",
        "lineBreaks": "",
        "list": "- One
      - Two bold
      - Wrapped",
        "onlyBreak": "",
        "plainText": "No markup at all <here>",
        "preIsNotParagraph": "after",
        "table": "| Vendor | Region |
      | Ridgeway  Labs | APAC |
      |  |  |",
        "unclosedBlock": "kept
      - closed item",
        "upperCase": "Shout
      - Item
      ### Head",
      }
    `);
  });
});

const HOSTILE_PART_BYTES = 3 * 1024 * 1024;
const SCAN_TIME_BOUND_MS = 2_000;
const HOSTILE_TEST_TIMEOUT_MS = 60_000;

function repeated(unit: string, hostile: boolean): string {
  const shown = hostile ? unit : unit.replace(/</g, '_');
  return shown.repeat(Math.ceil(HOSTILE_PART_BYTES / shown.length));
}

interface HostileAndControl<T> {
  hostile: T;
  control: T;
}

async function hostileAndControl<T>(
  build: (hostile: boolean) => Promise<T>,
): Promise<HostileAndControl<T>> {
  return { hostile: await build(true), control: await build(false) };
}

async function elapsedMs(work: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await work();
  return performance.now() - started;
}

async function scanTimeBeyondControl<I, T>(
  inputs: HostileAndControl<I>,
  work: (input: I) => Promise<T>,
): Promise<{ result: T; scanMs: number }> {
  const controlMs = await elapsedMs(() => work(inputs.control));
  let result: T | undefined;
  const hostileMs = await elapsedMs(async () => {
    result = await work(inputs.hostile);
  });
  return { result: result as T, scanMs: hostileMs - controlMs };
}

function workbookWith(sheetXml: string, sharedStringsXml = '<sst/>'): Promise<Buffer> {
  return archive(
    {
      'xl/workbook.xml': `${XML_HEAD}<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/sharedStrings.xml': sharedStringsXml,
      'xl/worksheets/sheet1.xml': sheetXml,
    },
    'STORE',
  );
}

describe('Office markup extraction runs in linear time on unterminated markup', () => {
  it(
    'reads a slide part made of paragraph openings that never close',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        archive(
          {
            'ppt/slides/slide1.xml': `${XML_HEAD}<p:sld>${repeated('<a:p>', hostile)}</p:sld>`,
            'ppt/notesSlides/notesSlide1.xml': `${XML_HEAD}<p:notes>${repeated('<a:p><a:r>', hostile)}</p:notes>`,
          },
          'STORE',
        ),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (deck) =>
        extractOfficeDocumentText(deck, 'hostile.pptx', 'pptx'),
      );
      expect(result).toBe('## Slide 1\n[no text on this slide]');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'reads a sheet part made of row openings that never close',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        workbookWith(
          `${XML_HEAD}<worksheet><sheetData>${repeated('<row r="1">', hostile)}</sheetData></worksheet>`,
        ),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (workbook) =>
        extractOfficeDocumentText(workbook, 'hostile.xlsx', 'xlsx'),
      );
      expect(result).toBe('## Sheet: Data\n[empty sheet]');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'reads a row made of cell openings that never close',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        workbookWith(
          `${XML_HEAD}<worksheet><sheetData><row r="1">${repeated('<c r="A1">', hostile)}</row></sheetData></worksheet>`,
        ),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (workbook) =>
        extractOfficeDocumentText(workbook, 'hostile.xlsx', 'xlsx'),
      );
      expect(result).toBe('## Sheet: Data\n[empty sheet]');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'reads shared string openings that never close',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        workbookWith(
          `${XML_HEAD}<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
          `${XML_HEAD}<sst><si><t>kept</t></si>${repeated('<si><t>', hostile)}</sst>`,
        ),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (workbook) =>
        extractOfficeDocumentText(workbook, 'hostile.xlsx', 'xlsx'),
      );
      expect(result).toBe('## Sheet: Data\nRow 1: A: kept');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'reads sheet and relationship tags with no closing bracket after them',
    async () => {
      const inputs = await hostileAndControl((hostile) =>
        archive(
          {
            'xl/workbook.xml': `${XML_HEAD}<workbook><sheets><sheet name="Data" sheetId="1"/></sheets></workbook>${repeated('<sheet ', hostile)}`,
            'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships></Relationships>${repeated('<Relationship ', hostile)}`,
            'xl/worksheets/sheet1.xml': `${XML_HEAD}<worksheet><sheetData><row r="1"><c r="A1"><v>5</v></c></row></sheetData></worksheet>`,
          },
          'STORE',
        ),
      );
      const { result, scanMs } = await scanTimeBeyondControl(inputs, (workbook) =>
        extractOfficeDocumentText(workbook, 'hostile.xlsx', 'xlsx'),
      );
      expect(result).toBe('## Sheet: Data\nRow 1: A: 5');
      expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it.each<[string, (hostile: boolean) => string]>([
    ['paragraph openings that never close', (hostile) => repeated('<p>', hostile)],
    ['tag openings that never end', (hostile) => `<p>${repeated('<', hostile)}</p>`],
    ['row and cell openings that never close', (hostile) => repeated('<tr><td>', hostile)],
    ['list openings between a closed pair', (hostile) => `<li>${repeated('<li ', hostile)}</li>`],
    ['line breaks that never end', (hostile) => repeated('<br ', hostile)],
  ])(
    'turns converted HTML made of %s into text',
    async (_, html) => {
      const zip = new JSZip();
      zip.file('word/document.xml', '<w:document/>');
      const input = await zip.generateAsync({ type: 'nodebuffer' });
      const convert = vi.spyOn(mammoth, 'convertToHtml');
      try {
        const { scanMs } = await scanTimeBeyondControl(
          { hostile: html(true), control: html(false) },
          (value) => {
            convert.mockResolvedValueOnce({ value, messages: [] });
            return extractOfficeDocumentText(input, 'hostile.docx', 'docx');
          },
        );
        expect(scanMs).toBeLessThan(SCAN_TIME_BOUND_MS);
      } finally {
        convert.mockRestore();
      }
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );
});

describe('Office markup extraction reads empty elements and unusual references', () => {
  it('does not let a self-closing cell or row take the content that follows it', async () => {
    const workbook = await workbookWith(
      `${XML_HEAD}<worksheet><sheetData><row r="4"/><row r="5"><c r="A5" s="2"/><c r="B5"><v>7</v></c></row></sheetData></worksheet>`,
    );
    expect(await extractOfficeDocumentText(workbook, 'sparse.xlsx', 'xlsx')).toBe(
      '## Sheet: Data\nRow 5: B: 7',
    );
  });

  it('reads closing tags written with whitespace and skips markup inside comments', async () => {
    const workbook = await workbookWith(
      `${XML_HEAD}<worksheet><sheetData><!-- <row r="9"><c r="Z9"><v>9</v></c></row> --><row r="1"><c r="A1"><v >1</v ></c ><c r="B1" t="s"><v>1</v></c\n></row ></sheetData></worksheet>`,
      `${XML_HEAD}<sst><si/><si ><t>second</t></si ></sst>`,
    );
    expect(await extractOfficeDocumentText(workbook, 'spaced.xlsx', 'xlsx')).toBe(
      '## Sheet: Data\nRow 1: A: 1 | B: second',
    );
  });

  it('reads cell and row attributes written with spaces around their equals signs', async () => {
    const workbook = await workbookWith(
      `${XML_HEAD}<worksheet><sheetData><row r = "3"><c r = "B3" t = "s"><v>1</v></c><c r='C3' t='inlineStr'><is><t>inline</t></is></c></row></sheetData></worksheet>`,
      `${XML_HEAD}<sst><si><t>first</t></si><si><t>second</t></si></sst>`,
    );
    expect(await extractOfficeDocumentText(workbook, 'spaced.xlsx', 'xlsx')).toBe(
      '## Sheet: Data\nRow 3: B: second | C: inline',
    );
  });

  it('keeps a numeric entity that is not a character as literal text', async () => {
    const deck = await archive({
      'ppt/slides/slide1.xml': `${XML_HEAD}<p:sld><a:p><a:r><a:t>a&#99999999;b &#1114112;c &#xD800;d &#xDFFF;e &#x10FFFF;f &#65;</a:t></a:r></a:p></p:sld>`,
    });
    const text = await extractOfficeDocumentText(deck, 'entities.pptx', 'pptx');
    expect(text).toBe(
      `## Slide 1\na&#99999999;b &#1114112;c &#xD800;d &#xDFFF;e ${String.fromCodePoint(0x10ffff)}f A`,
    );
  });
});
