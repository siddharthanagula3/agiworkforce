import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import JSZip from 'jszip';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecompressionLimitError } from '@/lib/security/archive-budget';
import {
  XLSX_NOT_CALCULATED,
  WorkbookPreviewLimitError,
  PresentationPreviewLimitError,
  loadWorkbookSheets,
  pptxToSlidesMarkdown,
  xlsxSheets,
} from './office-file-preview';

async function xlsxFirstSheetToCsv(data: ArrayBuffer): Promise<string> {
  return (await xlsxSheets(data))[0]?.csv ?? '';
}

async function workbook(sheetData: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('xlsxFirstSheetToCsv formula cells', () => {
  it('marks a formula cell without a cached value as not calculated', async () => {
    const csv = await xlsxFirstSheetToCsv(
      await workbook('<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f></c></row>'),
    );
    expect(csv).toBe(`2,${XLSX_NOT_CALCULATED}`);
  });

  it('shows the cached value of a formula cell when the file carries one', async () => {
    const csv = await xlsxFirstSheetToCsv(
      await workbook('<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f><v>4</v></c></row>'),
    );
    expect(csv).toBe('2,4');
  });
});

function shape(type: string | null, ...lines: string[]): string {
  const ph = type ? `<p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr>` : '';
  const paragraphs = lines.map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`).join('');
  return `<p:sp>${ph}<p:txBody>${paragraphs}</p:txBody></p:sp>`;
}

async function deck(...shapes: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('pptxToSlidesMarkdown slide structure', () => {
  it('takes the title from the title placeholder and keeps footer and number out of the body', async () => {
    const markdown = await pptxToSlidesMarkdown(
      await deck(
        shape(null, 'Revenue grew 40%'),
        shape('title', 'Q3 results'),
        shape('ftr', 'Confidential'),
        shape('sldNum', '1'),
      ),
    );
    expect(markdown).toBe('# Q3 results\n- Revenue grew 40%\n_Confidential_');
  });

  it('falls back to the first text when no title placeholder exists', async () => {
    const markdown = await pptxToSlidesMarkdown(await deck(shape(null, 'Intro', 'Point')));
    expect(markdown).toBe('# Intro\n- Point');
  });
});

describe('pptxToSlidesMarkdown tables and pictures', () => {
  it('skips pictures above the existing image limit while retaining slide text', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${shape('title', 'Title')}<p:pic><p:blipFill><a:blip r:embed="image"/></p:blipFill></p:pic></p:sld>`,
    );
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="image" Target="../media/image.png"/></Relationships>',
    );
    zip.file('ppt/media/image.png', new Uint8Array(450_001));
    const markdown = await pptxToSlidesMarkdown(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(markdown).toBe('# Title');
  });

  it('keeps tables and embedded pictures with their slide', async () => {
    const zip = new JSZip();
    const table =
      '<p:graphicFrame><a:graphic><a:graphicData><a:tbl>' +
      '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Region</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Sales</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
      '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>EU</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>12</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
      '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
    const picture =
      '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture" descr="Logo"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>';
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>${shape('title', 'Numbers')}${table}${picture}</p:spTree></p:cSld></p:sld>`,
    );
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>',
    );
    zip.file('ppt/media/image1.png', 'iVBORw0KGgo=', { base64: true });
    const markdown = await pptxToSlidesMarkdown(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(markdown).toContain('# Numbers');
    expect(markdown).toContain('| Region | Sales |\n| --- | --- |\n| EU | 12 |');
    expect(markdown).toContain('![Logo](data:image/png;base64,');
  });
});

describe('Office preview decompression limits', () => {
  it('rejects a worksheet preview that exceeds the decompression ratio', async () => {
    const zip = new JSZip();
    zip.file('xl/worksheets/sheet1.xml', `<worksheet>${' '.repeat(1_000_000)}</worksheet>`);
    await expect(
      xlsxSheets(await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })),
    ).rejects.toBeInstanceOf(DecompressionLimitError);
  });

  it('rejects a slide preview that exceeds the decompression ratio', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', `<slide>${' '.repeat(1_000_000)}</slide>`);
    await expect(
      pptxToSlidesMarkdown(await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })),
    ).rejects.toBeInstanceOf(DecompressionLimitError);
  });
});

describe('pptxToSlidesMarkdown table cell escaping', () => {
  async function tableDeck(...cells: string[]): Promise<string> {
    const row = cells
      .map((text) => `<a:tc><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody></a:tc>`)
      .join('');
    const table = `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr>${row}</a:tr><a:tr>${row}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    return pptxToSlidesMarkdown(await deck(shape('title', 'Paths'), table));
  }

  function renderedCells(markdown: string): string[] {
    const html = renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
    );
    const body = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(body.querySelectorAll('tbody td')).map((cell) => cell.textContent ?? '');
  }

  it('keeps every backslash and pipe a cell contains inside that cell', async () => {
    const markdown = await tableDeck('C:\\a\\|b', 'x|y', 'end\\');
    expect(renderedCells(markdown)).toEqual(['C:\\a\\|b', 'x|y', 'end\\']);
  });
});

