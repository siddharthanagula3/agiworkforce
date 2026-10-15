import JSZip from 'jszip';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const SHEET_PATH = 'xl/worksheets/sheet1.xml';

function parseXml(source: string): Document {
  return new DOMParser().parseFromString(source, 'application/xml');
}

function elementsByLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function paragraphText(paragraph: Element): string {
  return elementsByLocalName(paragraph, 't')
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();
}

export async function pptxToSlidesMarkdown(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, match: SLIDE_PATH.exec(path) }))
    .filter((entry): entry is { path: string; match: RegExpExecArray } => entry.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));

  const rendered: string[] = [];
  for (const slide of slides) {
    const xml = await zip.file(slide.path)?.async('string');
    if (!xml) continue;
    const titles: string[] = [];
    const body: string[] = [];
    const footers: string[] = [];
    for (const shape of elementsByLocalName(parseXml(xml), 'sp')) {
      const placeholder = elementsByLocalName(shape, 'ph')[0]?.getAttribute('type') ?? null;
      const lines = elementsByLocalName(shape, 'p').map(paragraphText).filter(Boolean);
      if (placeholder === 'title' || placeholder === 'ctrTitle') titles.push(...lines);
      else if (placeholder === 'ftr') footers.push(...lines);
      else if (placeholder !== 'dt' && placeholder !== 'sldNum') body.push(...lines);
    }
    const [firstBody, ...restBody] = body;
    const title = titles.length > 0 ? titles.join(' ') : firstBody;
    const bullets = titles.length > 0 ? body : restBody;
    rendered.push(
      [
        `# ${title ?? `Slide ${slide.match[1]}`}`,
        ...bullets.map((line) => `- ${line}`),
        ...footers.map((line) => `_${line}_`),
      ].join('\n'),
    );
  }
  return rendered.join('\n\n---\n\n');
}

function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? 'A';
  return [...letters].reduce((total, letter) => total * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const XLSX_NOT_CALCULATED = 'not calculated';

export async function xlsxFirstSheetToCsv(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = sharedXml
    ? elementsByLocalName(parseXml(sharedXml), 'si').map((item) =>
        elementsByLocalName(item, 't')
          .map((node) => node.textContent ?? '')
          .join(''),
      )
    : [];
  const sheetXml = await zip.file(SHEET_PATH)?.async('string');
  if (!sheetXml) return '';

  const rows: string[][] = [];
  for (const row of elementsByLocalName(parseXml(sheetXml), 'row')) {
    const cells: string[] = [];
    for (const cell of elementsByLocalName(row, 'c')) {
      const index = columnIndex(cell.getAttribute('r') ?? '');
      const type = cell.getAttribute('t');
      const cachedNode = elementsByLocalName(cell, 'v')[0];
      const raw = cachedNode?.textContent ?? '';
      const hasFormula = elementsByLocalName(cell, 'f').length > 0;
      const value =
        hasFormula && (!cachedNode || raw === '')
          ? XLSX_NOT_CALCULATED
          : type === 's'
            ? (shared[Number(raw)] ?? '')
            : type === 'inlineStr'
              ? elementsByLocalName(cell, 't')
                  .map((node) => node.textContent ?? '')
                  .join('')
              : raw;
      cells[index] = value;
    }
    rows.push(Array.from(cells, (value) => value ?? ''));
  }
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows
    .map((row) => Array.from({ length: width }, (_, index) => csvCell(row[index] ?? '')).join(','))
    .join('\n');
}