describe('pptxToSlidesMarkdown text output limits', () => {
  it('counts UTF-16 title characters and framing at the exact limit', async () => {
    const title = '😀'.repeat((MAX_FILE_TEXT_CHARS - 2) / 2);
    expect(await pptxToSlidesMarkdown(await deck(shape('title', title)))).toBe(`# ${title}`);
    await expect(pptxToSlidesMarkdown(await deck(shape('title', `${title}x`))))
      .rejects.toBeInstanceOf(PresentationPreviewLimitError);
  });

  it('counts slide separators against one cumulative budget', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', `<sld xmlns:p="p" xmlns:a="a">${shape('title', 'x'.repeat(MAX_FILE_TEXT_CHARS - 11))}</sld>`);
    zip.file('ppt/slides/slide2.xml', `<sld xmlns:p="p" xmlns:a="a">${shape('title', 'x')}</sld>`);
    await expect(pptxToSlidesMarkdown(await zip.generateAsync({ type: 'arraybuffer' })))
      .rejects.toBeInstanceOf(PresentationPreviewLimitError);
  });

  it('refuses ragged-table padding before building a rectangular table', async () => {
    const table = `<a:tbl><a:tr>${'<a:tc/>'.repeat(1_000)}</a:tr>${'<a:tr/>'.repeat(1_000)}</a:tbl>`;
    await expect(pptxToSlidesMarkdown(await deck(table)))
      .rejects.toBeInstanceOf(PresentationPreviewLimitError);
  });

  it('handles many empty rows without spreading them into a function call', async () => {
    expect(await pptxToSlidesMarkdown(await deck(`<a:tbl>${'<a:tr/>'.repeat(MAX_FILE_TEXT_CHARS)}</a:tbl>`)))
      .toBe('# Slide 1');
  });

  it('counts table backslash and pipe escaping before allocating the escaped output', async () => {
    const table = `<a:tbl><a:tr><a:tc><a:p><a:t>${'|'.repeat(MAX_FILE_TEXT_CHARS / 2)}</a:t></a:p></a:tc></a:tr></a:tbl>`;
    await expect(pptxToSlidesMarkdown(await deck(table)))
      .rejects.toBeInstanceOf(PresentationPreviewLimitError);
  });

  it('keeps trimming and whitespace normalization without counting discarded whitespace', async () => {
    const whitespace = ' '.repeat(MAX_FILE_TEXT_CHARS + 1);
    const table = `<a:tbl><a:tr><a:tc><a:p><a:t> A${whitespace}</a:t><a:t> B </a:t></a:p><a:p><a:t> </a:t></a:p><a:p><a:t>C</a:t></a:p></a:tc></a:tr></a:tbl>`;
    expect(await pptxToSlidesMarkdown(await deck(shape('title', `${whitespace}Title${whitespace}`), table)))
      .toBe('# Title\n\n| A B C |\n| --- |');
  });

  it('preserves whitespace and concatenation across paragraph text runs', async () => {
    const title = '<p:sp><a:p><a:t> \tA\r\n</a:t><a:t>\u00a0 B </a:t></a:p></p:sp>';
    expect(await pptxToSlidesMarkdown(await deck(title))).toBe('# A\n\u00a0 B');
  });

  it('bounds repeated descendant text in malformed nested shapes', async () => {
    const nested = `<p:sp>${shape('title', 'x'.repeat(MAX_FILE_TEXT_CHARS / 2))}</p:sp>`;
    await expect(pptxToSlidesMarkdown(await deck(nested)))
      .rejects.toBeInstanceOf(PresentationPreviewLimitError);
  });

  it('does not count omitted date and slide-number placeholders', async () => {
    expect(await pptxToSlidesMarkdown(await deck(shape('dt', 'x'.repeat(MAX_FILE_TEXT_CHARS + 1)))))
      .toBe('# Slide 1');
  });

  it('retains a supported image whose base64 exceeds the text budget', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml',
      `<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${shape('title', 'Title')}<p:pic><a:blip r:embed="image"/></p:pic></p:sld>`);
    zip.file('ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="image" Target="../media/image.png"/></Relationships>');
    zip.file('ppt/media/image.png', new Uint8Array(450_000));
    const markdown = await pptxToSlidesMarkdown(await zip.generateAsync({ type: 'arraybuffer' }));
    expect(markdown).toContain('![Image](data:image/png;base64,');
    expect(markdown.length).toBeGreaterThan(MAX_FILE_TEXT_CHARS);
  });
});

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function worksheet(rows: string): string {
  return `<worksheet xmlns="${MAIN_NS}"><sheetData>${rows}</sheetData></worksheet>`;
}

async function multiSheetWorkbook(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>` +
      '<sheet name="Instructions" sheetId="1" r:id="rId1"/>' +
      '<sheet name="Budget" sheetId="2" r:id="rId2"/>' +
      '<sheet name="Review" sheetId="3" r:id="rId3"/>' +
      '</sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="worksheet" Target="worksheets/sheet3.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'xl/sharedStrings.xml',
    `<sst xmlns="${MAIN_NS}"><si><t>Read me</t></si><si><t>Rent</t></si></sst>`,
  );
  zip.file('xl/worksheets/sheet1.xml', worksheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'));
  zip.file(
    'xl/worksheets/sheet2.xml',
    worksheet('<row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1"><v>900</v></c></row>'),
  );
  zip.file('xl/worksheets/sheet3.xml', worksheet('<row r="1"><c r="A1"><v>ok</v></c></row>'));
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('xlsxSheets', () => {
  it('returns every worksheet by name in tab order', async () => {
    expect(await xlsxSheets(await multiSheetWorkbook())).toEqual([
      { name: 'Instructions', csv: 'Read me' },
      { name: 'Budget', csv: 'Rent,900' },
      { name: 'Review', csv: 'ok' },
    ]);
  });

  it('names a workbook without a sheet list Sheet1', async () => {
    const sheets = await xlsxSheets(await workbook('<row r="1"><c r="A1"><v>1</v></c></row>'));
    expect(sheets).toEqual([{ name: 'Sheet1', csv: '1' }]);
  });

  it('returns nothing for an archive with no worksheet', async () => {
    expect(await xlsxSheets(await new JSZip().generateAsync({ type: 'arraybuffer' }))).toEqual([]);
  });
});

describe('loadWorkbookSheets', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches fresh workbook bytes for each sequential load of the same URI', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(await multiSheetWorkbook()))
      .mockResolvedValueOnce(new Response(await workbook('<row><c><v>updated</v></c></row>')));
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadWorkbookSheets('/api/files/once');
    const second = await loadWorkbookSheets('/api/files/once');

    expect(first.map((sheet) => sheet.name)).toEqual(['Instructions', 'Budget', 'Review']);
    expect(second).toEqual([{ name: 'Sheet1', csv: 'updated' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/files/once', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/files/once', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });

  it('does not share an in-flight request with a concurrent load of the same URI', async () => {
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const firstBytes = await workbook('<row><c><v>first</v></c></row>');
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(new Response(await workbook('<row><c><v>second</v></c></row>')));
    vi.stubGlobal('fetch', fetchMock);

    const first = loadWorkbookSheets('/api/files/concurrent');
    const second = loadWorkbookSheets('/api/files/concurrent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(second).resolves.toEqual([{ name: 'Sheet1', csv: 'second' }]);
    resolveFirst(new Response(firstBytes));
    await expect(first).resolves.toEqual([{ name: 'Sheet1', csv: 'first' }]);
  });

  it('honors a new authorization refusal after a successful load of the same URI', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(await multiSheetWorkbook()))
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadWorkbookSheets('/api/files/reauthorize')).resolves.toHaveLength(3);
    await expect(loadWorkbookSheets('/api/files/reauthorize')).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requests bytes again after a failed load', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response(await multiSheetWorkbook()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadWorkbookSheets('/api/files/retry')).rejects.toThrow('HTTP 500');
    await expect(loadWorkbookSheets('/api/files/retry')).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});


describe('workbook serialized preview bound', () => {
  it('accepts the exact bound and rejects one extra UTF-16 code unit', async () => {
    const text = '😀'.repeat(MAX_FILE_TEXT_CHARS / 2);
    expect(await xlsxFirstSheetToCsv(await workbook(`<row><c r="A1"><v>${text}</v></c></row>`))).toBe(text);
    await expect(
      xlsxSheets(await workbook(`<row><c r="A1"><v>${text}x</v></c></row>`)),
    ).rejects.toBeInstanceOf(WorkbookPreviewLimitError);
  });

  it('rejects an astronomical column reference before sparse expansion', async () => {
    await expect(
      xlsxSheets(await workbook('<row><c r="ZZZZZZZZZZZZZZZZZZ1"><v>x</v></c></row>')),
    ).rejects.toBeInstanceOf(WorkbookPreviewLimitError);
  });

  it('counts rectangular padding across all rows', async () => {
    await expect(
      xlsxSheets(await workbook('<row><c r="ZZZ1"/></row>' + '<row/>'.repeat(11))),
    ).rejects.toBeInstanceOf(WorkbookPreviewLimitError);
  });

  it('counts CSV quoting before allocating its escaped output', async () => {
    const quotes = '&quot;'.repeat(MAX_FILE_TEXT_CHARS / 2);
    await expect(
      xlsxSheets(await workbook(`<row><c r="A1"><v>${quotes}</v></c></row>`)),
    ).rejects.toBeInstanceOf(WorkbookPreviewLimitError);
    const accepted = '&quot;'.repeat((MAX_FILE_TEXT_CHARS - 2) / 2);
    expect((await xlsxFirstSheetToCsv(await workbook(`<row><c><v>${accepted}</v></c></row>`))).length)
      .toBe(MAX_FILE_TEXT_CHARS);
  });

  it('preserves order, sparse padding, duplicate overwrites and reference fallbacks', async () => {
    expect(await xlsxFirstSheetToCsv(await workbook(
      '<row r="9"><c r="C9"><v>last</v></c><c r="A9"><v>old</v></c>' +
      '<c r="A9"><v>new</v></c><c r="Bjunk"><v>middle</v></c></row>' +
      '<row/><row r="1"><c r="lowercase"><v>fallback</v></c></row>',
    ))).toBe('new,middle,last\n,,\nfallback,,');
  });

  it('accounts only for the final value at a duplicated column', async () => {
    expect(await xlsxFirstSheetToCsv(await workbook(
      `<row><c r="A1"><v>${'x'.repeat(MAX_FILE_TEXT_CHARS + 1)}</v></c><c r="A1"/></row>`,
    ))).toBe('');
  });

  it('retains inline rich-text escaping across text runs', async () => {
    expect(await xlsxFirstSheetToCsv(await workbook(
      '<row><c r="B1" t="inlineStr"><is><r><t>a,&quot;</t></r><r><t>b&#13;&#10;</t></r></is></c></row>',
    ))).toBe(',"a,""b\r\n"');
  });

  async function repeatedSharedWorkbook(sheets: number, cells: number): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file('xl/sharedStrings.xml', `<sst><si><t>${'x'.repeat(MAX_FILE_TEXT_CHARS / 2 + 1)}</t></si></sst>`);
    zip.file('xl/workbook.xml', `<workbook xmlns:r="${REL_NS}"><sheets>${Array.from(
      { length: sheets }, (_, i) => `<sheet name="Sheet${i}" r:id="r${i}"/>`,
    ).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${Array.from(
      { length: sheets }, (_, i) => `<Relationship Id="r${i}" Target="worksheets/sheet${i}.xml"/>`,
    ).join('')}</Relationships>`);
    for (let i = 0; i < sheets; i += 1) {
      zip.file(`xl/worksheets/sheet${i}.xml`, worksheet(`<row>${Array.from(
        { length: cells }, (_, j) => `<c r="${String.fromCharCode(65 + j)}1" t="s"><v>0</v></c>`,
      ).join('')}</row>`));
    }
    return zip.generateAsync({ type: 'arraybuffer' });
  }

  it('charges every repeated shared-string reference within a sheet', async () => {
    await expect(xlsxSheets(await repeatedSharedWorkbook(1, 2)))
      .rejects.toBeInstanceOf(WorkbookPreviewLimitError);
  });

  it('rejects the whole workbook when a later sheet exceeds the remaining allowance', async () => {
    await expect(xlsxSheets(await repeatedSharedWorkbook(2, 1)))
      .rejects.toBeInstanceOf(WorkbookPreviewLimitError);
  });

  it('allows a fresh load after a workbook output refusal', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(await repeatedSharedWorkbook(2, 1)))
      .mockResolvedValueOnce(new Response(await workbook('<row><c><v>ok</v></c></row>'))));
    try {
      await expect(loadWorkbookSheets('/api/files/output-bound-retry'))
        .rejects.toBeInstanceOf(WorkbookPreviewLimitError);
      await expect(loadWorkbookSheets('/api/files/output-bound-retry'))
        .resolves.toEqual([{ name: 'Sheet1', csv: 'ok' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
